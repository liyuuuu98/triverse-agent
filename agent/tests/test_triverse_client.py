"""Offline tests for the Triverse public API client. No live network."""

from __future__ import annotations

import inspect
import json
from collections.abc import Callable

import httpx
import pytest
from pydantic import ValidationError

from triverse_agent import ALLOWED_MODELS, Settings, load_settings
from triverse_agent.config import load_settings as load_settings_from_config
from triverse_agent.errors import TriverseError as TriverseErrorFromErrors
from triverse_agent.triverse_client import TASK_PATHS, TriverseClient, TriverseError

BASE = "https://api.triverse.ai/api/v1"
KEY = "unit-test-key"
ENV_NAMES = (
    "TRIVERSE_API_KEY",
    "TRIVERSE_BASE_URL",
    "LLM_API_KEY",
    "LLM_BASE_URL",
    "LLM_MODEL",
    "WORKSPACE_ROOT",
    "PORT",
    "SESSION_API_KEY",
    "HOST",
)
FLOWS = (
    ("image_to_model", "image-to-model"),
    ("image_to_mesh", "image-to-mesh"),
    ("image_to_artistic_mesh", "image-to-artistic-mesh"),
    ("text_to_model", "text-to-model"),
    ("text_to_mesh", "text-to-mesh"),
    ("texture_model", "texture-model"),
    ("text_to_texture", "text-to-texture"),
    ("model_remesh", "model-remesh"),
    ("convert_model_format", "convert-model-format"),
    ("model_preview_render", "model-preview-render"),
    ("image_generation", "image-generation"),
    ("prompt_optimize", "prompt-optimize"),
)


def _client(
    handler: Callable[[httpx.Request], httpx.Response], *, key: str = KEY
) -> TriverseClient:
    return TriverseClient(key, base_url=BASE, transport=httpx.MockTransport(handler))


def _auth(request: httpx.Request, key: str = KEY) -> None:
    assert request.headers["Authorization"] == f"Bearer {key}"
    assert request.headers["Accept"] == "application/json"
    assert key.encode() not in request.url.raw_path
    assert key not in str(request.url)


def _json_body(request: httpx.Request) -> dict[str, object]:
    parsed = json.loads(request.content.decode())
    assert isinstance(parsed, dict)
    return parsed


def test_imports_and_signatures() -> None:
    assert TriverseError is TriverseErrorFromErrors
    assert set(TASK_PATHS) == {name for name, _flow in FLOWS}
    for method_name, flow in FLOWS:
        assert TASK_PATHS[method_name] == f"/tasks/{flow}"
    assert load_settings is load_settings_from_config
    init_params = list(inspect.signature(TriverseClient).parameters)
    assert init_params[:3] == ["api_key", "base_url", "timeout"]
    assert TriverseClient.__init__.__defaults__ == (BASE, 60.0)
    create = inspect.signature(TriverseClient.create_task)
    assert create.parameters["quoted"].kind is inspect.Parameter.KEYWORD_ONLY
    assert create.parameters["quoted"].default is False
    error_init = inspect.signature(TriverseError.__init__)
    assert error_init.parameters["status"].kind is inspect.Parameter.KEYWORD_ONLY
    assert error_init.parameters["payload"].kind is inspect.Parameter.KEYWORD_ONLY
    for method_name, _flow in FLOWS:
        method = getattr(TriverseClient, method_name)
        confirm = inspect.signature(method).parameters["confirm"]
        assert confirm.kind is inspect.Parameter.KEYWORD_ONLY
        assert confirm.default is False
    client = TriverseClient(KEY)
    try:
        assert client.base_url == BASE
        assert KEY not in repr(client)
    finally:
        client.close()


