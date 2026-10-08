"""Streamable HTTP MCP server for the Triverse tools.

The server binds inside the Canvas pod. Paid tools still quote unless confirm
is true. It does not call api.hitem3d.ai.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from triverse_agent.agent_loop import _LazyTriverse
from triverse_agent.config import load_settings
from triverse_agent.tools import execute_tool, openai_tools

app = FastAPI(title="Triverse MCP", docs_url=None, redoc_url=None)
_SESSIONS: set[str] = set()
_PROTOCOL = "2025-03-26"


def _authorized(request: Request) -> bool:
    expected = load_settings().session_api_key
    if not expected:
        return True
    supplied = request.headers.get("x-session-api-key", "")
    return hmac.compare_digest(supplied, expected)


def _workspace_from(arguments: dict[str, Any]):
    from pathlib import Path

    settings = load_settings()
    root = Path(settings.workspace_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    raw = arguments.pop("workspace", "")
    if raw is None:
        raw = ""
    if not isinstance(raw, str):
        raise ValueError("workspace must be a string")
    name = raw.strip().replace("\\", "/")
    if name in {"", "."}:
        return root
    if "/" in name or name.startswith(".") or ".." in name:
        raise ValueError("workspace must be one directory name")
    path = (root / name).resolve()
    if path != root and root not in path.parents:
        raise ValueError("workspace escapes root")
    if not path.is_dir():
        raise FileNotFoundError(name)
    return path


def _tool_schemas() -> list[dict[str, Any]]:
    schemas = []
    for item in openai_tools():
        function = item["function"]
        parameters = function["parameters"]
        properties = dict(parameters["properties"])
        properties["workspace"] = {
            "type": "string",
            "description": "/projects 下的项目目录名。文件在工作区根目录时留空。",
        }
        schemas.append(
            {
                "name": function["name"],
                "description": function["description"],
                "inputSchema": {
                    "type": "object",
                    "properties": properties,
                    "additionalProperties": False,
                },
            }
        )
    return schemas


def _result(message_id: Any, result: dict[str, Any], session: str | None) -> JSONResponse:
    response = JSONResponse({"jsonrpc": "2.0", "id": message_id, "result": result})
    if session:
        response.headers["Mcp-Session-Id"] = session
    return response


def _error(message_id: Any, code: int, text: str, status: int = 200) -> JSONResponse:
    return JSONResponse(
        {"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": text}},
        status_code=status,
    )


def _handle(payload: dict[str, Any], session: str | None) -> Response:
    method = payload.get("method")
    message_id = payload.get("id")
    params = payload.get("params") or {}
    if not isinstance(params, dict):
        params = {}
    if method == "initialize":
        new_session = uuid.uuid4().hex
        _SESSIONS.add(new_session)
        requested = str(params.get("protocolVersion") or _PROTOCOL)
        version = requested if requested.startswith("2025-") or requested.startswith("2024-") else _PROTOCOL
        return _result(
            message_id,
            {
                "protocolVersion": version,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "triverse", "version": "1.0.0"},
            },
            new_session,
        )
    if method in {"notifications/initialized", "notifications/cancelled"}:
        return Response(status_code=202)
    if session and session not in _SESSIONS:
        return _error(message_id, -32001, "session not found", status=404)
    if method == "ping":
        return _result(message_id, {}, session)
    if method == "tools/list":
        return _result(message_id, {"tools": _tool_schemas()}, session)
    if method == "tools/call":
        name = str(params.get("name") or "")
        arguments = dict(params.get("arguments") or {})
        try:
            workspace = _workspace_from(arguments)
            outcome = execute_tool(
                name,
                arguments,
                settings=load_settings(),
                workspace=workspace,
                client=_LazyTriverse(load_settings()),
            )
        except (OSError, ValueError, KeyError, RuntimeError) as exc:
            outcome = {"error": str(exc)}
        failed = isinstance(outcome, dict) and "error" in outcome and len(outcome) == 1
        text = json.dumps(outcome, ensure_ascii=False, default=str)
        return _result(
            message_id,
            {"content": [{"type": "text", "text": text}], "isError": failed},
            session,
        )
    if message_id is None:
        return Response(status_code=202)
    return _error(message_id, -32601, f"unknown method {method}")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/mcp")
async def mcp_stream(request: Request) -> Response:
    if not _authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    async def events():
        yield ": open\n\n"
        while True:
            if await request.is_disconnected():
                break
            await asyncio.sleep(15)
            yield ": ping\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/mcp")
async def mcp_post(request: Request) -> Response:
    if not _authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        payload = await request.json()
    except Exception:
        return _error(None, -32700, "invalid json")
    if not isinstance(payload, dict):
        return _error(None, -32600, "expected one json-rpc object")
    session = request.headers.get("mcp-session-id")
    return _handle(payload, session)


@app.delete("/mcp")
async def mcp_delete(request: Request) -> Response:
    if not _authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    session = request.headers.get("mcp-session-id")
    if session:
        _SESSIONS.discard(session)
    return Response(status_code=200)
