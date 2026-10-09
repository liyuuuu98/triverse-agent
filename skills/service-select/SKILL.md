---
name: service-select
description: Select a supported 3D workflow from the current tools. Use when choosing generation, retexture, inspection or delivery.
---

Use the actual available tool list. Text creation uses get_text_to_model_capabilities, quote_text_to_model and create_text_to_model; image creation uses upload_reference, get_capabilities, quote_image_to_model and create_image_to_model. Retexture uses the exact selected owned version and quote_retexture/create_retexture.

Before paid creation, submit the successful quote receipt and full creation arguments to request_creation_approval. Preserve operation_id and max_credits; never change arguments after approval. Missing capabilities should be reported directly; a skill name is not evidence a tool exists.

Use read_scene to resolve selection. Local previews and delivery do not require a remote render. Use list_workspace_files for existing files and inspect_asset for GLB checks. Do not call old Canvas tools or propose absent remeshing, rigging or print repair.
