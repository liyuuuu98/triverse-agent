# 部署

**最后更新：** 2026-10-08

相关文档：[README](../README.md)、[架构](architecture.md)、[仓库布局](repository-layout.md)、[对话模型](models.md)、[部署脚本说明](../deploy/README.md)。

清单在 `deploy/k8s`。构建入口是 `deploy/build_and_load.sh`。本文不记录密钥值。

## 放哪

| 对象 | 位置 |
| --- | --- |
| 代码 | `/mnt/jfs-ssd/liweiyu/triverse_agent` |
| 命名空间 | `triverse-agent` |
| 应用 Pod | `master03`（主机名 `master03`，`10.15.127.213`） |
| 应用镜像 | `docker.1ms.run/library/python:3.12-slim-bookworm` |
| 应用拉取策略 | `imagePullPolicy: IfNotPresent` |
| Canvas | `ghcr.nju.edu.cn/openhands/agent-canvas:1.25.0`，NodePort **30862**，路径 `/canvas/` |
| Canvas 入口 | <http://10.15.127.211:30862/canvas/> |
| registry Pod | 同样在 master03 |
| registry 镜像 | `docker.1ms.run/library/registry:2` |
| registry 拉取策略 | `IfNotPresent` |
| registry Service | `triverse-registry`，NodePort **30500** → 容器 5000 |
| registry 数据 | hostPath `/mnt/jfs-ssd/liweiyu/triverse_agent/registry` → `/var/lib/registry` |
| 工作区 | hostPath `/mnt/jfs-ssd/liweiyu/triverse_agent/workspaces` → `/data/workspaces` |
| 3D 凭据 | Secret `triverse-api`，字段 `apiKey` |
| 对话凭据 | Secret `openhands-llm`，字段 `apiKey` |
| 访问门 | Secret `session-api`，字段 `sessionApiKey` |

NodePort 在各节点上打开，所以 master01（`10.15.127.211`）、master02（`10.15.127.212`）、master03（`10.15.127.213`）的 30862 和 30500 都能进 Service。Pod 本身只调度到 master03。自建页面的 NodePort 30861 已删除。

## 节点与污点

应用和 registry 的清单都是：

```yaml
nodeSelector:
  kubernetes.io/hostname: master03
tolerations:
  - key: node-role.kubernetes.io/control-plane
    operator: Exists
    effect: NoSchedule
```

不要把这两个 Deployment 改到 master02。不要为了调度去改 master02 或其他节点的 containerd / runtime。

`/mnt/jfs-ssd/dashboard` 的做法是单副本、hostPath、固定到某一台 master。不要照搬那个工作负载的节点，也不要照搬它挂整块 `/mnt/jfs-ssd` 的方式。不要在 master03 上用 `nerdctl --namespace k8s.io build` 构建应用镜像。master03 没有 buildkit，当前部署也不安装它。

## 不要改运行时

`deploy/build_and_load.sh` 在 master01 上执行。它只 `kubectl apply` 命名空间、registry、应用和 Canvas，然后等待这三个 Deployment。它不构建镜像，不编辑 `/etc/containerd` 或 `config.toml`，不登录 master02 改配置，也不把 `:30500` 配成 insecure registry。

Canvas 使用已经导入的 `ghcr.nju.edu.cn/openhands/agent-canvas:1.25.0`。registry 使用 `docker.1ms.run/library/registry:2`。两者都是 `IfNotPresent`。应用 Pod 不从 30500 pull 自己。

代码必须已经在 `/mnt/jfs-ssd/liweiyu/triverse_agent`。脚本不创建 Secret。

## 密钥

三个 Secret 必须在 `bash deploy/build_and_load.sh` 之前存在，否则 Pod 会因缺少 `secretKeyRef` 起不来。字段名必须与清单一致。

先有命名空间：

```bash
kubectl apply -f deploy/k8s/namespace.yaml
```

再从当前 shell 的环境变量创建（不要把值写进文件后提交）：

```bash
kubectl -n triverse-agent create secret generic triverse-api \
  --from-literal=apiKey="$TRIVERSE_API_KEY"
kubectl -n triverse-agent create secret generic openhands-llm \
  --from-literal=apiKey="$LLM_API_KEY"
kubectl -n triverse-agent create secret generic session-api \
  --from-literal=sessionApiKey="$SESSION_API_KEY"
```

`SESSION_API_KEY` 可以为空字符串，这样服务不检查访问门，但 Secret 对象仍要存在。非空时，页面请求要带 `X-Session-Api-Key`。`GET /health` 不检查。

`deploy/k8s/secrets.example.yaml` 只有字段名和 `REPLACE_ME`。不要把复制出来的 `deploy/k8s/secrets.yaml` 提交。`deploy/.gitignore` 已忽略它。

两把外部 API 的 key 不能混用。

## 构建与发布

master03 没有 buildkit，所以当前不在节点上构建自定义镜像，也不安装 buildkit，不改 containerd。应用容器直接使用集群已经能拉取的 `docker.1ms.run/library/python:3.12-slim-bookworm`。Pod 使用普通 Pod IP，不设置 hostNetwork，不额外占用节点端口。

