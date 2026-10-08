# 仓库布局

**最后更新：** 2026-10-08

相关文档：[README](../README.md)、[架构](architecture.md)、[部署](deployment.md)、[能力矩阵](capabilities.md)。

生产根目录与本地工作副本是同一棵树：

`/mnt/jfs-ssd/liweiyu/triverse_agent`

## 目录

```text
README.md                         入口说明
.gitignore
docs/
  architecture.md
  capabilities.md
  deployment.md
  models.md
  triverse-api.md
  repository-layout.md
agent/requirements.txt            含 openhands-sdk>=1.0.0，不含 pytest
agent/pytest.ini                  在 agent/ 下把当前目录加入 pythonpath
agent/triverse_agent/
  config.py                       环境变量和七个模型 ID
  capabilities.py                 能力清单
  triverse_client.py              公开 API 客户端
  local_tools.py                  工作区、网格、3MF、光顺、ffmpeg、Blender
  mcp_server.py                   本地 MCP。Canvas 已改用 dev MCP，不再部署它
  canvas_catalog.py               30862 技能正文的生成来源
  agent_loop.py                   OpenHands 或兼容工具循环
  openhands_tools.py              SDK 工具包装
  server.py                       FastAPI
  errors.py                       TriverseError
  blender_scripts/                boolean、preview、bake。由 Blender 执行
agent/skills/                     代理说明 *.md
agent/canvas_skills/              30862 的 <name>/SKILL.md
canvas-apps/model-viewer/         Canvas 侧边栏 3D 查看应用。源码在仓库，安装副本在工作区 `_canvas-apps/model-viewer`
agent/tests/                      不携带真实密钥、不访问外网
images/Dockerfile                 只复制 agent/。当前集群不构建它
deploy/k8s/                       命名空间、应用、registry、Canvas、密钥示例
deploy/build_and_load.sh          只 kubectl apply，不构建镜像，不改 containerd
deploy/prepare_ffmpeg_cache.py    在 master01 下载 ffmpeg 依赖并解包到 ffmpeg-root/
deploy/prepare_canvas_env.py     在 master01 准备 Blender、额外动态库和 PATH 包装脚本
deploy/README.md
workspaces/                       运行时数据，不进 git
registry/                         registry 存储，不进 git
reference/                        本地参考 DMG，不参与构建，不参与服务
```

没有 `setup.py` 或 `pyproject.toml`。不要用 `pip install -e`。在 `agent/` 里用该目录的虚拟环境安装 `requirements.txt`，再 `python -m uvicorn triverse_agent.server:app`。

## 技能

`agent/skills/*.md` 是技能目录的唯一来源。不要从 Hi3D 安装包或 `reference/` 加载。

| 文件 | 内容 |
| --- | --- |
| `workspace.md` | 工作区目录；说明文件以 `triverse-` 开头；上传文件保持原名 |
| `image-to-model.md` | 图生 3D |
| `text-to-model.md` | 文生 3D |
| `texturing.md` | 贴图 |
| `remesh.md` | 远程重网格；本地看面数用 `mesh_info` |
| `convert-format.md` | 格式转换 |
| `preview-render.md` | 预览渲染 |
| `image-generation.md` | 文生图 |
| `prompt-optimize.md` | 提示词优化 |
| `local-geometry.md` | trimesh、STL、3MF、光顺、ffmpeg、可选 Blender |
| `gaps.md` | 尚未具备的能力，明确不要改走 Hi3D |

`agent/canvas_skills/` 下面每个子目录只有一份 `SKILL.md`。目录名是技能名。不要在这个目录里放散落的 Markdown，否则 Canvas 会把它们当成技能。正文由 `canvas_catalog.py` 生成，不要从 Hi3D 安装包复制。

## 运行时数据

| 路径 | Git | 谁挂载 |
| --- | --- | --- |
| `workspaces/` | 忽略 | 只挂进 agent。生产 hostPath 同上，容器内 `/data/workspaces` |
| `registry/` | 忽略 | 只挂进 registry。容器内 `/var/lib/registry` |

本地开发时 `WORKSPACE_ROOT` 指向仓库根的 `workspaces/`（从 `agent/` 启动时是 `../workspaces`）。

这两个目录都不要提交。也不要把父级 `/mnt/jfs-ssd` 挂进 agent 容器。

## 不入库

根目录 `.gitignore` 覆盖：

- `.venv`、`__pycache__`、`.pytest_cache`、`*.pyc`
- `.env`、`.env.*`（`!.env.example` 仍可跟踪）
- `workspaces/`、`registry/`、`wheelhouse/`、`debs/`、`ffmpeg-root/`、`canvas-env/`
- `.DS_Store`
- `secrets`
- `kubeconfig`、`*.kubeconfig`

`deploy/.gitignore` 另外忽略 `k8s/secrets.yaml`。`deploy/k8s/secrets.example.yaml` 可以留在仓库里，因为它只有 `REPLACE_ME`。

`reference/` 里的 `hi3d.dmg` 如果在树里，不要改它，不要把它放进构建上下文。Dockerfile 只复制 `agent/`。运行时不挂载、不调用。本服务不是 Electron 客户端。

## 相关文档

- [如何启动与部署](../README.md)
- [已接与尚未具备](capabilities.md)