def test_me_sends_auth_and_returns_full_json() -> None:
    seen: list[httpx.Request] = []
    body = {
        "code": 0,
        "message": "success",
        "data": {
            "id": "user-1",
            "email": "dev@example.com",
            "total_usable_credits": 12,
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=body)

    with _client(handler) as client:
        result = client.me()

    assert result == body
    assert result["data"]["id"] == "user-1"
    assert len(seen) == 1
    request = seen[0]
    _auth(request)
    assert request.method == "GET"
    assert str(request.url) == f"{BASE}/users/me"
    assert request.content == b""


def test_missing_or_null_code_is_success() -> None:
    payloads: list[dict[str, object]] = [
        {"message": "success", "data": {"balance": 1}},
        {"code": None, "message": "success", "data": {"balance": 2}},
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        _auth(request)
        assert request.url.path == "/api/v1/users/balance"
        return httpx.Response(200, json=payloads.pop(0))

    with _client(handler) as client:
        first = client.balance()
        second = client.balance()
    assert first["data"]["balance"] == 1
    assert "code" not in first
    assert second["code"] is None
    assert payloads == []


def test_create_task_requires_quote() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"unexpected request {request.method} {request.url}")

    with (
        _client(handler) as client,
        pytest.raises(
            TriverseError, match="^quote required before paid task$"
        ) as caught,
    ):
        client.create_task("/tasks/image-to-model", {"prompt": KEY}, quoted=False)
    assert str(caught.value) == "quote required before paid task"
    assert caught.value.status is None
    assert caught.value.payload is None
    assert KEY not in str(caught.value)


@pytest.mark.parametrize(("method_name", "flow"), FLOWS)
@pytest.mark.parametrize("confirm", [False, True])
def test_confirm_path_quotes_then_posts(
    method_name: str, flow: str, confirm: bool
) -> None:
    seen: list[httpx.Request] = []
    payload = {"prompt": "cat", "turbo": False}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        _auth(request)
        if request.url.path.endswith("/tasks/pricing/quote"):
            return httpx.Response(
                200,
                json={
                    "code": 0,
                    "message": "success",
                    "data": {
                        "flow_name": flow,
                        "cost_credits": 35,
                        "available_credits": 90,
                    },
                },
            )
        return httpx.Response(
            200,
            json={
                "code": 0,
                "message": "success",
                "data": {"task_uuid": "task-1", "flow_name": flow, "status": "PENDING"},
            },
        )

    with _client(handler) as client:
        result = getattr(client, method_name)(payload, confirm=confirm)

    assert next(request.method for request in seen) == "POST"
    assert seen[0].url.path == "/api/v1/tasks/pricing/quote"
    assert seen[0].headers["content-type"].startswith("application/json")
    quote_body = _json_body(seen[0])
    assert quote_body == {
        "flow_name": flow,
        "request_payload": payload,
        "params": payload,
    }
    assert result["quote"]["data"]["cost_credits"] == 35
    if confirm:
        assert len(seen) == 2
        assert seen[1].method == "POST"
        assert seen[1].url.path == f"/api/v1/tasks/{flow}"
        assert _json_body(seen[1]) == payload
        assert result["created"]["data"]["task_uuid"] == "task-1"
    else:
        assert len(seen) == 1
        assert result["created"] is None


def test_confirm_does_not_create_when_quote_fails() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(
            200, json={"code": 2010, "message": "Insufficient Credits"}
        )

    with (
        _client(handler) as client,
        pytest.raises(TriverseError, match="^Insufficient Credits$") as caught,
    ):
        client.text_to_model({"prompt": "a small rover"}, confirm=True)
    assert seen == ["/api/v1/tasks/pricing/quote"]
    assert caught.value.status == 200
    assert caught.value.payload == {"code": 2010, "message": "Insufficient Credits"}


def test_nonzero_code_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        _auth(request)
        return httpx.Response(
            200,
            json={
                "code": 1004,
                "message": "Invalid Parameters",
                "suggestion": "fix the file",
            },
        )

    with _client(handler) as client, pytest.raises(TriverseError) as caught:
        client.me()
    assert str(caught.value) == "Invalid Parameters"
    assert caught.value.status == 200
    assert caught.value.payload is not None
    assert caught.value.payload["code"] == 1004
    assert KEY not in str(caught.value)


def test_http_error_redacts_api_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={"code": 1005, "message": f"rejected {KEY}", "echo": {"nested": KEY}},
        )

    with _client(handler) as client, pytest.raises(TriverseError) as caught:
        client.balance()
    assert caught.value.status == 401
    assert KEY not in str(caught.value)
    assert "[redacted]" in str(caught.value)
    encoded = json.dumps(caught.value.payload)
    assert KEY not in encoded
    assert "[redacted]" in encoded


def test_task_post_is_not_retried_or_redirected() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        _auth(request)
        return httpx.Response(
            302,
            headers={"Location": f"{BASE}/tasks/model-remesh"},
            json={"message": "moved"},
        )

    with _client(handler) as client, pytest.raises(TriverseError) as caught:
        client.create_task(
            "/tasks/model-remesh", {"model_file": "tasks/a.glb"}, quoted=True
        )
    assert calls == 1
    assert caught.value.status == 302


