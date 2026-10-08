# 架构

**最后更新：** 2026-10-08

**入口：** 浏览器打开 OpenHands Canvas，NodePort 30862，路径 `/canvas/`。多用户对话是 LibreChat，NodePort 30863。自建页面和 NodePort 30861 已删除。清单在 `deploy/k8s`。

相关文档：[README](../README.md)、[能力矩阵](capabilities.md)、[部署](deployment.md)、[对话模型](models.md)、[Triverse API](triverse-api.md)、[仓库布局](repository-layout.md)。

生产根目录与本地工作副本是同一棵树：`/mnt/jfs-ssd/liweiyu/triverse_agent`。

## 架构

```text
浏览器
  |  NodePort 30862 /canvas/
  v
Namespace triverse-agent
  Service openhands-canvas
  |
  v
Pod openhands-canvas
  节点 master03 (10.15.127.213)
  control-plane toleration
  镜像 ghcr.nju.edu.cn/openhands/agent-canvas:1.25.0
  |
  +-- Canvas
  |     对话模型 openai/claude-haiku-5-5
  |     Secret openhands-llm
  \-- MCP triverse
        https://dev-mcp.triverse.ai/mcp
        OAuth client codex-dev-mcp
        工作区 hostPath .../workspaces

Pod triverse-registry（同一命名空间，也在 master03）
  镜像 docker.1ms.run/library/registry:2
  imagePullPolicy: IfNotPresent
  NodePort 30500 → 容器 5000
  hostPath /mnt/jfs-ssd/liweiyu/triverse_agent/registry
  → 容器 /var/lib/registry
  不挂进 agent 容器
```

对话 key 与 Triverse Bearer 不能混用。两条外部 API 都不是 `api.hitem3d.ai`。

| 组件 | 地址 | 凭据 |
| --- | --- | --- |
| 浏览器 | NodePort 30862，路径 `/canvas/` | Canvas 在局域网页面里带上 Secret `session-api` |
| 对话 | `https://api.teamorouter.cn/v1` | Secret `openhands-llm`，环境变量 `LLM_API_KEY` |
| 3D | `https://api.triverse.ai/api/v1` | Secret `triverse-api`，环境变量 `TRIVERSE_API_KEY` |

## 组件

| 模块 | 作用 | 不负责 |
| --- | --- | --- |
| `agent/triverse_agent/server.py` | 已不再部署的 FastAPI | 不提供浏览器页面 |
| `agent/triverse_agent/agent_loop.py` | OpenHands 或兼容工具循环 | 不调用 Hi3D |
| `agent/triverse_agent/triverse_client.py` | 已接的公开 API。付费创建前先 quote | 不发明路径 |
| `agent/triverse_agent/local_tools.py` | 工作区、网格、STL、3MF、光顺、ffmpeg、Blender | 不花 Triverse 积分 |
| `agent/triverse_agent/mcp_server.py` | 本地 MCP 实现。Canvas 已不部署它 | 不占用 8090 |
| `agent/skills/*.md` | 代理说明 | 不是远程 API |
| `agent/canvas_skills/` | Canvas 和 LibreChat 共用的技能目录，按名调用 | 不复制 Hi3D 技能正文 |
| `images/Dockerfile` | 以后有 buildkit 时用的镜像。不含密钥。当前集群不构建它 | 不复制 `reference/` |
| `deploy/k8s` | 命名空间、应用、registry、Canvas、LibreChat、Secret 示例 | 示例里没有真密钥 |
| `deploy/build_and_load.sh` | 只 kubectl apply | 不构建镜像，不改 containerd，不创建 Secret |
| `deploy/prepare_canvas_env.py` | 在项目目录准备 Blender 和额外动态库 | 不 apt，不改主机 |

`reference/` 里的 DMG 只作对照。不挂载，不作为客户端。

## 数据流

### 对话

