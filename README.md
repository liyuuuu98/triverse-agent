# Triverse Agent

**最后更新：** 2026-10-01

自托管的 Triverse Agent。运行在 Kubernetes 上，agent 框架是 OpenHands Python SDK（`openhands-sdk`）。在 Triverse 公开 API 或本仓库本地工具做得到的范围内，复现 Hi3D 1.1.7 的产品行为。

不调用 `api.hitem3d.ai`。Hi3D 有、但这里没有公开参数或本地实现的能力，记为「尚未具备」，不伪造。

生产代码与本地工作副本是同一棵树。集群上的根目录是 `/mnt/jfs-ssd/liweiyu/triverse_agent`。

## 文档

| 文档 | 内容 |
| --- | --- |
| [架构](docs/architecture.md) | 进程、两条外部 API、挂载边界 |
| [能力矩阵](docs/capabilities.md) | 已接 / 本地 / 尚未具备 |
| [Triverse API](docs/triverse-api.md) | `https://api.triverse.ai/api/v1` 上已接的路径 |
| [对话模型](docs/models.md) | 选择器里的七个模型 ID，默认 `claude-haiku-5-5` |
| [部署](docs/deployment.md) | 节点、端口、镜像、密钥、挂载 |
| [仓库布局](docs/repository-layout.md) | 目录职责 |
| [部署脚本](deploy/README.md) | `deploy/build_and_load.sh` 实际做的事 |

能力清单的代码在 `agent/triverse_agent/capabilities.py`。下面的摘要与 [docs/capabilities.md](docs/capabilities.md) 跟它一致，并补上调用约束。

## 能力摘要

状态只有三种：已接、本地、尚未具备。

**已接**（Triverse 公开 API，Bearer 来自 Secret `triverse-api`）：

- 图生带贴图 3D、图生网格、艺术网格、文生带贴图 3D、文生网格
- 按参考图贴图、按文字贴图、重网格、格式转换、多角度预览渲染
- 文生图、提示词优化
- 上传图片、上传模型、预签名上传与预签名获取
- 任务状态、结果 URL、下载；上游还有任务 WebSocket，当前服务用 HTTP 轮询
- 付费前报价；当前用户与余额（Triverse 积分）

图生带贴图 3D（`POST /tasks/image-to-model`）使用 `model_version`、`polygon_limit`（1000–1500000）、`texture_size`（1024–4096）和 `turbo`。重网格使用 `face_type`（`quad` 或 `triangle`）和 `target_face_count`。

**本地**（工作区、Blender、ffmpeg，不是远程 API）：

- 创建/打开工作区。Agent 写的说明文件以 `triverse-` 开头。用户上传的原始文件保持原名
- 浏览器入口是 OpenHands Canvas。侧边栏「3D 模型」可旋转查看工作区里的 GLB、glTF、OBJ 和 STL。远程多角度渲染仍先报价
- trimesh 网格统计，导出 `triverse-*.stl`，以及毫米制 3MF。不连接打印机
- 网格诊断、Taubin 光顺、按轴等比缩放、Z 轴向上的支撑估计。诊断和光顺都不是水密修复
- 灰度高度场。这是本地位移体，不是浮雕服务
- ffmpeg 做探测、裁切、缩放、图片序列、混音和拼图。字幕只写用户给出的时间轴，不做语音识别
- Blender 4.2 在 `/opt/triverse-env`。布尔、四视图和法线烘焙只在 `BLENDER_BIN` 可执行时运行。没有时说明未安装
- Canvas 的技能来自 `agent/canvas_skills/`

**尚未具备**（不要做成假功能）：

- Hi3D 商业 API / `api.hitem3d.ai`
- 多视图一起建模（公开 API 没有对应参数）
- 浮雕/深度服务、拆件、多色打印。本地灰度高度场不能冒充浮雕服务
- 自动绑骨、水密修复、LOD、人体关键点（网格统计可以读出「当前是否水密」，那不是修复）
- 发送到物理打印机。STL 和 3MF 只留在工作区
- Electron DMG
- Hi3D 账户权益
- MDF、STEP / CadQuery 实体、Remotion、MetaHuman、真实游戏引擎

## 密钥放在哪里

密钥不进 Git，不进镜像，不写进本文档。进程只读环境变量，不会自动加载 `.env`。

| 用途 | 环境变量 | Secret（命名空间 `triverse-agent`） | 字段 |
| --- | --- | --- | --- |
| 3D API | `TRIVERSE_API_KEY` | `triverse-api` | `apiKey` |
| 对话 | `LLM_API_KEY` | `openhands-llm` | `apiKey` |
| 页面访问门 | `SESSION_API_KEY` | `session-api` | `sessionApiKey` |

3D 与对话不是同一把 key。`SESSION_API_KEY` 为空时不检查访问门；非空时业务接口要求请求头 `X-Session-Api-Key`。`GET /health` 不检查。集群 Deployment 引用了这三个 Secret，对象必须存在，否则 Pod 起不来。值可以是空字符串以关掉访问门。

本地把值导出到当前 shell。可以放在已被忽略的 `.env` 里再执行 `set -a && source .env && set +a`。不要提交 `deploy/k8s/secrets.yaml`。示例字段名在 `deploy/k8s/secrets.example.yaml`，里面的 `REPLACE_ME` 不是可用密钥。

## 本地运行

