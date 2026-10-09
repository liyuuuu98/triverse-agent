---
name: delivery-review
description: Review and package existing GLB assets with provenance, budget results and a downloadable ZIP.
---

Inspect each requested asset and report any budget failure or incomplete topology check. Use the scene's actual asset paths and preserve dependencies. export_asset_pack creates a ZIP containing GLBs, scene.json, hashes and inspection results. Models with external dependencies must be embedded or reported as incomplete; do not silently omit files.

For cloud-only results, deliver_asset downloads the exact asset through MCP export, verifies available checksum/size and registers its version and scene entry. Use the returned real local file paths for download. STL/3MF export, supports, printing and printer delivery are not provided by this workflow.
