"""HTTP API for Triverse Agent.

File uploads need python-multipart, already listed in agent/requirements.txt.
SESSION_API_KEY gates every /api/* route. /health stays open.
The browser UI is OpenHands Canvas, not this process.
"""

from __future__ import annotations

import hmac
import mimetypes
import os
import re
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from triverse_agent import __version__
from triverse_agent.agent_loop import run_agent
from triverse_agent.capabilities import CAPABILITIES
from triverse_agent.config import ALLOWED_MODELS, DEFAULT_MODEL, Settings, load_settings
from triverse_agent.errors import TriverseError
from triverse_agent.local_tools import list_files, safe_workspace_file
from triverse_agent.tools import FLOW_METHODS
from triverse_agent.triverse_client import TriverseClient

app = FastAPI(title="Triverse Agent", version=__version__)
_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_FLOW = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_TASK_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_UPLOAD_LIMIT = 200 * 1024 * 1024
_ACTIVE_SUFFIXES = {".html", ".htm", ".svg", ".xhtml", ".js", ".mjs", ".xml"}
_MODEL_TYPES = {
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
}


def settings() -> Settings:
    """Load process settings for this request."""

    return load_settings()


def _session_matches(presented: str | None, expected: str) -> bool:
    if not expected:
        return True
    if not presented:
        return False
    try:
        return hmac.compare_digest(presented, expected)
    except (TypeError, ValueError):
        return False


def require_session(
    x_session_api_key: str | None = Header(default=None),
    access: str | None = Query(default=None),
    triverse_session: str | None = Cookie(default=None),
    current: Settings = Depends(settings),
) -> Settings:
    """Require X-Session-API-Key when SESSION_API_KEY is set.

    A same-origin cookie or ``access`` query is accepted so the model viewer
    can fetch a file. /health is not wired to this dependency.
    """

    presented = x_session_api_key or triverse_session or access
    if not _session_matches(presented, current.session_api_key):
        raise HTTPException(status_code=401, detail="session key required")
    return current


def client_for(current: Settings) -> TriverseClient:
    """Build a client, or 503 before any network call when the key is empty."""

    if not current.triverse_api_key:
        raise HTTPException(status_code=503, detail="TRIVERSE_API_KEY is not set")
    return TriverseClient(current.triverse_api_key, current.triverse_base_url)


def _triverse_http(exc: TriverseError) -> HTTPException:
    status = exc.status
    message = exc.message or "Triverse request failed"
    if not isinstance(status, int) or status < 400 or status > 599:
        status = 400 if message.startswith("invalid ") else 502
    return HTTPException(status_code=status, detail=message)


@contextmanager
def _triverse(current: Settings) -> Iterator[TriverseClient]:
    client = client_for(current)
    try:
        yield client
    except TriverseError as exc:
        raise _triverse_http(exc) from exc
    finally:
        client.close()


def workspace_root(current: Settings) -> Path:
    root = Path(current.workspace_root)
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def _workspace_path(current: Settings, workspace_id: str, *, create: bool) -> Path:
    if _NAME.fullmatch(workspace_id) is None:
        raise HTTPException(status_code=400, detail="invalid workspace name")
    root = workspace_root(current)
    path = root / workspace_id
    if path.is_symlink():
        raise HTTPException(status_code=400, detail="invalid workspace name")
    if create:
        if path.exists() and not path.is_dir():
            raise HTTPException(status_code=400, detail="invalid workspace name")
        path.mkdir(exist_ok=True)
    elif not path.is_dir():
        raise HTTPException(status_code=404, detail="workspace not found")
    resolved = path.resolve()
    if resolved != root and root not in resolved.parents:
        raise HTTPException(status_code=400, detail="invalid workspace name")
    return resolved


def workspace_dir(current: Settings, workspace_id: str) -> Path:
    return _workspace_path(current, workspace_id, create=False)


class WorkspaceCreate(BaseModel):
    name: str


class QuoteRequest(BaseModel):
    flow_name: str
    payload: dict = Field(default_factory=dict)


class TaskRequest(BaseModel):
    method: str
    payload: dict = Field(default_factory=dict)
    confirm: bool = False


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str = DEFAULT_MODEL
    messages: list[ChatMessage]
    workspace_id: str


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    return response


@app.get("/health")
def health() -> dict:
    """Open even when SESSION_API_KEY is set."""

    return {"status": "ok"}


@app.get("/api/meta")
def meta(current: Settings = Depends(require_session)) -> dict:
    counts: dict[str, int] = {}
    for item in CAPABILITIES:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    return {
        "name": "Triverse Agent",
        "version": __version__,
        "models": ALLOWED_MODELS,
        "default_model": current.llm_model,
        "triverse_base_url": current.triverse_base_url,
        "llm_base_url": current.llm_base_url,
        "capability_counts": counts,
        "capabilities": CAPABILITIES,
    }


@app.get("/api/models")
def models(current: Settings = Depends(require_session)) -> dict:
    return {"default": current.llm_model, "models": ALLOWED_MODELS}


@app.get("/api/account")
def account(current: Settings = Depends(require_session)) -> dict:
    with _triverse(current) as client:
        return {"me": client.me(), "balance": client.balance()}


@app.get("/api/workspaces")
def list_workspaces(current: Settings = Depends(require_session)) -> dict:
    root = workspace_root(current)
    names = []
    for path in sorted(root.iterdir(), key=lambda item: item.name):
        if path.is_symlink() or not path.is_dir() or _NAME.fullmatch(path.name) is None:
            continue
        resolved = path.resolve()
        if resolved != root and root not in resolved.parents:
            continue
        names.append(path.name)
    return {"workspaces": names}