容器网卡访问外网大约 200KB/s。`http://10.15.127.213:7890` 从 Pod 里测速同样约 200KB/s，所以安装不走这个代理，也不在 Pod 里 apt 或 pip。Python 轮子和 ffmpeg 都在 master01 上用本机网络下载到 JuiceFS，再只读挂进 Pod：

- `wheelhouse/` → `/opt/wheelhouse`。142 个 Python 3.12 的 wheel，来自清华镜像，标签不高于 `manylinux_2_34`。
- `ffmpeg-root/` → `/opt/ffmpeg`。Debian bookworm 的 ffmpeg 依赖包解包后的目录，`/opt/ffmpeg/bin/ffprobe` 是包装脚本。
- `canvas-env/` → `/opt/triverse-env`。Blender 4.2.16、`extra-lib` 里的 X11 / `libstdc++` / `libdrm` / `libzstd` / `libegl1`，以及 `bin/blender`、`bin/ffmpeg`、`bin/ffprobe`。用 `python3 deploy/prepare_canvas_env.py` 生成。它不给主机安装软件包。布尔运算使用 Blender 4.2 的 `EXACT` 求解器。
- `venv/` → `/opt/venv`。这是以前本地 MCP 用的环境。Canvas 已不再挂载它。`/opt/venv` 如果还在，是挂载点，不能 `rm -rf` 这个目录。

这些缓存不进 git。重新生成 ffmpeg 目录用 `python3 deploy/prepare_ffmpeg_cache.py`，只在 master01 的项目目录里写文件，不给主机安装软件包。`images/Dockerfile` 仍保留，等节点有 buildkit 之后可以改回自包含镜像。

Canvas 把工作区挂到 `/projects` 和 `/home/openhands/workspace`，把 `agent/canvas_skills` 只读挂到 `/home/openhands/.agents/skills`。

Canvas 不再运行本地 MCP。设置里的服务器名仍是 `triverse`，地址是 `https://dev-mcp.triverse.ai/mcp`，传输 `http`，超时 300 秒，认证是 OAuth（`client_id` 为 `codex-dev-mcp`，不带 `oauth_resource`，也不再带访问密钥头）。已经打开的旧对话不会自动载入新的 MCP，需要新开对话。用户要在浏览器里亲自同意授权。

应用容器的环境变量由 Deployment 注入，其中 `LLM_MODEL=openai/claude-haiku-5-5`，`AGENT_ENGINE=auto`，`WORKSPACE_ROOT=/data/workspaces`，`TRIVERSE_BASE_URL` 与 `LLM_BASE_URL` 写在清单里而不是 Secret 里。Canvas 对话不读这些变量。它的设置写在 LLM profile 里：Provider Connection 名称是 Teamo，供应商 `openai`，基址 `https://api.teamorouter.cn/v1`，密钥来自 Secret `openhands-llm`。默认 profile 是 `claude-haiku-5-5`，模型名 `openai/claude-haiku-5-5`。同一连接下还有 `gpt-6-astra`、`gpt-6-sol`、`claude-opus-5-5`、`claude-sonnet-5-5`、`deepseek-flash`、`glm-5.3-flash`。代理种类用 `openhands`，才会带上 MCP `triverse`。

启动探针 `failureThreshold` 是 180，大约 30 分钟。离线安装通常几分钟。就绪和存活探针都是 `GET /health`。

资源：应用 request 500m CPU / 1Gi 内存，limit 2 CPU / 6Gi 内存。registry request 100m / 256Mi，limit 1 CPU / 1Gi。

hostPath 类型是 `DirectoryOrCreate`。禁止把下面任一路径挂进 agent 容器：

- `/mnt/jfs-ssd`
- `/mnt/jfs-ssd/liweiyu`
- `/mnt/jfs-ssd/liweiyu/triverse_agent`（会带上 `registry/` 和仓库其他内容）
- `/mnt/jfs-ssd/dashboard`

registry 的数据目录只挂给 registry 容器。

Secret 就绪后：

```bash
bash deploy/build_and_load.sh
```

## 部署后检查

- Pod 在 master03，不在 master02
- 打开 <http://10.15.127.211:30862/canvas/> ，页面标题是 OpenHands。默认模型是 `claude-haiku-5-5`
- 侧边栏有「3D 模型」，地址 `/canvas/extensions/model-viewer/viewer`。应用装在 Canvas 状态目录里，源目录是工作区 `/projects/_canvas-apps/model-viewer`
- agent 挂载源是 `.../workspaces`，挂载点是 `/data/workspaces`
- registry 数据在 `.../registry`，NodePort 30500 对应容器 5000
- 没有任何节点的 containerd 配置因这次部署被修改

检查时不要把 Secret 打进会提交的日志。

## 禁止

- 修改 master01、master02、master03 或任何其他节点的 containerd / runtime 配置
- 把应用或 registry 调度到 master02
- 在节点上用 `nerdctl --namespace k8s.io build` 构建应用镜像，或为了构建去安装 buildkit
- 为了拉取 30500 而把该地址写进 containerd
- 把整块 `/mnt/jfs-ssd` 挂进 agent 容器
- 在 Git 或镜像中存放三个 Secret 的值

## 相关文档

- [架构图](architecture.md)
- [目录](repository-layout.md)
