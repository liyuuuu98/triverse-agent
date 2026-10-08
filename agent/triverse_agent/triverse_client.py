"""Synchronous client for the Triverse public API (https://api.triverse.ai).

Blocking: do not call it directly on an asyncio event loop.
Task POSTs are not retried and are not sent until the caller has quoted.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import Mapping
from typing import Any, Self
from urllib.parse import urlsplit

import httpx

from triverse_agent.errors import TriverseError

_DEFAULT_BASE_URL = "https://api.triverse.ai/api/v1"
_QUOTE_PATH = "/tasks/pricing/quote"
_REDACTED = "[redacted]"
_BAD_CONTENT_TYPE_CHARS = frozenset('";\\')
_FLOW_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_TASK_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_TASK_PATH_RE = re.compile(
    r"^/tasks/[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*$"
)
_MAX_REDIRECTS = 5

JsonObject = dict[str, Any]
UploadFile = tuple[str, bytes, str]


def _require_api_key(api_key: object) -> str:
    if not isinstance(api_key, str):
        raise TriverseError("api key is required")
    key = api_key.strip()
    if not key:
        raise TriverseError("api key is required")
    if any(char in key for char in "\r\n\x00"):
        raise TriverseError("invalid api key")
    return key


def _require_base_url(base_url: object) -> str:
    if not isinstance(base_url, str):
        raise TriverseError("invalid base url")
    raw = base_url.strip()
    if not raw or len(raw) > 2048:
        raise TriverseError("invalid base url")
    parsed = urlsplit(raw)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        raise TriverseError("invalid base url")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise TriverseError("invalid base url")
    path = parsed.path.rstrip("/")
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def _require_timeout(timeout: object) -> float:
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)):
        raise TriverseError("timeout must be positive")
    value = float(timeout)
    if not math.isfinite(value) or value <= 0:
        raise TriverseError("timeout must be positive")
    return value


def _require_flow_name(flow_name: object) -> str:
    if not isinstance(flow_name, str) or _FLOW_RE.fullmatch(flow_name) is None:
        raise TriverseError("invalid flow name")
    return flow_name


def _require_object(value: object, field_name: str) -> JsonObject:
    if not isinstance(value, dict):
        raise TriverseError(f"{field_name} must be an object")
    if any(not isinstance(key, str) for key in value):
        raise TriverseError(f"{field_name} must be an object")
    return dict(value)


def _optional_object(value: object, field_name: str) -> JsonObject:
    if value is None:
        return {}
    return _require_object(value, field_name)


def _require_task_id(task_uuid: object) -> str:
    if not isinstance(task_uuid, str) or _TASK_ID_RE.fullmatch(task_uuid) is None:
        raise TriverseError("invalid task id")
    return task_uuid


def _require_task_path(path: object) -> str:
    if not isinstance(path, str) or _TASK_PATH_RE.fullmatch(path) is None:
        raise TriverseError("invalid task path")
    if path == _QUOTE_PATH:
        raise TriverseError("invalid task path")
    return path


def _safe_filename(filename: object) -> str:
    if not isinstance(filename, str):
        raise TriverseError("invalid upload filename")
    name = filename.strip()
    if (
        not name
        or len(name) > 255
        or name in {".", ".."}
        or "/" in name
        or "\\" in name
        or any(ord(char) < 32 or char in {'"', ";"} for char in name)
    ):
        raise TriverseError("invalid upload filename")
    return name


def _safe_content_type(content_type: object) -> str:
    if not isinstance(content_type, str):
        raise TriverseError("invalid content type")
    value = content_type.strip().lower()
    # Bare media type only. A parameter or space can break the multipart header.
    if not value or len(value) > 200 or value.count("/") != 1:
        raise TriverseError("invalid content type")
    left, right = value.split("/", 1)
    if not left or not right:
        raise TriverseError("invalid content type")
    if any(ord(char) < 33 or char in _BAD_CONTENT_TYPE_CHARS for char in value):
        raise TriverseError("invalid content type")
    return value


def _as_bytes(data: object) -> bytes:
    if isinstance(data, bytes):
        return data
    if isinstance(data, bytearray):
        return bytes(data)
    raise TriverseError("upload data must be bytes")


def _quote_body(flow_name: str, payload: JsonObject | None) -> JsonObject:
    """Build the pricing quote document.

    The client contract sends ``request_payload``. The public API prices
    ``params`` and ignores ``request_payload``, so the same object is sent
    under both keys. A document that already has a flow name plus either
    field is passed through instead of wrapped again.
    """
    raw = _optional_object(payload, "payload")
    has_flow = "flow_name" in raw or "flowName" in raw
    has_nested = "request_payload" in raw or "params" in raw
    if has_flow and has_nested:
        body = dict(raw)
        if "flow_name" not in body:
            nested_name = body.get("flowName")
            body["flow_name"] = (
                nested_name if isinstance(nested_name, str) else flow_name
            )
        _require_flow_name(body.get("flow_name"))
        request_payload = body.get("request_payload")
        params = body.get("params")
        if not isinstance(request_payload, dict) and isinstance(params, dict):
            body["request_payload"] = dict(params)
        elif isinstance(request_payload, dict) and not isinstance(params, dict):
            body["params"] = dict(request_payload)
        return body
    request_payload = raw
    return {
        "flow_name": flow_name,
        "request_payload": request_payload,
        "params": dict(request_payload),
    }


TASK_PATHS = {
    "image_to_model": "/tasks/image-to-model",
    "image_to_mesh": "/tasks/image-to-mesh",
    "image_to_artistic_mesh": "/tasks/image-to-artistic-mesh",
    "text_to_model": "/tasks/text-to-model",
    "text_to_mesh": "/tasks/text-to-mesh",
    "texture_model": "/tasks/texture-model",
    "text_to_texture": "/tasks/text-to-texture",
    "model_remesh": "/tasks/model-remesh",
    "convert_model_format": "/tasks/convert-model-format",
    "model_preview_render": "/tasks/model-preview-render",
    "image_generation": "/tasks/image-generation",
    "prompt_optimize": "/tasks/prompt-optimize",
}


class TriverseClient:
    """Sync HTTP client for the Triverse ``/api/v1`` surface.

    Convenience generation methods always quote. They call ``create_task``
    only when ``confirm`` is exactly ``True``, then return
    ``{"quote": ..., "created": ...}``. Otherwise ``created`` is ``None``.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = _DEFAULT_BASE_URL,
        timeout: float = 60.0,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._api_key = _require_api_key(api_key)
        self._base_url = _require_base_url(base_url)
        self._timeout = _require_timeout(timeout)
        # Authorization is attached per request so it is not stored on the
        # shared client headers object.
        self._client = httpx.Client(
            timeout=self._timeout,
            transport=transport,
            trust_env=False,
            follow_redirects=False,
            max_redirects=_MAX_REDIRECTS,
            headers={"User-Agent": "triverse-agent"},
        )

    @property
    def base_url(self) -> str:
        """API origin plus the ``/api/v1`` prefix, without a trailing slash."""
        return self._base_url

    def close(self) -> None:
        """Close the underlying HTTP connection pool."""
        self._client.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: object,
    ) -> None:
        self.close()

    def __repr__(self) -> str:
        return f"TriverseClient(base_url={self._base_url!r})"

    def me(self) -> JsonObject:
        """GET /users/me. Returns the full JSON object."""
        return self._request_json("GET", "/users/me")

    def balance(self) -> JsonObject:
        """GET /users/balance. Returns the full JSON object."""
        return self._request_json("GET", "/users/balance")

    def quote(self, flow_name: str, payload: JsonObject | None = None) -> JsonObject:
        """POST /tasks/pricing/quote. Does not create a task or freeze credits."""
        flow = _require_flow_name(flow_name)
        body = _quote_body(flow, payload)
        return self._request_json("POST", _QUOTE_PATH, json_body=body)

    def upload_image(
        self,
        data: bytes,
        filename: str,
        content_type: str = "application/octet-stream",
    ) -> JsonObject:
        """POST /upload/image. Returns the full JSON object."""
        return self._upload("/upload/image", data, filename, content_type)

    def upload_model(
        self,
        data: bytes,
        filename: str,
        content_type: str = "application/octet-stream",
    ) -> JsonObject:
        """POST /upload/model. Returns the full JSON object."""
        return self._upload("/upload/model", data, filename, content_type)

    def presigned_upload_url(self, payload: JsonObject) -> JsonObject:
        """POST /upload/presigned-upload-url. Returns the full JSON object."""
        body = _require_object(payload, "payload")
        return self._request_json(
            "POST", "/upload/presigned-upload-url", json_body=body
        )

    def presigned_get_url(self, payload: JsonObject) -> JsonObject:
        """POST /upload/presigned-get-url. Returns the full JSON object."""
        body = _require_object(payload, "payload")
        return self._request_json("POST", "/upload/presigned-get-url", json_body=body)

    def create_task(
        self, path: str, payload: JsonObject, *, quoted: bool = False
    ) -> JsonObject:
        """POST a paid ``/tasks/*`` path.

        ``quoted`` must be exactly ``True`` after a successful ``quote``.
        Every ``/tasks/*`` create path is gated; quote and uploads are separate.
        The POST is not retried and redirects are not followed.
        """
        if quoted is not True:
            raise TriverseError("quote required before paid task")
        task_path = _require_task_path(path)
        body = _require_object(payload, "payload")
        return self._request_json("POST", task_path, json_body=body)

    def task(self, task_uuid: str) -> JsonObject:
        """GET /tasks/{task_uuid}. Returns the full JSON object."""
        return self._request_json("GET", f"/tasks/{_require_task_id(task_uuid)}")

    def task_url(self, task_uuid: str) -> JsonObject:
        """GET /tasks/url/{task_uuid}. Returns the full JSON object."""
        return self._request_json("GET", f"/tasks/url/{_require_task_id(task_uuid)}")

    def download_task(self, task_uuid: str) -> bytes:
        """GET /tasks/download/{task_uuid} and return the raw body.

        Redirects are followed. httpx drops Authorization on cross-origin redirects.
        """
        path = f"/tasks/download/{_require_task_id(task_uuid)}"
        response = self._send("GET", path, follow_redirects=True)
        body = self._interpret(response, raw=True)
        if not isinstance(body, bytes):
            raise TriverseError("expected binary response", status=response.status_code)
        return body

    def image_to_model(
        self, payload: JsonObject, *, confirm: bool = False
    ) -> JsonObject:
        """Quote image-to-model. Create the task only when confirm is True."""
        return self._run_flow("image-to-model", payload, confirm=confirm)

    def image_to_mesh(
        self, payload: JsonObject, *, confirm: bool = False
    ) -> JsonObject:
        """Quote image-to-mesh. Create the task only when confirm is True."""
        return self._run_flow("image-to-mesh", payload, confirm=confirm)

    def image_to_artistic_mesh(
        self, payload: JsonObject, *, confirm: bool = False
    ) -> JsonObject:
        """Quote image-to-artistic-mesh. Create the task only when confirm is True."""
        return self._run_flow("image-to-artistic-mesh", payload, confirm=confirm)

    def text_to_model(
        self, payload: JsonObject, *, confirm: bool = False
    ) -> JsonObject:
        """Quote text-to-model. Create the task only when confirm is True."""
        return self._run_flow("text-to-model", payload, confirm=confirm)

    def text_to_mesh(self, payload: JsonObject, *, confirm: bool = False) -> JsonObject:
        """Quote text-to-mesh. Create the task only when confirm is True."""
        return self._run_flow("text-to-mesh", payload, confirm=confirm)

    def texture_model(
        self, payload: JsonObject, *, confirm: bool = False
    ) -> JsonObject:
        """Quote texture-model. Create the task only when confirm is True."""
        return self._run_flow("texture-model", payload, confirm=confirm)

    def text_to_texture(
        self, payload: JsonObject, *, confirm: bool = False
    ) -> JsonObject:
        """Quote text-to-texture. Create the task only when confirm is True."""
        return self._run_flow("text-to-texture", payload, confirm=confirm)

    def model_remesh(self, payload: JsonObject, *, confirm: bool = False) -> JsonObject:
        """Quote model-remesh. Create the task only when confirm is True."""
        return self._run_flow("model-remesh", payload, confirm=confirm)

    def convert_model_format(
        self, payload: JsonObject, *, confirm: bool = False
    ) -> JsonObject:
        """Quote convert-model-format. Create the task only when confirm is True."""
        return self._run_flow("convert-model-format", payload, confirm=confirm)

    def model_preview_render(
        self, payload: JsonObject, *, confirm: bool = False
    ) -> JsonObject:
        """Quote model-preview-render. Create the task only when confirm is True."""
        return self._run_flow("model-preview-render", payload, confirm=confirm)

    def image_generation(
        self, payload: JsonObject, *, confirm: bool = False
    ) -> JsonObject:
        """Quote image-generation. Create the task only when confirm is True."""
        return self._run_flow("image-generation", payload, confirm=confirm)

    def prompt_optimize(
        self, payload: JsonObject, *, confirm: bool = False
    ) -> JsonObject:
        """Quote prompt-optimize. Create the task only when confirm is True."""
        return self._run_flow("prompt-optimize", payload, confirm=confirm)

    def _run_flow(
        self, flow_name: str, payload: JsonObject, *, confirm: bool
    ) -> JsonObject:
        flow = _require_flow_name(flow_name)
        body = _require_object(payload, "payload")
        quote_result = self.quote(flow, body)
        if confirm is not True:
            return {"quote": quote_result, "created": None}
        created = self.create_task(f"/tasks/{flow}", body, quoted=True)
        return {"quote": quote_result, "created": created}

    def _upload(
        self, path: str, data: bytes, filename: str, content_type: str
    ) -> JsonObject:
        # Multipart field name is "file" (POST /upload/image and POST /upload/model).
        files: dict[str, UploadFile] = {
            "file": (
                _safe_filename(filename),
                _as_bytes(data),
                _safe_content_type(content_type),
            ),
        }
        return self._request_json("POST", path, files=files)

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        json_body: JsonObject | None = None,
        files: Mapping[str, UploadFile] | None = None,
    ) -> JsonObject:
        response = self._send(
            method, path, json_body=json_body, files=files, follow_redirects=False
        )
        parsed = self._interpret(response, raw=False)
        if not isinstance(parsed, dict):
            raise TriverseError("expected JSON object", status=response.status_code)
        return parsed

    def _send(
        self,
        method: str,
        path: str,
        *,
        json_body: JsonObject | None = None,
        files: Mapping[str, UploadFile] | None = None,
        follow_redirects: bool = False,
    ) -> httpx.Response:
        if json_body is not None:
            self._ensure_json(json_body, method, path)
        try:
            return self._client.request(
                method,
                self._url(path),
                json=json_body,
                files=dict(files) if files is not None else None,
                headers=self._request_headers(),
                follow_redirects=follow_redirects,
            )
        except TypeError:
            raise TriverseError(
                self._redact(f"request body is not serializable: {method} {path}")
            ) from None
        except httpx.TimeoutException:
            raise TriverseError(
                self._redact(f"request timed out: {method} {path}")
            ) from None
        except httpx.HTTPError:
            raise TriverseError(
                self._redact(f"request failed: {method} {path}")
            ) from None

    def _interpret(self, response: httpx.Response, *, raw: bool) -> JsonObject | bytes:
        data = self._parse_body(response, raw=raw)
        if self._is_error(response, data):
            payload = data if isinstance(data, dict) else None
            scrubbed = self._scrub(payload) if payload is not None else None
            raise TriverseError(
                self._error_message(response, payload),
                status=response.status_code,
                payload=scrubbed if isinstance(scrubbed, dict) else None,
            )
        if raw:
            return bytes(response.content)
        if not isinstance(data, dict):
            raise TriverseError("expected JSON object", status=response.status_code)
        return data

    def _parse_body(self, response: httpx.Response, *, raw: bool) -> Any:
        content_type = response.headers.get("content-type", "").lower()
        wants_json = (
            (not raw) or ("json" in content_type) or response.status_code >= 400
        )
        if not wants_json:
            return None
        if not response.content:
            return {} if response.status_code < 300 else None
        try:
            return response.json()
        except json.JSONDecodeError:
            return None

    @staticmethod
    def _is_error(response: httpx.Response, data: Any) -> bool:
        # 3xx is not a successful API result when redirects were not followed.
        if response.status_code >= 300:
            return True
        return bool(
            isinstance(data, dict)
            and "code" in data
            and data.get("code") not in (0, None)
        )

    def _error_message(self, response: httpx.Response, data: JsonObject | None) -> str:
        if data is not None:
            for field in ("message", "suggestion", "detail"):
                value = data.get(field)
                if isinstance(value, str) and value.strip():
                    return self._redact(value.strip())
        return f"Triverse request failed with HTTP {response.status_code}"

    def _ensure_json(self, body: JsonObject, method: str, path: str) -> None:
        try:
            json.dumps(body, allow_nan=False)
        except (TypeError, ValueError):
            raise TriverseError(
                self._redact(f"request body is not serializable: {method} {path}")
            ) from None

    def _request_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
        }

    def _url(self, path: str) -> str:
        # Join manually. httpx drops a base path when the request path starts with '/'.
        if not path.startswith("/") or path.startswith("//"):
            raise TriverseError("invalid path")
        if any(part in {"", ".", ".."} for part in path.split("/")[1:]):
            raise TriverseError("invalid path")
        if "\\" in path or "?" in path or "#" in path or "://" in path:
            raise TriverseError("invalid path")
        return f"{self._base_url}{path}"

    def _redact(self, text: str) -> str:
        return text.replace(self._api_key, _REDACTED)

    def _scrub(self, value: Any) -> Any:
        if isinstance(value, str):
            return self._redact(value)
        if isinstance(value, list):
            return [self._scrub(item) for item in value]
        if isinstance(value, dict):
            scrubbed: dict[Any, Any] = {}
            for key, item in value.items():
                scrubbed_key = self._scrub(key) if isinstance(key, str) else key
                scrubbed[scrubbed_key] = self._scrub(item)
            return scrubbed
        return value


__all__ = ["TASK_PATHS", "TriverseClient", "TriverseError"]
