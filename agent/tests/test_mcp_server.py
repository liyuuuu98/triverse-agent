"""MCP protocol for the Canvas sidecar. No network and no paid task."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import trimesh
from fastapi.testclient import TestClient

from triverse_agent import mcp_server


@pytest.fixture()
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("WORKSPACE_ROOT", str(tmp_path))
    monkeypatch.setenv("SESSION_API_KEY", "")
    monkeypatch.setenv("TRIVERSE_API_KEY", "")
    monkeypatch.delenv("BLENDER_BIN", raising=False)
    mesh = trimesh.creation.box(extents=(4, 4, 4))
    mesh.export(tmp_path / "box.glb")
    return tmp_path


def test_initialize_lists_tools_and_local_call(workspace: Path) -> None:
    client = TestClient(mcp_server.app)
    opened = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
    assert opened.status_code == 200
    session = opened.headers["mcp-session-id"]
    assert opened.json()["result"]["protocolVersion"]
    listed = client.post(
        "/mcp",
        headers={"mcp-session-id": session},
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    )
    tools = {item["name"]: item for item in listed.json()["result"]["tools"]}
    assert "image_to_model" in tools
    assert "taubin_smooth" in tools
    assert tools["mesh_audit"]["inputSchema"]["properties"]["workspace"]["type"] == "string"
    called = client.post(
        "/mcp",
        headers={"mcp-session-id": session},
        json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "mesh_audit", "arguments": {"path": "box.glb", "workspace": ""}},
        },
    )
    body = called.json()["result"]
    assert body["isError"] is False
    payload = json.loads(body["content"][0]["text"])
    assert payload["faces"] > 0
    assert (workspace / "box.glb").is_file()


def test_session_key_rejects_missing_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SESSION_API_KEY", "test-session")
    client = TestClient(mcp_server.app)
    denied = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    assert denied.status_code == 401
    allowed = client.post(
        "/mcp",
        headers={"x-session-api-key": "test-session"},
        json={"jsonrpc": "2.0", "id": 1, "method": "initialize"},
    )
    assert allowed.status_code == 200


def test_notification_and_unknown_session(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SESSION_API_KEY", "")
    monkeypatch.setenv("WORKSPACE_ROOT", str(tmp_path))
    client = TestClient(mcp_server.app)
    note = client.post("/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"})
    assert note.status_code == 202
    assert note.content == b""
    missing = client.post(
        "/mcp",
        headers={"mcp-session-id": "missing"},
        json={"jsonrpc": "2.0", "id": 4, "method": "tools/list"},
    )
    assert missing.status_code == 404
    assert client.get("/health").json() == {"ok": True}
    assert client.delete("/mcp").status_code == 200


def test_tool_error_stays_in_the_result(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SESSION_API_KEY", "")
    monkeypatch.setenv("WORKSPACE_ROOT", str(tmp_path))
    client = TestClient(mcp_server.app)
    called = client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {"name": "mesh_audit", "arguments": {"path": "../secret.glb"}},
        },
    )
    assert called.status_code == 200
    assert called.json()["result"]["isError"] is True
