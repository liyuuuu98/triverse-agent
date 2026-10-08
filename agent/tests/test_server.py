from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from triverse_agent import server
from triverse_agent.agent_loop import system_prompt_for
from triverse_agent.config import load_settings
from triverse_agent.local_tools import safe_workspace_file
from triverse_agent.tools import execute_tool


@pytest.fixture()
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("WORKSPACE_ROOT", str(tmp_path))
    monkeypatch.setenv("SESSION_API_KEY", "")
    monkeypatch.setenv("TRIVERSE_API_KEY", "test-key")
    monkeypatch.setenv("AGENT_ENGINE", "compatible")
    monkeypatch.setenv("LLM_MODEL", "gpt-6-sol")
    return TestClient(server.app)


def test_health_and_models(client):
    assert client.get("/health").json()["status"] == "ok"
    body = client.get("/api/models").json()
    assert body["default"] == "gpt-6-sol"
    assert "claude-sonnet-5-5" in body["models"]
    assert "gpt-4o" not in body["models"]


def test_chat_rejects_unknown_model(client):
    created = client.post("/api/workspaces", json={"name": "demo"})
    assert created.status_code == 200
    response = client.post(
        "/api/chat",
        json={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}], "workspace_id": "demo"},
    )
    assert response.status_code == 400


def test_workspace_rejects_traversal(client):
    assert client.post("/api/workspaces", json={"name": "../etc"}).status_code == 400
    client.post("/api/workspaces", json={"name": "box"})
    response = client.post(
        "/api/workspaces/box/upload",
        files={"file": ("../secret.txt", b"nope", "text/plain")},
    )
    assert response.status_code == 400


def test_unknown_task_method(client):
    response = client.post("/api/triverse/tasks", json={"method": "print_send", "payload": {}})
    assert response.status_code == 400


def test_quote_uses_client(client, monkeypatch):
    class Fake:
        def quote(self, flow_name, payload):
            return {"code": 0, "data": {"flow_name": flow_name, "cost_credits": 3}}

        def close(self):
            return None

    monkeypatch.setattr(server, "client_for", lambda settings: Fake())
    response = client.post("/api/triverse/quote", json={"flow_name": "text-to-model", "payload": {}})
    assert response.status_code == 200
    assert response.json()["data"]["cost_credits"] == 3


def test_session_key_required(monkeypatch, tmp_path):
    monkeypatch.setenv("WORKSPACE_ROOT", str(tmp_path))
    monkeypatch.setenv("SESSION_API_KEY", "gate")
    client = TestClient(server.app)
    assert client.get("/health").status_code == 200
    assert client.get("/api/models").status_code == 401
    assert client.get("/api/models", headers={"X-Session-API-Key": "gate"}).status_code == 200


def test_session_cookie_is_accepted(monkeypatch, tmp_path):
    monkeypatch.setenv("WORKSPACE_ROOT", str(tmp_path))
    monkeypatch.setenv("SESSION_API_KEY", "gate")
    client = TestClient(server.app)
    client.cookies.set("triverse_session", "gate")
    assert client.get("/api/models").status_code == 200


def test_quote_path_does_not_require_confirm(client, monkeypatch):
    seen = {}

    class Fake:
        def text_to_model(self, payload, confirm=False):
            seen["confirm"] = confirm
            seen["payload"] = payload
            return {"quote": {"data": {"cost_credits": 1}}, "created": None}

        def close(self):
            return None

    monkeypatch.setattr(server, "client_for", lambda settings: Fake())
    response = client.post(
        "/api/triverse/tasks",
        json={"method": "text_to_model", "payload": {"prompt": "cup"}},
    )
    assert response.status_code == 200
    assert response.json()["created"] is None
    assert seen["confirm"] is False
    assert seen["payload"] == {"prompt": "cup"}


def test_invalid_flow_and_task_id(client):
    assert client.post("/api/triverse/quote", json={"flow_name": "../x", "payload": {}}).status_code == 400
    assert client.get("/api/triverse/tasks/not-ok!").status_code == 400


def test_workspace_writes_agents_guide(client, tmp_path):
    assert client.post("/api/workspaces", json={"name": "notes"}).status_code == 200
    text = (tmp_path / "notes" / "AGENTS.md").read_text(encoding="utf-8")
    assert "triverse-" in text


def test_upload_roundtrip_and_symlink_escape(client, tmp_path):
    assert client.post("/api/workspaces", json={"name": "box"}).status_code == 200
    uploaded = client.post(
        "/api/workspaces/box/upload",
        files={"file": ("cup.glb", b"glTF-bytes", "application/octet-stream")},
    )
    assert uploaded.status_code == 200
    downloaded = client.get("/api/workspaces/box/files/cup.glb")
    assert downloaded.status_code == 200
    assert downloaded.content == b"glTF-bytes"
    assert downloaded.headers["content-type"].startswith("model/gltf-binary")

    outside = tmp_path / "outside.txt"
    outside.write_text("safe", encoding="utf-8")
    (tmp_path / "box" / "link.txt").symlink_to(outside)
    escaped = client.post(
        "/api/workspaces/box/upload",
        files={"file": ("link.txt", b"pwned", "text/plain")},
    )
    assert escaped.status_code == 400
    assert outside.read_text(encoding="utf-8") == "safe"
    with pytest.raises(ValueError):
        safe_workspace_file(tmp_path / "box", "../outside.txt")
    traversed = client.get("/api/workspaces/box/files/%2e%2e/outside.txt")
    assert b"safe" not in traversed.content


