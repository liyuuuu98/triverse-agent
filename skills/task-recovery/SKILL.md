---
name: task-recovery
description: Resume observation and delivery of existing generation operations without recreating paid work.
---

Use sync_tasks to resume the trusted host task ledger. Creation response unknown: query the original operation_id. Export response unknown: query the original export_id. A task refresh synchronizes existing progress and settlement; it does not create new work.

Follow recovery_action/next_action and retry_after_seconds. Never replace operation/export IDs to repair a timeout. Failed delivery is retriable through deliver_asset using the existing task/result, preserving the existing export receipt. Authentication or rejected inputs require user action; report that state instead of repeatedly retrying mutations.
