"""Local mesh, subtitle, and Blender-absent behavior. No network."""

from __future__ import annotations

import ast
import zipfile
from pathlib import Path

import pytest
import trimesh

from triverse_agent.config import load_settings
from triverse_agent.local_tools import (
    export_3mf,
    heightfield_mesh,
    safe_workspace_file,
    scale_model,
    support_check,
    taubin_smooth,
    write_subtitle,
)
from triverse_agent.tools import execute_tool


def _box(path: Path, *, bump: float = 0) -> trimesh.Trimesh:
    mesh = trimesh.creation.box(extents=(10, 10, 10))
    if bump:
        mesh.vertices[0, 2] += bump
    mesh.export(path)
    return mesh


def test_taubin_keeps_counts_and_reduces_spike(tmp_path: Path) -> None:
    source = _box(tmp_path / "box.glb", bump=5)
    before = float(source.bounds[1, 2] - source.bounds[0, 2])
    result = taubin_smooth(tmp_path, "box.glb", iterations=8)
    loaded = trimesh.load(tmp_path / result["path"], force="mesh")
    after = float(loaded.bounds[1, 2] - loaded.bounds[0, 2])
    assert len(loaded.vertices) == len(source.vertices)
    assert len(loaded.faces) == len(source.faces)
    assert after < before
    assert "不是水密修复" in result["note"]


def test_export_3mf_is_a_millimeter_package(tmp_path: Path) -> None:
    _box(tmp_path / "box.glb")
    relative = export_3mf(tmp_path, "box.glb")
    with zipfile.ZipFile(tmp_path / relative) as archive:
        model = archive.read("3D/3dmodel.model").decode("utf-8")
    assert 'unit="millimeter"' in model
    assert "Triverse Agent" in model


def test_support_check_cube_is_a_geometric_estimate(tmp_path: Path) -> None:
    _box(tmp_path / "box.glb")
    result = support_check(tmp_path, "box.glb")
    assert result["stable_estimate"] is True
    assert result["contact_vertices"] > 0
    assert "不证明" in result["note"]


def test_heightfield_writes_a_local_solid(tmp_path: Path) -> None:
    result = heightfield_mesh(tmp_path, heights=[[0, 1], [0.5, 0]], base_mm=1)
    loaded = trimesh.load(tmp_path / result["path"], force="mesh")
    assert len(loaded.faces) > 0
    assert "不是 Hi3D 浮雕服务" in result["note"]


def test_scale_model_changes_chosen_axis(tmp_path: Path) -> None:
    _box(tmp_path / "box.glb")
    result = scale_model(tmp_path, "box.glb", size_mm=20, axis="z")
    assert result["extents_mm"][2] == pytest.approx(20)
    assert result["extents_mm"][0] == pytest.approx(20)


def test_write_subtitle_uses_the_given_text(tmp_path: Path) -> None:
    result = write_subtitle(tmp_path, [{"start": 0, "end": 1.5, "text": "你好"}])
    text = (tmp_path / result["path"]).read_text(encoding="utf-8")
    assert "你好" in text
    assert "00:00:00,000 --> 00:00:01,500" in text
    assert result["note"].startswith("只写时间轴")


def test_workspace_escape_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        safe_workspace_file(tmp_path, "../outside.glb")
    _box(tmp_path / "box.glb")
    with pytest.raises(ValueError):
        export_3mf(tmp_path, "box.glb", output="../outside.3mf")


def test_blender_tools_report_not_installed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BLENDER_BIN", raising=False)
    _box(tmp_path / "box.glb")
    settings = load_settings()
    preview = execute_tool(
        "run_blender",
        {"script": "missing.py"},
        settings=settings,
        workspace=tmp_path,
        client=None,
    )
    assert preview["installed"] is False
    assert "未安装" in preview["reason"]
    boolean = execute_tool(
        "mesh_boolean",
        {"a": "box.glb", "b": "box.glb", "operation": "union"},
        settings=settings,
        workspace=tmp_path,
        client=None,
    )
    assert boolean["installed"] is False


def test_blender_scripts_parse() -> None:
    folder = Path(__file__).resolve().parents[1] / "triverse_agent" / "blender_scripts"
    sources = list(folder.glob("*.py"))
    assert {path.name for path in sources} == {"boolean_op.py", "preview_op.py", "bake_op.py"}
    for path in sources:
        ast.parse(path.read_text(encoding="utf-8"))