def test_service_unavailable_is_single_attempt() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            503, json={"code": 5003, "message": "Service Unavailable"}
        )

    with (
        _client(handler) as client,
        pytest.raises(TriverseError, match="^Service Unavailable$"),
    ):
        client.create_task("/tasks/prompt-optimize", {"prompt": "sharper"}, quoted=True)
    assert calls == 1


def test_download_returns_raw_bytes() -> None:
    blob = b"glTF\x00model"

    def handler(request: httpx.Request) -> httpx.Response:
        _auth(request)
        assert request.method == "GET"
        assert request.url.path == "/api/v1/tasks/download/task_123"
        return httpx.Response(
            200, content=blob, headers={"content-type": "application/octet-stream"}
        )

    with _client(handler) as client:
        assert client.download_task("task_123") == blob


def test_download_strips_authorization_on_cross_origin_redirect() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.triverse.ai":
            _auth(request)
            return httpx.Response(
                302, headers={"Location": "https://cdn.example.test/model.glb"}
            )
        assert request.url.host == "cdn.example.test"
        assert "authorization" not in {name.lower() for name in request.headers}
        return httpx.Response(
            200, content=b"glb", headers={"content-type": "application/octet-stream"}
        )

    with _client(handler) as client:
        assert client.download_task("task_123") == b"glb"


def test_download_json_error_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"code": 4042, "message": "No Assets"})

    with (
        _client(handler) as client,
        pytest.raises(TriverseError, match="^No Assets$") as caught,
    ):
        client.download_task("missing-task")
    assert caught.value.status == 404


def test_upload_uses_file_field() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        _auth(request)
        assert KEY.encode() not in request.content
        assert b'name="file"' in request.content
        if request.url.path.endswith("/upload/image"):
            assert b'filename="cat.png"' in request.content
            assert b"image/png" in request.content
            assert b"\x89PNG" in request.content
            file_key = "tasks/cat.png"
        else:
            assert request.url.path.endswith("/upload/model")
            assert b'filename="mesh.glb"' in request.content
            assert b"model/gltf-binary" in request.content
            file_key = "tasks/mesh.glb"
        return httpx.Response(
            200,
            json={"code": 0, "message": "success", "data": {"file_key": file_key}},
        )

    with _client(handler) as client:
        result = client.upload_image(b"\x89PNG", "cat.png", "image/png")
        model = client.upload_model(b"glb", "mesh.glb", "model/gltf-binary")
    assert result["data"]["file_key"] == "tasks/cat.png"
    assert model["data"]["file_key"] == "tasks/mesh.glb"


def test_read_presign_and_task_paths() -> None:
    seen: list[tuple[str, str, dict[str, object] | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = _json_body(request) if request.content else None
        seen.append((request.method, request.url.path, body))
        _auth(request)
        if request.url.path.endswith("/tasks/download/abc"):
            return httpx.Response(
                200,
                content=b"abc",
                headers={"content-type": "application/octet-stream"},
            )
        return httpx.Response(
            200, json={"code": 0, "message": "success", "data": {"ok": True}}
        )

    with _client(handler) as client:
        assert client.me()["code"] == 0
        assert client.balance()["data"]["ok"] is True
        assert client.task("abc")["message"] == "success"
        assert client.task_url("abc")["data"]["ok"] is True
        assert client.download_task("abc") == b"abc"
        client.presigned_upload_url({"filename": "model.glb"})
        client.presigned_get_url({"file_key": "tasks/a.png", "filename": "a.png"})

    assert seen == [
        ("GET", "/api/v1/users/me", None),
        ("GET", "/api/v1/users/balance", None),
        ("GET", "/api/v1/tasks/abc", None),
        ("GET", "/api/v1/tasks/url/abc", None),
        ("GET", "/api/v1/tasks/download/abc", None),
        ("POST", "/api/v1/upload/presigned-upload-url", {"filename": "model.glb"}),
        (
            "POST",
            "/api/v1/upload/presigned-get-url",
            {"file_key": "tasks/a.png", "filename": "a.png"},
        ),
    ]


def test_quote_passes_server_envelope_through_without_mutation() -> None:
    seen: list[dict[str, object]] = []
    envelope = {
        "flow_name": "image-generation",
        "params": {"image_count": 2, "ai_model": "seedream_4_5"},
    }
    snapshot = json.loads(json.dumps(envelope))

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(_json_body(request))
        return httpx.Response(200, json={"code": 0, "message": "success", "data": {}})

    request_only = {"flow_name": "text-to-mesh", "request_payload": {"prompt": "x"}}
    with _client(handler) as client:
        client.quote("text-to-model", envelope)
        client.quote("image-to-model", None)
        client.quote("image-to-model", request_only)
    assert envelope == snapshot
    assert seen[0]["flow_name"] == "image-generation"
    assert seen[0]["params"] == envelope["params"]
    assert seen[0]["request_payload"] == envelope["params"]
    assert seen[1] == {
        "flow_name": "image-to-model",
        "request_payload": {},
        "params": {},
    }
    assert seen[2]["flow_name"] == "text-to-mesh"
    assert seen[2]["request_payload"] == {"prompt": "x"}
    assert seen[2]["params"] == {"prompt": "x"}


def test_invalid_ids_and_paths_do_not_call_network() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError(request.url)

    with _client(handler) as client:
        with pytest.raises(TriverseError, match="^invalid task id$"):
            client.task("../users/me")
        with pytest.raises(TriverseError, match="^invalid task path$"):
            client.create_task("/tasks/../users/me", {}, quoted=True)
        with pytest.raises(TriverseError, match="^invalid task path$"):
            client.create_task("/tasks/pricing/quote", {}, quoted=True)
        with pytest.raises(TriverseError, match="^invalid upload filename$"):
            client.upload_image(b"x", "../secret.png")


def test_network_failure_omits_api_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"boom {KEY}")

    with (
        _client(handler) as client,
        pytest.raises(TriverseError, match="^request failed: GET /users/me$") as caught,
    ):
        client.me()
    assert KEY not in str(caught.value)


def test_blank_api_key_is_rejected() -> None:
    with pytest.raises(TriverseError, match="^api key is required$"):
        TriverseClient("  ")
    with pytest.raises(TriverseError, match="^invalid api key$"):
        TriverseClient("bad\nkey")


@pytest.fixture
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)


