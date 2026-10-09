---
name: image-to-model
description: Generate a 3D model from a workspace reference image. Use for image-based reconstruction, not multi-view generation.
---

Use the existing refs/ attachment path; do not request the same image again. Call upload_reference, which returns a verified READY cloud source without exposing upload leases. Select a profile from get_capabilities. Pass the returned source identity to quote_image_to_model, then request_creation_approval with complete create arguments. Local file paths are not cloud sources.

Wait for approval. Submit the exact approved creation once. Preserve operation_id on uncertain outcomes; the host watches task progress and presents a separate export review. Wait for export approval before the host downloads a unique original GLB into the scene. Use sync_tasks for recovery. Inspect the delivered GLB and report limitations visible in its geometry/preview. Multiple attached photos are not automatically a multi-view input.
