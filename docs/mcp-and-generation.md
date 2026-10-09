# MCP 与生成流程

最后更新：2026-10-09。依据当前源码与 [23 工具快照](mcp-tool-snapshot-2026-10-09.json)，运行时以最新 schema/profile 为准。

## 远程能力

| 功能 | 工具 |
| --- | --- |
| 图片目录/输入 | list_images、start_image_input、get_image_input、prepare_local_upload、finalize_local_upload |
| 能力 | get_capabilities、get_text_to_model_capabilities |
| 图生模型 | quote_image_to_model、create_image_to_model |
| 文生模型 | quote_text_to_model、create_text_to_model |
| 重新贴图 | list_retexture_sources、list_retexture_reference_images、quote_retexture、create_retexture |
| 任务/恢复 | list_tasks、get_task、refresh_task、get_operation |
| 资产/导出 | get_asset、export_model、get_export、list_exports |

没有独立 remesh、远程渲染、多视图、绑骨或打印修复工具。generate_image 是独立 TeamoRouter 图片工具，不属于上述 MCP 目录。

## 报价和批准

所有 23 个工具没有 confirm。三种生成采用 quote/create 分离，网关已适配：

1. 查询能力与 profile，明确 source/prompt/visibility。
2. 调用 quote，保存成功收据、实际 credits_cost 和创建 schema。
3. request_creation_approval 提交完整创建参数。文生模型报价不含 prompt，因此审批必须另外绑定完整 prompt。
4. 用户在页面审阅参数和报价后批准。收据有效 30 分钟，max_credits 精确等于报价。
5. 创建钩子匹配完整意图，原子消耗一次授权；发送前登记 operation_id。
6. 返回未知或中断只查询原 operation，禁止重复提交。对重复 ID 的再次授权也拒绝执行。

三条生成流均验证当前 JSON schema；schema 出现未支持的约束会拒绝审批，避免默默跳过。审批和收据放 control，模型不可直接改写。

## 参考图输入

浏览器聊天最多 4 张、每张 6,000,000 bytes，PNG/JPEG/WebP/GIF；保存到 refs 并提供给对话模型。GIF 可作为聊天参考，3D 输入需转换为 PNG/JPEG/WebP/AVIF，不能直接上传 GIF。

upload_reference 封装宿主流程，无需另装外部 CLI：

```text
校验本地真实路径、MIME、20 MB 限制、SHA-256
 → 持久化 request_id / attempt_id
 → start_image_input
 → 标记 prepare 已发送
 → prepare_local_upload
 → 校验租约指纹和 upload_origin
 → 宿主 HTTPS PUT
 → finalize_local_upload
 → 验证 READY、SHA-256、大小、MIME
 → 返回 source={asset_id,item_id,file_id}
```

上传 URL/headers 不返回模型、不写聊天记录。prepare/PUT 结果未知时，后续同文件仅 finalize(query_only=true)，不重放非幂等准备或 PUT。未得到 READY 会报告恢复需求，而不会猜测成功。

## 任务与交付

后台每 15 秒读取 control/operations.json，get_operation 查接受情况，再 refresh_task 同步进度/结算。操作、任务、结果、账单、恢复动作写到受保护账本，并生成页面任务列表。重启后继续观察；未知创建不会自动重发。

结果 task/asset/item 明确后创建唯一 export_id。export_model 没有 quote API，且可能消耗账户导出配额，所以生成批准不自动授权导出；页面单独显示导出审批。deliver_asset 也遵守该边界。

获准后请求 target_format=null（原始格式）、retry_failed_conversion=false。未知结果只 get_export 同一 ID。遵守 retry_after_seconds，至少间隔 15 秒；不自动转换、不生成新的重试 intent。

ready 文件需唯一原始 GLB；校验来源身份、有效期、大小、SHA-256（服务提供时），拒绝私网/非 HTTPS/重定向/超过 200 MB/外部依赖。OBJ 转换或多 GLB 候选仍需人工明确下一步，不能静默挑选。

成功保存 `assets/generated/<export_id>/<sha256>.glb`，记录 provenance/历史，加入唯一场景对象，页面提供下载。export_asset_pack 可生成本地 ZIP 和检查 manifest，无远程额度。

## 验证边界

本地测试使用真实 23 工具输入 schema 与模拟 MCP/下载结果，验证报价审批、稳定 ID、网络失败恢复、账单、指纹拒绝和幂等场景登记。没有进行远程付费生成/导出或真实产出质量验收。详见 [修复记录](remediation-2026-10-09.md)。
