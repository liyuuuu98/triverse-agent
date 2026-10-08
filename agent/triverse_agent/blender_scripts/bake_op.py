"""Bake a tangent normal map from a high mesh onto a low mesh. Job JSON follows ``--``."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy


def _import_one(path: Path):
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
    if len(created) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in created:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = created[0]
        bpy.ops.object.join()
        return bpy.context.view_layer.objects.active
    return created[0]


def main() -> None:
    job = json.loads(Path(sys.argv[sys.argv.index("--") + 1]).read_text(encoding="utf-8"))
    root = Path(job["workspace"])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    high = _import_one(root / job["high"])
    low = _import_one(root / job["low"])
    if not low.data.uv_layers:
        bpy.context.view_layer.objects.active = low
        low.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
    image = bpy.data.images.new("triverse_normal", width=1024, height=1024)
    image.colorspace_settings.name = "Non-Color"
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 8
    scene.render.bake.margin = 8
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.1
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    material = bpy.data.materials.new("Bake")
    material.use_nodes = True
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    material.node_tree.nodes.active = node
    if low.data.materials:
        low.data.materials[0] = material
    else:
        low.data.materials.append(material)
    bpy.ops.object.bake(type="NORMAL")
    output = root / job["output"]
    output.parent.mkdir(parents=True, exist_ok=True)
    image.filepath_raw = str(output)
    image.file_format = "PNG"
    image.save()
    print(f"WROTE {output}")


if __name__ == "__main__":
    main()
