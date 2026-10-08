# Triverse API

**最后更新：** 2026-09-30

相关文档：[README](../README.md)、[能力矩阵](capabilities.md)、[架构](architecture.md)、[对话模型](models.md)。

本文件只记录已经接入的公开 API。没有列出的路径不要加进 `TriverseClient`。

## 基址与鉴权

| 项 | 值 |
| --- | --- |
| 基址 | `https://api.triverse.ai/api/v1` |
| 环境变量 | `TRIVERSE_BASE_URL`、`TRIVERSE_API_KEY` |
| 鉴权 | `Authorization: Bearer <TRIVERSE_API_KEY>` |
| Token 来源 | Secret `triverse-api` 的字段 `apiKey` |
| 客户端 | `agent/triverse_agent/triverse_client.py` |
| 官方文档 | <https://docs.triverse.ai/getting-started/introduction> |

Token 不写入 Git、镜像、清单或文档。

这不是对话网关。对话走 `https://api.teamorouter.cn/v1` 和 Secret `openhands-llm`。这不是 Hi3D。禁止请求 `api.hitem3d.ai`。

成功响应一般是 `{"code": 0, "message": "success", "data": ...}`。`code` 不是 0，或 HTTP 状态大于等于 400，客户端抛出 `TriverseError`。异常文本不包含密钥。

下面的路径都相对基址。

## 调用顺序

创建任何付费任务之前，先：

`POST /tasks/pricing/quote`

请求体：

```json
{"flow_name": "<路径最后一段>", "request_payload": {}}
```

`flow_name` 与任务路径最后一段一致，例如 `image-to-model`。这是只读预检：不创建任务，也不冻结额度。

`TriverseClient` 的付费方法：

1. 先 quote。
2. `confirm` 为 false 时只返回报价，`created` 为 null。
3. `confirm` 为 true 时再 `POST /tasks/<flow>`。
4. `create_task(..., quoted=False)` 直接拒绝，避免漏掉报价。

页面上的「只报价」和 Agent 工具默认都不创建任务。用户明确要求生成之后，工具才把 `confirm` 设为 true。

典型任务：

1. `POST /tasks/pricing/quote`
2. 若需要文件：`POST /upload/image` 或 `POST /upload/model`（multipart 字段 `file`），或 `POST /upload/presigned-upload-url` 之后 HTTP PUT
3. `POST /tasks/<已接的任务名>`
4. `GET /tasks/{task_uuid}`，需要时再 `GET /tasks/url/{task_uuid}`
5. `GET /tasks/download/{task_uuid}` 取文件字节
6. 需要预签名读取时 `POST /upload/presigned-get-url`

当前服务用 HTTP 轮询状态，不在页面上再维持 WebSocket。上游监听地址仍然是下面列出的那一条，不要改到别的主机。

用户与额度：

- `GET /users/me`
- `GET /users/balance`

这里的余额是 Triverse 积分。不要映射成 Hi3D 账户权益。

## 端点

只使用下表。参数列为空表示本文没有额外约定；实现按该端点已有字段发送，不要从其他端点抄范围，也不要增加未列出的路径。

| 方法与路径 | 用途 | 本文约定的参数 |
| --- | --- | --- |
| `POST /tasks/image-to-model` | 单图生成带贴图的 3D | `model_version`；`polygon_limit` 1000–1500000；`texture_size` 1024–4096；`turbo` |
| `POST /tasks/image-to-mesh` | 单图只要几何 | |
| `POST /tasks/image-to-artistic-mesh` | 艺术网格 | |
| `POST /tasks/text-to-model` | 文字生成带贴图的 3D | |
| `POST /tasks/text-to-mesh` | 文字只要几何 | |
| `POST /tasks/texture-model` | 按参考图贴图 | |
| `POST /tasks/text-to-texture` | 按文字贴图 | |
| `POST /tasks/model-remesh` | 重网格 | `face_type`：`quad` 或 `triangle`；`target_face_count`：1000–5000000 |
| `POST /tasks/convert-model-format` | 格式转换 | |
| `POST /tasks/model-preview-render` | 多角度预览渲染 | |
| `POST /tasks/image-generation` | 文生图 | |
| `POST /tasks/prompt-optimize` | 提示词优化 | |
| `POST /upload/image` | 上传图片 | multipart 字段 `file` |
| `POST /upload/model` | 上传模型 | multipart 字段 `file` |
| `POST /upload/presigned-upload-url` | 预签名上传 | 随后 HTTP PUT 到返回的 URL。不要另造上传路径 |
| `POST /upload/presigned-get-url` | 预签名获取 | |
| `GET /tasks/{task_uuid}` | 任务状态 | 当前服务轮询这个接口 |
| `WSS /tasks/watch/{task_uuid}` | 任务监听 | `wss://api.triverse.ai/api/v1/tasks/watch/{task_uuid}?token=<token>`。token 与 Bearer 是同一把密钥。当前服务不打开这条连接。不使用 `tasks/watch/all` |
| `GET /tasks/url/{task_uuid}` | 任务结果 URL | |
| `GET /tasks/download/{task_uuid}` | 下载任务结果 | 响应体是文件字节 |
| `POST /tasks/pricing/quote` | 付费前报价 | `flow_name`，`request_payload`。创建付费任务前必调 |
| `GET /users/me` | 当前用户 | |
| `GET /users/balance` | 余额 | |

`image-to-model` 的 `polygon_limit`、`texture_size`、`model_version`、`turbo` 只按上表属于该端点。不要套到 `image-to-mesh` 或其他任务上。

`model_version` 不是对话模型。不要把 `gpt-6-sol` 等 ID 传给 Triverse。

## 明确不接

- `api.hitem3d.ai` 以及任何 Hi3D 商业 API
- 多视图 image-to-3D：公开 API 没有对应参数。不要给 `image-to-model` 增加未列出的多视图字段，也不要调用未在上表出现的 multiview 路径
- 浮雕/深度、拆件、多色打印、自动绑骨、水密修复、LOD、人体关键点
- `WSS /tasks/watch/all`
- 任何上表未出现的 `/tasks/*` 或 `/upload/*` 路径

工作区、GLB 预览、trimesh、STL、ffprobe、Blender 不是本文件的 HTTP 端点。见 [capabilities.md](capabilities.md)。

## 相关文档

- [能力状态](capabilities.md)
- [Secret 字段](deployment.md)
