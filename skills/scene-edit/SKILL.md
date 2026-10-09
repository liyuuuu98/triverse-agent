---
name: scene-edit
description: Arrange and inspect existing 3D assets in the project scene, including selection, transforms, visibility, camera and version snapshots.
---

Read the scene before editing; use selectedIds/activeAssetId to resolve "this". Preserve other objects and hierarchy. Add existing GLBs with add_scene_asset; update_scene uses the version just read to prevent overwriting concurrent changes. Positions are glTF meters, XYZ rotation is radians and scales must be positive.

Use actual camera presets and object IDs for focus. Save_asset_version preserves a GLB and scene snapshot before model changes. New geometry, rigging and print repair require actual tools and must not be fabricated as scene transforms. For a comparison, keep both version files and display them in the scene with distinct names.
