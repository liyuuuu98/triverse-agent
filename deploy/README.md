# 部署操作

最后更新：2026-10-09。当前清单为 k8s/pi-workspace.yaml；本次修复未部署到集群。

apply 前准备：

- 在 triverse-agent 命名空间配置 openhands-llm/apiKey 和新增 triverse-workspace-access/token Secret。参考 secrets.example.yaml，真实值不提交。
- 备份 /mnt/jfs-ssd/liweiyu/triverse_agent/pi-data。
- pi-app 必须是完整 npm 运行目录，含 node_modules、protocol/dist、gateway/dist、web/dist。先本地测试并构建，再同步；不能只复制 server.js。
- master03 能访问两个 hostPath 和 Node 基础镜像。

```bash
kubectl apply -f deploy/k8s/pi-workspace.yaml
kubectl rollout restart deployment/triverse-pi -n triverse-agent
kubectl rollout status deployment/triverse-pi -n triverse-agent
```

清单为单所有者工作区，NodePort 30864 → 8080，HOST=0.0.0.0，外部监听强制访问密钥。首次打开网页输入工作区密钥，再通过 Capabilities → MCP 登录业务身份。HTTPS 回调需要服务预先注册；否则使用 Redirect address 粘贴方式。

当前基础 Node 镜像无 bubblewrap，Shell 禁用；上传、审批、场景编辑、资产检查、任务恢复和下载均由专用工具执行。隔离不可用时没有未受限 bash 回退。

uid/gid 0 是现有 JuiceFS 权限兼容配置；不启用 privileged、hostNetwork 或 docker.sock。deploy/pi/Dockerfile 是可选后续镜像方案，当前 Pod 不运行该应用镜像。

/health 仅验证网关响应。模型服务、MCP 连接、真实产出需分别验证；生成和原始导出分别需要具体意图批准。本次没有消耗额度。

详细配置与旧项目迁移见 [部署说明](../docs/deployment.md)，业务流程见 [MCP 与生成](../docs/mcp-and-generation.md)。
