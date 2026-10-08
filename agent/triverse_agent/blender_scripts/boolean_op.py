"""Background boolean for two mesh files. Job JSON follows ``--``."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy


def _read_job() -> dict:
    argv = sys.argv
    return json.loads(Path(argv[argv.index("--") + 1]).read_text(encoding="utf-8"))


def _import_mesh(path: Path):
    before = set(bpy.data.objects)
    suffix = path.suffix.lower()
    if suffix == ".stl":
        bpy.ops.wm.stl_import(filepath=str(path))
    elif suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    else:
        raise SystemExit(f"unsupported import {suffix}")
    created = [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]
    if not created:
        raise SystemExit(f"no mesh in {path.name}")
    if len(created) == 1:
        return created[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in created:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = created[0]
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def main() -> None:
    job = _read_job()
    root = Path(job["workspace"])
    operation = job["operation"]
    if operation not in {"difference", "union", "intersect"}:
        raise SystemExit("bad operation")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    target = _import_mesh(root / job["a"])
    cutter = _import_mesh(root / job["b"])
    modifier = target.modifiers.new("Boolean", "BOOLEAN")
    modifier.operation = operation.upper()
    modifier.object = cutter
    # Blender 4.2 only exposes FAST and EXACT. FLOAT arrived in a later release.
    modifier.solver = "EXACT"
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    output = root / job["output"]
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    if output.suffix.lower() == ".stl":
        bpy.ops.wm.stl_export(filepath=str(output), export_selected_objects=True)
    else:
        bpy.ops.export_scene.gltf(filepath=str(output), use_selection=True)
    print(f"WROTE {output}")


if __name__ == "__main__":
    main()