依赖在 `agent/requirements.txt`（`openhands-sdk>=1.0.0`）。测试依赖 pytest，不在这份清单里。在 `agent/` 目录启动时，当前目录就是包的导入路径。

```bash
cd /mnt/jfs-ssd/liweiyu/triverse_agent/agent
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt pytest
export TRIVERSE_API_KEY
export LLM_API_KEY
export WORKSPACE_ROOT=../workspaces
export AGENT_ENGINE=auto
.venv/bin/python -m pytest
.venv/bin/python -m uvicorn triverse_agent.server:app --host 127.0.0.1 --port 8080
```

`export VAR` 不带赋值，使用的是 shell 里已经有的值。不要把密钥写进仓库或这条命令的历史里。

- 健康检查：<http://127.0.0.1:8080/health>
- 界面：<http://127.0.0.1:8080/>
- 默认模型 `claude-haiku-5-5`。选择器 ID 见 [docs/models.md](docs/models.md)
- 工作区在仓库根的 `workspaces/`。不要把 `/mnt/jfs-ssd` 交给进程

`AGENT_ENGINE=auto` 时优先用 OpenHands SDK。只有 SDK 导入失败（`ImportError`）才改走同一网关的 `/chat/completions` 工具循环。网关返回错误不会自动切换。`openhands` 与 `compatible` 用来固定其中一条。

付费任务先 `POST /tasks/pricing/quote`。`confirm` 不为真时只返回报价，不创建任务。

## 部署

细节在 [docs/deployment.md](docs/deployment.md)。摘要：

- 命名空间 `triverse-agent`
- 浏览器入口是 OpenHands Canvas，NodePort **30862**，路径 `/canvas/`：<http://10.15.127.211:30862/canvas/>
- 专用 registry NodePort **30500**，数据在 `/mnt/jfs-ssd/liweiyu/triverse_agent/registry`
- registry 和 Canvas 都调度到 **master03**（`10.15.127.213`），并带 control-plane toleration。不要调度到 master02（`10.15.127.212`）
- Canvas 使用已经导入的 `ghcr.nju.edu.cn/openhands/agent-canvas:1.25.0`，`imagePullPolicy: IfNotPresent`。不在节点上构建，不安装 buildkit
- **不要修改任何节点的 containerd / runtime 配置，尤其不要改 master02**
- 不设置 hostNetwork，不把 `/mnt/jfs-ssd` 整盘挂进容器

三个 Secret 先建好，再在 master01 上执行：

```bash
python3 deploy/prepare_canvas_env.py
bash deploy/build_and_load.sh
```

`prepare_canvas_env.py` 只在项目目录里准备 Blender 4.2 和 `canvas-env/bin` 包装脚本。安装包已在时不会重新下载。脚本不创建 Secret，也不改主机软件包。部署后再打开 30862。

## OpenHands Canvas（30862）

Canvas 使用预构建镜像 `ghcr.nju.edu.cn/openhands/agent-canvas:1.25.0`，不在节点上构建。工具来自 Triverse dev MCP `https://dev-mcp.triverse.ai/mcp`，不再在 Pod 里启动 `127.0.0.1:8090`。连接使用 OAuth，客户端 ID 是 `codex-dev-mcp`。付费任务仍然先报价，`confirm` 默认 false。

环境：

- Blender 4.2.16 在 `/opt/triverse-env`，来自清华镜像的官方 Linux 包
- ffmpeg / ffprobe 在 `/opt/ffmpeg`，包装脚本再放到 `/opt/triverse-env/bin`
- 官方包没有带上的 X11、`libstdc++`、`libdrm`、`libzstd` 和 `libegl1` 放在 `/opt/triverse-env/extra-lib`。只有 `bin/blender` 会设置 `LD_LIBRARY_PATH`
- 容器本身不设置 `LD_LIBRARY_PATH`，避免影响 Canvas 里的 Node
- `BLENDER_BIN=/opt/triverse-env/bin/blender`

技能目录 `agent/canvas_skills/<name>/SKILL.md` 只读挂到 `/home/openhands/.agents/skills`。名字覆盖 Hi3D 1.1.7 的 62 个技能和 50 个工作流，另加路由技能 `triverse-canvas`。正文是为本仓库写的，告诉代理调用哪个工具。对话开始时只放入名称和描述，正文在调用技能时再读。已经打开的旧对话不会自动看到新技能或新 MCP，需要新开一条对话。

Canvas 的默认对话模型是 `openai/claude-haiku-5-5`，基址是 `https://api.teamorouter.cn/v1`。同一 Teamo 连接下还有 `gpt-6-astra`、`gpt-6-sol`、`claude-opus-5-5`、`claude-sonnet-5-5`、`deepseek-flash`、`glm-5.3-flash`。只改容器环境变量不会写入这份设置。密钥留在 Secret `openhands-llm`。MCP 名称是 `triverse`。Blender 4.2 的布尔运算使用求解器 `EXACT`。

注册 MCP 时只改 Canvas 的设置存储，不把密钥写进 Git。见 [docs/deployment.md](docs/deployment.md)。

## 明确不做

- 不调用 `api.hitem3d.ai`，不用 Hi3D 客户端冒充未实现的能力
- 不把 API key、token、密码写入 Git、镜像或文档
- 不修改节点 containerd / runtime 配置
- 不把 `/mnt/jfs-ssd` 整盘挂进 agent 容器
- 不增加 [docs/triverse-api.md](docs/triverse-api.md) 未列出的 Triverse 路径
