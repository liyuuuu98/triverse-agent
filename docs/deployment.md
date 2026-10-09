# 部署

最后更新：2026-10-09。本文描述仓库清单，本次没有向集群发布代码或验证集群运行状态。

## 当前清单

`deploy/k8s/pi-workspace.yaml` 声明 Namespace triverse-agent、Deployment/Service triverse-pi。

| 项目 | 配置 |
| --- | --- |
| 节点/副本/策略 | master03 / 1 / Recreate |
| 镜像 | docker.1ms.run/library/node:22-bookworm |
| 启动 | node /opt/triverse/apps/gateway/dist/server.js |
| 服务 | NodePort 30864 → 8080 |
| 代码 hostPath | /mnt/jfs-ssd/liweiyu/triverse_agent/pi-app → /opt/triverse（只读） |
| 数据 hostPath | /mnt/jfs-ssd/liweiyu/triverse_agent/pi-data → /data |
| 推理凭据 | openhands-llm Secret / apiKey |
| 工作区访问密钥 | triverse-workspace-access Secret / token（新增必需） |
| 权限 | uid/gid 0，privileged=false，allowPrivilegeEscalation=false |
| 资源 | requests 200m/512Mi；limits 2 CPU/4Gi |

Node 基础镜像读取预构建目录，不在 Pod 内 npm build。完整目录必须包含网关/网页/protocol 产物、package 文件与 node_modules。当前清单未使用 deploy/pi/Dockerfile 应用镜像。

入口配置为 [节点 .211](http://10.15.127.211:30864/)、[节点 .212](http://10.15.127.212:30864/)、[节点 .213](http://10.15.127.213:30864/)，实际可达性需部署后检查。

## 访问与执行

默认本地监听 127.0.0.1；Pod 设置 HOST=0.0.0.0，并从 Secret 注入 WORKSPACE_ACCESS_TOKEN。缺密钥时对外监听拒绝启动。浏览器输入密钥，8 小时 HttpOnly/SameSite=Strict cookie；变更请求检查 Origin。对外部署应通过 HTTPS 入口传输访问密钥与会话。

这是单所有者部署，同一 DATA_DIR 共用 MCP 身份；不是多人租户系统。审批/任务/操作/导出/版本放 workspace 外的 control，模型不能直接修改。

Shell 只有在可运行的 sandbox-exec/bubblewrap 内启用；没有工具或系统禁止隔离时关闭。当前基础 Node 镜像不安装 bubblewrap，所以没有 bash 工具。不要以 privileged、放开整个 /data 或关闭隔离来恢复 Shell。SANDBOX_MODE 旧标记已移除，不再误称进程 cwd 为沙箱。

root 配置是现有 JuiceFS hostPath 写权限的兼容方案；如果卷权限允许，应另行改为专用非 root UID。网关宿主仍能访问其数据，访问密钥不构成每用户的磁盘隔离。

## 环境变量与 OAuth

DATA_DIR=/data、WEB_DIST=/opt/triverse/apps/web/dist、SKILLS_DIR=/opt/triverse/skills、PORT=8080。TEAMO_BASE_URL 默认 TeamoRouter /v1，TRIVERSE_MCP_URL 默认 dev MCP。

登录由 **Capabilities → MCP** 发起，凭据 `/data/.pi/mcp-auth.json`。默认回调 127.0.0.1:8791；远程浏览器无法回到 Pod 时，可把完整回调地址粘贴到面板 Redirect address，state 校验仍生效。

如部署服务已注册 HTTPS OAuth 回调，可设置 MCP_CALLBACK_URL，网关在其 pathname 接收回调并校验 state，无需开放额外端口。注册回调 URI 是否被服务接受需上线配置验证，不能仅修改 URL。

切换 MCP 环境时同步配置 TRIVERSE_OAUTH_CLIENT_ID、TRIVERSE_AUTH_METADATA_URL，必要时 TRIVERSE_RESOURCE_METADATA_URL；不会从任意 MCP URL 猜测授权服务器。

不使用 Triverse API key 或直接业务 API 回退。上传宿主流程已内置，不需安装旧 triverse-mcp-local-upload CLI。生成、原始模型导出分别审批，实际产出质量需批准后验证。

## 部署检查

1. 本地 npm ci --ignore-scripts、npm test、npm run build。
2. 备份 pi-data，复制完整可运行目录到 pi-app。
3. 从受保护环境建立 openhands-llm 与 triverse-workspace-access Secret，勿提交真实值。
4. apply 当前清单并重新启动 Deployment；检查登录、Capabilities 的 connected/toolCount。
5. 经用户批准具体报价后才进行付费生成验收；/health 只检查网关响应。

startup/readiness/liveness 均 GET /health；间隔 10/10/20 秒，startup 失败阈值 30，liveness 阈值 6。不检查模型、OAuth 或付费链路。

现有数据升级不继承旧工作区的授权；无 operation 账本的旧聊天不会自动提交付费任务。技能目录在创建、能力读取和新会话时按内容哈希同步，清理退役副本。
