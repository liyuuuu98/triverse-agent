"""Write four workbench preview PNGs for one mesh. Job JSON follows ``--``."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def main() -> None:
    job = json.loads(Path(sys.argv[sys.argv.index("--") + 1]).read_text(encoding="utf-8"))
    root = Path(job["workspace"])
    model = root / job["model"]
    out_dir = root / job["output_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    suffix = model.suffix.lower()
    if suffix == ".stl":
        bpy.ops.wm.stl_import(filepath=str(model))
    elif suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(model))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(model))
    else:
        raise SystemExit(f"unsupported import {suffix}")
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise SystemExit("no mesh")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    center = Vector((0, 0, 0))
    radius = 1.0
    for obj in meshes:
        center += obj.location
    center /= len(meshes)
    for obj in meshes:
        radius = max(radius, max(obj.dimensions) or 1)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.image_settings.file_format = "PNG"
    camera_data = bpy.data.cameras.new("Preview")
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    distance = radius * 2.8
    views = {
        "front": (0, -distance, radius * 0.4),
        "back": (0, distance, radius * 0.4),
        "left": (-distance, 0, radius * 0.4),
        "right": (distance, 0, radius * 0.4),
    }
    for name, location in views.items():
        camera.location = Vector(location) + center
        direction = center - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(out_dir / f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"WROTE {scene.render.filepath}")


if __name__ == "__main__":
    main()
