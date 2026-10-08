# 部署

应用跑在命名空间 `triverse-agent`，Pod 固定在 `master03`。

- OpenHands 官方界面 NodePort `30862`：`http://10.15.127.211:30862/canvas/`。镜像内容与 `ghcr.io/openhands/agent-canvas:1.25.0` 相同，拉取地址是 `ghcr.nju.edu.cn/openhands/agent-canvas:1.25.0`。不在节点上构建。MCP 使用 `https://dev-mcp.triverse.ai/mcp`，Pod 内不再监听 `8090`。技能来自 `agent/canvas_skills`，Blender 和 ffmpeg 来自 `canvas-env/` 与 `ffmpeg-root/`。自建页面和 NodePort 30861 已删除。
- 专属仓库 NodePort `30500`

master03 上没有 buildkit，所以不在节点上构建自定义镜像，也不安装 buildkit。应用容器使用集群已经能拉取的 `docker.1ms.run/library/python:3.12-slim-bookworm`，普通 Pod IP，不设置 hostNetwork。ffprobe 来自 `ffmpeg-root/`，Blender 4.2 来自 `canvas-env/`，都不在 Pod 里 apt。

准备 Blender 目录：

```bash
python3 deploy/prepare_canvas_env.py
bash deploy/build_and_load.sh
```

`build_and_load.sh` 会 apply Canvas 清单并等待 `deploy/openhands-canvas`。它不构建镜像，也不改 containerd。

不要修改任何节点的 containerd 或运行时配置，尤其不要改 master02。专属仓库已经用 NodePort 30500 提供服务。kubelet 不需要把这个地址配成镜像仓库。

密钥用三个 Secret：`triverse-api`、`openhands-llm`、`session-api`。示例在 `k8s/secrets.example.yaml`。真实文件不要提交。