1. 浏览器打开 NodePort 30862 的 `/canvas/`。
2. 模型只能是七个 ID 之一。未选择时用 `claude-haiku-5-5`。
3. `POST /api/chat` 进入 `run_agent`。`AGENT_ENGINE=auto` 时先尝试 OpenHands SDK（模型名写成 `openai/<id>`，`base_url` 为对话网关）。只有 `ImportError` 才改用 `POST {LLM_BASE_URL}/chat/completions`。工具集合相同。网关返回的错误不会自动切换引擎。
4. 工具要么调用 `TriverseClient`，要么调用 `local_tools.py`。

`glm-5.3-flash` 有时把正文放在 `reasoning_content` 而 `content` 为空。兼容循环在没有正文时使用这段推理文本。

### 付费 3D 任务

1. `POST /tasks/pricing/quote`。body 为 `flow_name` 与 `request_payload`。quote 不创建任务。
2. 调用方未确认时，客户端只返回报价。
3. 确认后才 `POST` 对应任务路径。`create_task(..., quoted=False)` 会拒绝。
4. 需要文件时：`POST /upload/image` 或 `POST /upload/model`（multipart 字段 `file`），或 `POST /upload/presigned-upload-url` 之后 HTTP PUT。
5. 服务用 `GET /tasks/{task_uuid}` 与 `GET /tasks/url/{task_uuid}` 看结果，不用页面上的长连接。上游 WebSocket 见 [triverse-api.md](triverse-api.md)。
6. 下载用 `GET /tasks/download/{task_uuid}`。
7. 说明文件写入工作区时以 `triverse-` 开头。用户上传的原始文件保持原名。交互查看模型用 Canvas 侧边栏应用「3D 模型」（`canvas-apps/model-viewer`），Three.js 打进一个浏览器 ESM，不从外网加载脚本。远程多角度预览仍是 `model-preview-render`，先报价。

额度用 `GET /users/me` 与 `GET /users/balance`。没有 Hi3D entitlement。

### 本地工具

网格统计用 trimesh，会读出当前网格是否水密。这不是水密修复。STL 导出为 `triverse-<原名>.stl`。3MF 由 `export_3mf` 写成毫米制 zip，不连接打印机。Taubin 光顺不补洞。灰度高度场不是浮雕服务。支撑估计不是实物证明。

集群通过 `/opt/ffmpeg/bin` 提供 ffprobe，通过 `/opt/triverse-env` 提供 Blender 4.2。不在基础镜像里执行 apt。`BLENDER_BIN` 为空时 Blender 步骤返回未运行。只有 Blender 包装脚本设置 `LD_LIBRARY_PATH`。

30862 的 Pod 只跑 Canvas。工具调用走 `https://dev-mcp.triverse.ai/mcp`，Pod 内不再监听 8090。

## 调度与磁盘

- 应用和 registry 的 `nodeSelector` 都是 `kubernetes.io/hostname: master03`。
- 两者都容忍 `node-role.kubernetes.io/control-plane:NoSchedule`。
- master01 是 `10.15.127.211`，master02 是 `10.15.127.212`，master03 是 `10.15.127.213`。Pod 不跑在 master02。
- 应用镜像是 `docker.1ms.run/library/python:3.12-slim-bookworm`，`imagePullPolicy: IfNotPresent`。不在节点上构建，不修改 containerd。
- registry 使用节点已经能拉的 `docker.1ms.run/library/registry:2`，`imagePullPolicy: IfNotPresent`。不把 NodePort 30500 写进 containerd 的信任列表。
- Canvas 的 hostPath：`ffmpeg-root/` → `/opt/ffmpeg`（只读），`canvas-env/` → `/opt/triverse-env`（只读），`workspaces/` → `/projects` 和 `/home/openhands/workspace`。不挂整棵仓库，也不再挂 `agent/` 和 `venv/`。registry 数据只有 `.../registry` → `/var/lib/registry`。
- Canvas 另挂 `openhands-state/`、`workspaces/`、`canvas_skills/`、`canvas-env/` 和 `ffmpeg-root/`。工作区可写。
- Pod 使用普通 Pod IP，不设置 hostNetwork，不额外占用节点端口。
- ServiceAccount `triverse-agent` 没有额外 RBAC。

## 相关文档

- [部署步骤](deployment.md)
- [模型 ID](models.md)
- [能力状态](capabilities.md)
