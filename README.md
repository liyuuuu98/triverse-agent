# Triverse Agent

最后更新：2026-10-09

面向 3D 创作的浏览器 Agent 工作空间：Pi 代理循环、Node 网关、React 聊天、GLB 场景视口。Triverse 业务通过 OAuth MCP 接入；对话与独立图片生成使用 TeamoRouter。

已实现完整意图审批、参考图上传、持久化任务观察、经批准的原始模型导出、文件校验、场景登记、资产检查与本地 ZIP 交付。远程生成质量与付费链路仍需在用户批准具体报价后进行实测；本次没有消耗生成或导出额度。

## 本地运行

Node.js `>=22.19.0`，复制 `.env.example` 为 `.env`，填写 `TEAMO_API_KEY`：

```bash
npm ci --ignore-scripts
npm run build
npm start
```

默认打开 [本地工作区](http://127.0.0.1:8080/)，绑定 `127.0.0.1`。对外绑定 `HOST=0.0.0.0` 时必须设置 `WORKSPACE_ACCESS_TOKEN`；页面先输入访问密钥，凭据仅保存为 HttpOnly 会话 cookie。

默认对话模型 `claude-haiku-5-5`，选项在 protocol 包定义。`generate_image` 使用 TeamoRouter 的 `gpt-image-2.5-sunburst`，固定 `1024x1024`、`quality: high`，只用于用户明确要求的图片创作，会消耗图片额度。

## MCP 与生成

通过 **Capabilities → MCP → Sign in** 登录，无需 Triverse API key。OAuth 凭据位于 `DATA_DIR/.pi/mcp-auth.json`。默认 MCP 为 `https://dev-mcp.triverse.ai/mcp`；2026-10-09 快照包含 23 个工具，运行时以实际 schema/profile 为准。

- `quote_*` 返回真实报价；`request_creation_approval` 绑定完整 prompt/source、visibility、operation ID 和 max credits。批准一次只能使用一次，有效期为报价后 30 分钟。
- 本地参考图通过 `upload_reference` 上传并验证 READY source。聊天支持 PNG/JPEG/WebP/GIF；GIF 仅可用于对话，3D 输入需 PNG/JPEG/WebP/AVIF。
- 后台每 15 秒观察已批准 operation，恢复时查询同一 ID，不重复付费创建。
- 导出需独立批准，因为 MCP 没有导出报价接口且可能消耗导出额度。仅请求原始格式，不自动转换或重试转换；得到唯一自包含 GLB 后校验并入场景。
- 可下载 GLB、比较历史资产，或通过 `export_asset_pack` 打包带检查报告和哈希的 ZIP。

当前未接入独立的重网格、远程渲染、多视图生成、拆件、绑骨、动作生成和打印修复。不要把其他平台功能当成当前服务能力。

## 技能和场景

技能从 114 个收敛为 8 个：路由、文字生成、图生模型、重新贴图、网格审查、场景编辑、交付审查、任务恢复。删除 110 个旧 Canvas/缺工具/重复细分技能；保留 4 个并重写，新增 4 个。

`skills/catalog.json` 声明依赖与退役名单。已有项目同步完整技能资源，清理退役副本，保留自定义技能；缺少依赖的技能标为 `needs-tools`，不供模型自动调用。

场景支持位置/旋转/缩放、父子层级、可见性、灯光、相机预设/目标、线框、GLB 内嵌动画播放和 PNG 预览导出。版本与并发编辑受检查，模型加载失败显示错误。本地拓扑审查有规模上限，不证明可打印。

## 执行和部署

这是单所有者工作区：同一 DATA_DIR 共用 MCP 身份。访问密钥不是多租户账号系统。审批、操作、导出、任务和版本索引在项目 `control/`，模型不能直接写入。

Shell 仅在可用的 macOS sandbox-exec 或 Linux bubblewrap 隔离内提供；网络关闭、控制目录不可访问，隔离不可用时禁用 Shell。当前 K8s 基础 Node 镜像未安装 bubblewrap，因此默认不提供 Shell。

K8s 清单配置 NodePort 30864、master03 和 hostPath；源码修改没有自动部署到集群。更新清单需要先配置工作区访问密钥。详见 [部署](docs/deployment.md)。

| 文档 | 内容 |
| --- | --- |
| [架构](docs/architecture.md) | 当前组件与边界 |
| [MCP 与生成](docs/mcp-and-generation.md) | 实际协议和恢复行为 |
| [修复记录](docs/remediation-2026-10-09.md) | 修复、技能删减、验证与限制 |
| [仓库布局](docs/repository-layout.md) | 源码、数据和构建产物 |
| [部署操作](deploy/README.md) | 部署前提与范围 |
| [原始审查及 Hi3D 对比](docs/project-review-2026-10-09.md) | 修复前发现与官方功能对照 |
