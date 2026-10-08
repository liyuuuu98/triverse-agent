"""Canvas skill files match the clean-room catalog."""

from __future__ import annotations

from pathlib import Path

from triverse_agent.canvas_catalog import ATOMIC_SKILLS, ENTRIES, WORKFLOW_SKILLS, render

ROOT = Path(__file__).resolve().parents[1] / "canvas_skills"


def test_catalog_covers_every_name_once() -> None:
    assert len(ATOMIC_SKILLS) == 62
    assert len(WORKFLOW_SKILLS) == 50
    assert set(ATOMIC_SKILLS).isdisjoint(WORKFLOW_SKILLS)
    assert set(ENTRIES) == set(ATOMIC_SKILLS) | set(WORKFLOW_SKILLS) | {"triverse-canvas"}


def test_skill_files_match_catalog() -> None:
    folders = {path.name for path in ROOT.iterdir() if path.is_dir()}
    assert folders == set(ENTRIES)
    assert not list(ROOT.glob("*.md"))
    for name, (description, title, body) in ENTRIES.items():
        text = (ROOT / name / "SKILL.md").read_text(encoding="utf-8")
        assert text == render(name, description, title, body)
        assert text.startswith("---\n")
        assert f"name: {name}\n" in text
        assert "hitem3d" not in text.lower()
        assert "hi3d" not in text.lower()
        assert "confirm" in text
        assert len(description) <= 1024
        assert title


def test_gap_skills_do_not_pretend() -> None:
    expectations = {
        "relief-map": ("heightfield_mesh", "尚未具备"),
        "print-export": ("export_3mf", "打印机"),
        "taubin-smooth": ("taubin_smooth", "水密"),
        "game-entitlement": ("尚未具备",),
        "brep-build": ("尚未具备",),
        "mdf-deploy": ("尚未具备",),
        "rig-retarget": ("尚未具备",),
        "triverse-canvas": ("image_to_model", "尚未具备"),
        "service-select": ("multiview", "尚未具备"),
    }
    for name, tokens in expectations.items():
        text = (ROOT / name / "SKILL.md").read_text(encoding="utf-8")
        for token in tokens:
            assert token in text, name