def test_account_without_key_is_unavailable(monkeypatch, tmp_path):
    monkeypatch.setenv("WORKSPACE_ROOT", str(tmp_path))
    monkeypatch.setenv("SESSION_API_KEY", "")
    monkeypatch.setenv("TRIVERSE_API_KEY", "")
    client = TestClient(server.app)
    assert client.get("/api/account").status_code == 503


def test_meta_hides_secret_and_names_gaps(client):
    response = client.get("/api/meta")
    assert response.status_code == 200
    assert "test-key" not in response.text
    body = response.json()
    assert "triverse_api_key" not in body
    assert body["default_model"] == "gpt-6-sol"
    assert body["capability_counts"]["已接"] >= 12
    missing = " ".join(item["name"] for item in body["capabilities"] if item["status"] == "尚未具备")
    for token in ("multiview", "relief", "split", "multicolor", "auto-rig", "watertight", "LOD", "sapiens", "Electron"):
        assert token in missing


def test_execute_tool_confirm_string_does_not_spend(tmp_path):
    calls = []

    class Fake:
        def text_to_model(self, payload, confirm=False):
            calls.append(confirm)
            created = {"id": "made"} if confirm is True else None
            return {"quote": {"ok": True}, "created": created}

    settings = load_settings()
    quoted = execute_tool(
        "text_to_model",
        {"prompt": "cup", "confirm": "false"},
        settings=settings,
        workspace=tmp_path,
        client=Fake(),
    )
    assert calls == [False]
    assert quoted["created"] is None
    omitted = execute_tool(
        "text_to_model",
        {"prompt": "cup"},
        settings=settings,
        workspace=tmp_path,
        client=Fake(),
    )
    assert omitted["created"] is None
    assert calls == [False, False]
    created = execute_tool(
        "text_to_model",
        {"prompt": "cup", "confirm": True},
        settings=settings,
        workspace=tmp_path,
        client=Fake(),
    )
    assert calls[-1] is True
    assert created["created"]["id"] == "made"


def test_system_prompt_and_skills(tmp_path):
    skills = Path(__file__).resolve().parents[1] / "skills"
    text = system_prompt_for(load_settings(), tmp_path, skills)
    for token in (
        "你是 Triverse Agent",
        "尚未具备",
        "multiview",
        "relief",
        "split",
        "multicolor",
        "auto-rig",
        "watertight",
        "LOD",
        "sapiens",
        "physical printer",
        "Electron",
        "confirm",
        "图生模型",
    ):
        assert token in text, token
    local = (skills / "local-geometry.md").read_text(encoding="utf-8")
    assert "BLENDER_BIN" in local
    assert "未安装" in local
    assert "hitem3d" not in (skills / "gaps.md").read_text(encoding="utf-8").lower()
    titles = ("图生模型", "文生模型", "贴图", "重网格", "格式转换", "预览渲染", "文生图", "提示词优化", "工作区", "本地几何", "尚未具备")
    blob = "\n".join(path.read_text(encoding="utf-8") for path in skills.glob("*.md"))
    for title in titles:
        assert title in blob


def test_html_upload_is_not_served_as_html(client):
    assert client.post("/api/workspaces", json={"name": "box"}).status_code == 200
    uploaded = client.post(
        "/api/workspaces/box/upload",
        files={"file": ("note.html", b"<script>alert(1)</script>", "text/html")},
    )
    assert uploaded.status_code == 200
    downloaded = client.get("/api/workspaces/box/files/note.html")
    assert downloaded.status_code == 200
    assert "text/html" not in downloaded.headers["content-type"]
    assert "attachment" in downloaded.headers["content-disposition"]


def test_auto_engine_does_not_retry_after_openhands_starts(monkeypatch, tmp_path):
    monkeypatch.setenv("AGENT_ENGINE", "auto")
    monkeypatch.setenv("LLM_API_KEY", "local-test")
    from triverse_agent import agent_loop

    def explode(*_args, **_kwargs):
        raise RuntimeError("already spent")

    def compatible(*_args, **_kwargs):
        raise AssertionError("compatible loop must not run after OpenHands failed")

    monkeypatch.setattr(agent_loop, "_run_openhands", explode)
    monkeypatch.setattr(agent_loop, "_run_compatible", compatible)
    with pytest.raises(RuntimeError, match="already spent"):
        agent_loop.run_agent(
            load_settings(),
            tmp_path,
            "gpt-6-sol",
            [{"role": "user", "content": "hi"}],
        )


def test_auto_engine_falls_back_when_openhands_is_unavailable(monkeypatch, tmp_path):
    monkeypatch.setenv("AGENT_ENGINE", "auto")
    from triverse_agent import agent_loop

    def missing(*_args, **_kwargs):
        raise agent_loop.OpenHandsUnavailable("no sdk")

    def compatible(*_args, **_kwargs):
        return {"reply": "local", "model": "gpt-6-sol", "tool_calls": []}

    monkeypatch.setattr(agent_loop, "_run_openhands", missing)
    monkeypatch.setattr(agent_loop, "_run_compatible", compatible)
    result = agent_loop.run_agent(
        load_settings(),
        tmp_path,
        "gpt-6-sol",
        [{"role": "user", "content": "hi"}],
    )
    assert result["reply"] == "local"
