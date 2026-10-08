# 能力矩阵

**最后更新：** 2026-10-01

代码里的同一份清单是 `agent/triverse_agent/capabilities.py`。本页按那份清单写全，并补上调用约束。摘要见 [README](../README.md)。端点说明见 [triverse-api.md](triverse-api.md)。

状态只有三种：

| 状态 | 含义 |
| --- | --- |
| 已接 | 调用 Triverse 公开 API `https://api.triverse.ai/api/v1`。Bearer 来自 Secret `triverse-api`。 |
| 本地 | 本仓库的工作区、trimesh、ffmpeg 或 Blender。不调用 Hi3D，也不假装调用了未列出的 Triverse 路径。 |
| 尚未具备 | Hi3D 1.1.7 有过。这里没有对应实现。Agent 应直接说明做不到。 |

不调用 `api.hitem3d.ai`。

## 已接

路径相对 `https://api.triverse.ai/api/v1`。创建任何付费任务之前先 `POST /tasks/pricing/quote`。

| 能力 | 状态 | 接口 | 说明 |
| --- | --- | --- | --- |
| 单图生成带贴图的 3D | 已接 | `POST /tasks/image-to-model` | `model_version`；`polygon_limit` 1000–1500000；`texture_size` 1024–4096；`turbo` |
| 单图只要几何 | 已接 | `POST /tasks/image-to-mesh` | |
| 艺术网格 | 已接 | `POST /tasks/image-to-artistic-mesh` | |
| 文字生成带贴图的 3D | 已接 | `POST /tasks/text-to-model` | |
| 文字只要几何 | 已接 | `POST /tasks/text-to-mesh` | |
| 按参考图贴图 | 已接 | `POST /tasks/texture-model` | |
| 按文字贴图 | 已接 | `POST /tasks/text-to-texture` | |
| 重网格 | 已接 | `POST /tasks/model-remesh` | `face_type`：`quad` 或 `triangle`。`target_face_count`：1000–5000000。这是远程任务，先报价。本地只看面数时用网格统计 |
| 格式转换 | 已接 | `POST /tasks/convert-model-format` | |
| 多角度预览渲染 | 已接 | `POST /tasks/model-preview-render` | |
| 文生图 | 已接 | `POST /tasks/image-generation` | |
| 提示词优化 | 已接 | `POST /tasks/prompt-optimize` | |
| 上传图片 | 已接 | `POST /upload/image` | multipart 字段 `file` |
| 上传模型 | 已接 | `POST /upload/model` | multipart 字段 `file` |
| 预签名上传 | 已接 | `POST /upload/presigned-upload-url` | 之后用返回的 URL 做 HTTP PUT |
| 预签名获取 | 已接 | `POST /upload/presigned-get-url` | |
| 任务状态 | 已接 | `GET /tasks/{task_uuid}` | 当前服务用这个接口轮询 |
| 任务结果 URL | 已接 | `GET /tasks/url/{task_uuid}` | |
| 任务下载 | 已接 | `GET /tasks/download/{task_uuid}` | |
| 任务监听 | 已接 | `WSS /tasks/watch/{task_uuid}` | 公开 API 提供。当前服务不在页面上维持这条长连接，改用上面的 GET |
| 费用报价 | 已接 | `POST /tasks/pricing/quote` | 只读预检，不创建任务。未确认时客户端只返回报价 |
| 当前用户 | 已接 | `GET /users/me` | |
| 余额 | 已接 | `GET /users/balance` | Triverse 积分，不是 Hi3D 权益 |

`polygon_limit` 与 `texture_size` 的范围只用于 `image-to-model`，不要套到其他任务上。`target_face_count` 的范围只用于 `model-remesh`。

上表没有的 Triverse 路径不接。多视图建模没有公开参数，不能借 `image-to-model` 假装实现。

官方说明：<https://docs.triverse.ai/getting-started/introduction>

## 本地

