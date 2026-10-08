# 对话模型

**最后更新：** 2026-09-30

相关文档：[README](../README.md)、[架构](architecture.md)、[部署](deployment.md)、[Triverse API](triverse-api.md)。

对话和 3D 不是同一个服务。选择器只影响发到对话网关的请求。它不选择 Triverse 的 `model_version`。那个字段只属于 `POST /tasks/image-to-model`。

## 网关

| 项 | 值 |
| --- | --- |
| 类型 | OpenAI 兼容 |
| Base URL | `https://api.teamorouter.cn/v1` |
| 环境变量 | `LLM_BASE_URL`（默认同上）、`LLM_API_KEY` |
| 认证 | `Authorization: Bearer <LLM_API_KEY>` |
| 集群 Secret | `openhands-llm`，字段 `apiKey` |
| SDK | `openhands-sdk==1.49.6` |
| 默认模型 | `claude-haiku-5-5`（`LLM_MODEL`） |

这把 key 不是 Triverse 的 Bearer，也不是 `SESSION_API_KEY`。不要把请求改到 `api.triverse.ai` 或 `api.hitem3d.ai`。

OpenHands 调用时模型名写成 `openai/<id>`，`base_url` 指向这个网关。`AGENT_ENGINE=auto` 时优先走 SDK。只有 SDK 导入失败（`ImportError`）才改用同一网关的 `POST /chat/completions`，工具集合不变。网关拒绝模型名不会自动切换。`AGENT_ENGINE=compatible` 强制走兼容循环，`openhands` 强制走 SDK。

## 选择器

界面和服务端只接受下表七个 ID。不要增加别名，不要把网关路由后的后端 ID 放进选择器。

未选择时使用 `claude-haiku-5-5`。`LLM_MODEL` 若不在表中，配置加载时退回 `claude-haiku-5-5`。`POST /api/chat` 收到表外 ID 返回 400，不转发。

| 名称 | 模型 ID | 选择器 |
| --- | --- | --- |
| GPT-6 Astra | `gpt-6-astra` | 允许 |
| GPT-6 Sol | `gpt-6-sol` | 允许 |
| Claude Haiku 5.5 | `claude-haiku-5-5` | 允许，**默认** |
| Claude Opus 5.5 | `claude-opus-5-5` | 允许 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 允许 |
| DeepSeek 4.1 Flash | `deepseek-flash` | 允许。见下一节 |
| GLM 5.3 Flash | `glm-5.3-flash` | 允许。见下一节 |

默认项是 `claude-haiku-5-5`，不是表里的第一行。

## deepseek-flash

DeepSeek 4.1 Flash 在这个网关上的 ID 是 `deepseek-flash`。一次 chat completion 返回 HTTP 200，并被路由到 `deepseek-v4-1-flash-260910`。

选择器、请求里的模型字段和允许列表都写 `deepseek-flash`。不要把路由后的 `deepseek-v4-1-flash-260910` 放进选择器，也不要改用 `deepseek-v4-flash`。

## glm-5.3-flash

`glm-5.3-flash` 在很短的 `max_tokens` 下会把文字放进 `reasoning_content`，`content` 为空。兼容循环在没有正文时用这段推理文本作为回复。选择器 ID 仍然是 `glm-5.3-flash`。

## 与 3D API 的边界

| | 对话 | 3D |
| --- | --- | --- |
| Base URL | `https://api.teamorouter.cn/v1` | `https://api.triverse.ai/api/v1` |
| Secret | `openhands-llm` | `triverse-api` |
| 模型字段 | 上表七个 ID | 仅各端点自己的字段，例如 `image-to-model` 的 `model_version` |

不要把 `gpt-6-sol` 等对话 ID 当作 `model_version`。当前约定里没有这层等价。

## 相关文档

- [密钥字段名](deployment.md)
- [3D 端点](triverse-api.md)