def test_load_settings_defaults_and_overrides(
    clean_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    defaults = load_settings()
    assert defaults.triverse_api_key == ""
    assert defaults.llm_api_key == ""
    assert defaults.session_api_key == ""
    assert defaults.triverse_base_url == BASE
    assert defaults.llm_base_url == "https://api.teamorouter.cn/v1"
    assert defaults.llm_model == "claude-haiku-5-5"
    assert defaults.workspace_root == "./workspaces"
    assert defaults.host == "0.0.0.0"
    assert defaults.port == 8080
    assert ALLOWED_MODELS == [
        "gpt-6-astra",
        "gpt-6-sol",
        "claude-haiku-5-5",
        "claude-opus-5-5",
        "claude-sonnet-5-5",
        "deepseek-flash",
        "glm-5.3-flash",
    ]
    assert defaults.llm_model in ALLOWED_MODELS

    monkeypatch.setenv("TRIVERSE_API_KEY", " unit-test-key ")
    monkeypatch.setenv("TRIVERSE_BASE_URL", "https://example.test/api/v1/")
    monkeypatch.setenv("LLM_API_KEY", "llm-test-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://llm.example.test/v1")
    monkeypatch.setenv("LLM_MODEL", "glm-5.3-flash")
    monkeypatch.setenv("WORKSPACE_ROOT", "/tmp/workspaces")
    monkeypatch.setenv("PORT", " 9090 ")
    monkeypatch.setenv("SESSION_API_KEY", "session-test-key")
    monkeypatch.setenv("HOST", "127.0.0.1")
    settings = load_settings()
    assert isinstance(settings, Settings)
    assert settings.triverse_api_key == KEY
    assert settings.llm_api_key == "llm-test-key"
    assert settings.session_api_key == "session-test-key"
    assert settings.triverse_base_url == "https://example.test/api/v1/"
    assert settings.llm_base_url == "https://llm.example.test/v1"
    assert settings.llm_model == "glm-5.3-flash"
    assert settings.workspace_root == "/tmp/workspaces"
    assert settings.port == 9090
    assert settings.host == "0.0.0.0"
    rendered = repr(settings)
    assert KEY not in rendered
    assert "llm-test-key" not in rendered
    assert "session-test-key" not in rendered


def test_blank_env_is_ignored_and_bad_port_raises(
    clean_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PORT", "   ")
    monkeypatch.setenv("TRIVERSE_API_KEY", "  ")
    assert load_settings().port == 8080
    assert load_settings().triverse_api_key == ""
    monkeypatch.setenv("PORT", "nope")
    with pytest.raises(ValidationError):
        load_settings()


def test_unknown_llm_model_falls_back(
    clean_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LLM_MODEL", "not-a-real-model")
    assert load_settings().llm_model == "claude-haiku-5-5"