@app.post("/api/workspaces")
def create_workspace(body: WorkspaceCreate, current: Settings = Depends(require_session)) -> dict:
    path = _workspace_path(current, body.name, create=True)
    guide = path / "AGENTS.md"
    if not guide.exists():
        guide.write_text(
            "# 工作区\n\n"
            "Agent 新生成的说明文件以 triverse- 开头。\n"
            "用户上传的原始文件保持原名。\n"
            "付费生成先报价，确认后才提交。\n",
            encoding="utf-8",
        )
    return {"id": body.name}


@app.get("/api/workspaces/{workspace_id}")
def workspace_detail(workspace_id: str, current: Settings = Depends(require_session)) -> dict:
    path = workspace_dir(current, workspace_id)
    return {"id": workspace_id, "files": list_files(path)}


def _upload_name(raw: str | None) -> str:
    if not raw or "\x00" in raw or "/" in raw or "\\" in raw or ".." in raw:
        raise HTTPException(status_code=400, detail="invalid filename")
    if any(ord(char) < 32 for char in raw) or len(raw) > 200:
        raise HTTPException(status_code=400, detail="invalid filename")
    name = Path(raw).name
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="invalid filename")
    return name


async def _read_limited(upload: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        block = await upload.read(1024 * 1024)
        if not block:
            break
        total += len(block)
        if total > _UPLOAD_LIMIT:
            raise HTTPException(status_code=413, detail="file is too large")
        chunks.append(block)
    return b"".join(chunks)


def _write_replacing(directory: Path, filename: str, data: bytes) -> None:
    """Write via a temp file in the workspace, then replace the final name.

    replace() does not follow a symlink at the destination, so a planted
    link cannot redirect the bytes outside the workspace.
    """

    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    temporary = directory / f".upload-{uuid.uuid4().hex}"
    try:
        fd = os.open(temporary, flags, 0o644)
    except OSError as exc:
        raise HTTPException(status_code=400, detail="invalid filename") from exc
    try:
        view = memoryview(data)
        while view:
            written = os.write(fd, view)
            if written <= 0:
                raise OSError("short write")
            view = view[written:]
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="could not save file") from exc
    finally:
        os.close(fd)
    try:
        os.replace(temporary, directory / filename)
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="invalid filename") from exc


@app.post("/api/workspaces/{workspace_id}/upload")
async def upload_workspace_file(
    workspace_id: str,
    file: UploadFile = File(...),
    current: Settings = Depends(require_session),
) -> dict:
    folder = workspace_dir(current, workspace_id)
    filename = _upload_name(file.filename)
    destination = folder / filename
    if destination.is_symlink():
        raise HTTPException(status_code=400, detail="invalid filename")
    try:
        safe_workspace_file(folder, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid filename") from exc
    data = await _read_limited(file)
    _write_replacing(folder, filename, data)
    return {"path": filename, "size": len(data)}


def _file_response(target: Path) -> FileResponse:
    suffix = target.suffix.lower()
    if suffix in _MODEL_TYPES:
        media = _MODEL_TYPES[suffix]
        disposition = "inline"
    elif suffix in _ACTIVE_SUFFIXES:
        media = "application/octet-stream"
        disposition = "attachment"
    else:
        guessed, _ = mimetypes.guess_type(target.name)
        media = guessed or "application/octet-stream"
        if media.startswith("text/html") or media == "image/svg+xml":
            media = "application/octet-stream"
            disposition = "attachment"
        else:
            disposition = "inline"
    return FileResponse(
        target,
        media_type=media,
        filename=target.name,
        content_disposition_type=disposition,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "private, no-store",
        },
    )


@app.get("/api/workspaces/{workspace_id}/files/{file_path:path}")
def download_workspace_file(
    workspace_id: str,
    file_path: str,
    current: Settings = Depends(require_session),
) -> FileResponse:
    folder = workspace_dir(current, workspace_id)
    try:
        target = safe_workspace_file(folder, file_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid path") from exc
    if target.is_symlink() or not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return _file_response(target)


@app.post("/api/triverse/quote")
def quote_task(body: QuoteRequest, current: Settings = Depends(require_session)) -> dict:
    if _FLOW.fullmatch(body.flow_name) is None:
        raise HTTPException(status_code=400, detail="invalid flow name")
    with _triverse(current) as client:
        return client.quote(body.flow_name, body.payload)


@app.post("/api/triverse/tasks")
def create_named_task(body: TaskRequest, current: Settings = Depends(require_session)) -> dict:
    if body.method not in FLOW_METHODS:
        raise HTTPException(status_code=400, detail="unknown method")
    with _triverse(current) as client:
        runner = getattr(client, body.method)
        return runner(body.payload, confirm=body.confirm)


@app.get("/api/triverse/tasks/{task_uuid}")
def task_status(task_uuid: str, current: Settings = Depends(require_session)) -> dict:
    if _TASK_ID.fullmatch(task_uuid) is None:
        raise HTTPException(status_code=400, detail="invalid task id")
    with _triverse(current) as client:
        return {"task": client.task(task_uuid), "url": _maybe_url(client, task_uuid)}


def _maybe_url(client: TriverseClient, task_uuid: str) -> dict | None:
    try:
        return client.task_url(task_uuid)
    except TriverseError:
        return None


@app.post("/api/chat")
def chat(body: ChatRequest, current: Settings = Depends(require_session)) -> dict:
    if body.model not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail="model is not enabled")
    folder = workspace_dir(current, body.workspace_id)
    try:
        return run_agent(
            current,
            folder,
            body.model,
            [message.model_dump() for message in body.messages],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