| 能力 | 状态 | 位置 | 说明 |
| --- | --- | --- | --- |
| 创建/打开工作区 | 本地 | `server.py` 的 `/api/workspaces` | 生产目录 `/data/workspaces`，来自 hostPath `.../triverse_agent/workspaces` |
| `triverse-` 文件 | 本地 | 工作区 | Agent 写的说明是 `triverse-*.md`。用户上传的原始文件保持原名。本地 STL 是 `triverse-<原名>.stl` |
| GLB 预览 | 已接 | `POST /tasks/model-preview-render` | 远程多角度渲染，先报价。这不是可旋转的查看器 |
| 交互查看模型 | 本地 | `canvas-apps/model-viewer` | Canvas 侧边栏「3D 模型」。读取工作区里的 GLB、glTF、OBJ、STL |
| 网格统计 | 本地 | trimesh `mesh_info` | 顶点数、面数、包围盒，以及当前是否水密。不是水密修复，也不是远程 remesh |
| STL 导出 | 本地 | trimesh `export_stl` | 只写工作区。不连接打印机 |
| 3MF 导出 | 本地 | `export_3mf` | 毫米制 zip。不连接打印机 |
| 网格诊断 | 本地 | `mesh_audit` | 边界、非流形、退化、连通块。只读，不是水密修复 |
| Taubin 光顺 | 本地 | `taubin_smooth` | 不补洞 |
| 等比缩放 | 本地 | `scale_model` | 按 x、y 或 z 的当前尺寸 |
| 灰度高度场 | 本地 | `heightfield_mesh` | 本地灰度位移体。不是浮雕服务 |
| 支撑估计 | 本地 | `support_check` | Z 轴向上的几何估计，不是实物证明 |
| 媒体探测 | 本地 | ffprobe | 集群把 `ffmpeg-root/` 挂到 `/opt/ffmpeg`。没有 ffprobe 时返回未安装 |
| 媒体转换和拼图 | 本地 | ffmpeg | `media_convert`、`image_sheet`。不接受任意滤镜字符串 |
| 字幕时间轴 | 本地 | `write_subtitle` | 只写给定文本，不做语音识别 |
| Blender 后台脚本 | 本地 | `BLENDER_BIN` | 集群提供 Blender 4.2。未设置时返回未运行 |
| 网格布尔、四视图、法线烘焙 | 本地 | Blender | `mesh_boolean`、`blender_preview`、`texture_bake`。法线烘焙不是远程贴图 |
| 技能目录 | 本地 | `agent/skills/*.md` | 给代理的说明。不从 Hi3D 安装包或 `reference/` 加载 |
| Canvas 技能 | 本地 | `agent/canvas_skills/` | 30862 挂到 `~/.agents/skills`。名字对齐 Hi3D 1.1.7 的技能和工作流，正文是本仓库写的 |

## 尚未具备

| 能力 | 状态 | 原因 |
| --- | --- | --- |
| Hi3D 商业 API | 尚未具备 | 禁止调用 `api.hitem3d.ai` |
| 多视图一起建模 | 尚未具备 | 公开 API 没有对应参数 |
| 浮雕 / 深度 | 尚未具备 | 公开 API 没有这项服务。`heightfield_mesh` 只是本地灰度位移体 |
| 拆件 | 尚未具备 | 无已接端点，无本地实现 |
| 多色打印 | 尚未具备 | 无已接端点，无本地实现 |
| 自动绑骨 | 尚未具备 | 无已接端点，无本地实现 |
| 水密修复 | 尚未具备 | 只能读出网格当前是否水密，不能把它修成水密 |
| LOD | 尚未具备 | 无已接端点，无本地实现 |
| 人体关键点（sapiens） | 尚未具备 | 无已接端点，无本地实现 |
| 发送到物理打印机 | 尚未具备 | 可以导出 STL 和 3MF，没有打印机协议 |
| Electron DMG | 尚未具备 | 本服务是浏览器页面。`reference/` 里的 DMG 不是运行入口 |
| Hi3D 账户权益 | 尚未具备 | 额度只看 Triverse `GET /users/me` 与 `GET /users/balance` |
| MDF | 尚未具备 | 没有对应公开接口 |
| STEP / CadQuery B-rep | 尚未具备 | 没有实体内核 |
| remotion | 尚未具备 | 没有 Remotion 运行时。本地只用 ffmpeg |
| MetaHuman | 尚未具备 | 没有该适配器 |
| 真实游戏引擎 | 尚未具备 | Canvas 只能在工作区写代码并运行 |

这些行保持为缺口。只有 Triverse 公开 API 或本仓库本地工具真实可用之后，才能改状态。

## 相关文档

- [端点与报价顺序](triverse-api.md)
- [工作区挂载](deployment.md)
- [技能文件列表](repository-layout.md)
