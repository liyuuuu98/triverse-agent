---
name: mesh-audit
description: Inspect an existing local GLB for mesh statistics, dimensions, UV/normals and bounded topology checks.
---

Use inspect_asset on a workspace GLB. Report requested budgets and findings: triangle/material/texture counts, transformed bounds, dimensions, UV/normals, animation/skin presence, boundary/nonmanifold/degenerate/winding counts and audit completeness. Compressed, sparse, oversized or unreadable geometry must retain its incomplete-audit warning.

These checks do not certify vertex manifoldness, self-intersection freedom, wall thickness or printability. Do not claim automatic repair, retopology or rigging. Preserve existing files; save_asset_version before supported edits.
