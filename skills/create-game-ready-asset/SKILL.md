---
name: create-game-ready-asset
description: Create a single 3D prop from text and check it against the requested asset budget. Use for crates, props and static game assets.
---

Read the scene and clarify the target platform or budget only when it affects the result. Select an advertised profile and describe shape, scale and intended use in a concrete prompt. Request a quote, then request_creation_approval with the complete create arguments, explicit visibility, stable operation_id and the quoted max_credits. Finish the turn while awaiting approval.

After approval use exactly the approved arguments once. The host records the operation and watches task progress independently of this conversation; sync_tasks can resume observation. An uncertain result requires get_operation with the original ID, never a new paid creation. Successful model tasks produce an export review. Finish the turn and wait for its separate user approval: export may consume quota. The host then downloads a unique original GLB into the scene; use deliver_asset on an existing result.

Inspect the delivered GLB and show the local preview. Report triangle count, dimensions, UV/normals, material/texture counts, topology warnings and any failed requested budget. There is no universal 50000-triangle rule. If optimization is unavailable, report the unmet budget; do not claim remeshing occurred. Rigging, collisions and engine import are separate requirements, not inferred from mesh generation.

Return actual asset/download links supplied by tools. Never output fake [View]/[Compare] buttons or call an unverified model game-ready.
