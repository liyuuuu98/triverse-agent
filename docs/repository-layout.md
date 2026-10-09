# 仓库布局

最后更新：2026-10-09。npm workspaces：protocol、gateway、web，Node >=22.19.0。

```text
apps/gateway/src/
  agent.ts                 Pi 会话、工具、受限资源加载
  mcp.ts                   MCP OAuth/发现/宿主调用
  mcp-approval.ts           报价收据、完整意图批准、一次性执行
  schema.ts                当前 MCP JSON Schema 校验（未知约束拒绝）
  workflow.ts              图片上传、操作恢复、导出交付
  transfer.ts              公开 HTTPS、固定 DNS、大小/时限控制
  auth.ts                  单所有者访问密钥、cookie、Origin
  projects.ts / storage.ts 项目存储、原子 JSON、旧项目升级
  scene.ts / inspect.ts    场景并发与 GLB/拓扑检查
  tools.ts                 场景/快照/打包/图片工具
  skill-catalog.ts          全资源同步、退役清理、内容哈希
  skill-status.ts           工具依赖和技能状态
  sandbox.ts               可用 OS 沙箱检测，无隔离则无 bash
  server.ts                HTTP/SSE、后台观察、文件下载
  *.test.ts                合同、恢复、几何、认证等测试
apps/web/src/              聊天、能力、访问登录、场景编辑、历史比较
packages/protocol/src/     模型、消息、任务、场景类型与校验
skills/
  catalog.json             8 个技能的依赖、110 个退役名称
  <name>/SKILL.md           路由/生成/输入/贴图/审查/编辑/交付/恢复
  <name>/references|scripts 可选完整资源包（同步支持）
docs/                     当前说明、历史审查、修复记录与工具快照
deploy/k8s/                Namespace、Deployment/Service、Secret 示例
deploy/pi/Dockerfile       可选应用镜像方案，当前清单未使用
```

## 数据

```text
DATA_DIR/
  .pi/                    MCP 配置与 OAuth 凭据、模型目录
  projects/<UUID>/
    meta.json             项目模型/状态
    control/              受保护；不向 Agent 文件工具公开
      approvals.json      一次性授权，不迁移旧工作区授权
      quotes.json         报价收据和 schema
      operations.json     已批准的 operation ID、任务与账单
      exports.json        导出意图、批准、恢复与交付
      upload-<hash>.json   图片指纹与稳定输入/尝试 ID，无租约
      tasks.json          页面任务列表
      versions.json       快照及生成结果来源索引
    workspace/
      AGENTS.md           当前规则（宿主维护）
      project.triverse.json
      scene/scene.json     场景工具维护
      assets/generated/   校验后的生成 GLB（禁止通用覆盖）
      assets/ textures/ refs/ images/ renders/ scripts/ notes/
      versions/<UUID>/    模型/场景快照（禁止通用覆盖）
      exports/            本地资产 ZIP
      .triverse/
        skills/           管理技能完整副本+自定义技能
        skill-version.json 同步内容哈希
        sessions/         Pi 对话会话
        messages.json     网页聊天，合并原子落盘
        terminal.log
```

旧项目打开时创建 control、更新规则；历史版本只迁移可读的工作区文件并标为未验证。旧 `.triverse/approvals.json` 不构成授权，需要重新报价/批准。没有后台 operation 记录的旧对话任务不会被猜测重建。

## 构建

npm run build 按 protocol → gateway → web 构建；npm test 构建 protocol 后运行网关测试。HTTP/MCP 集成测试需允许临时 localhost 监听。

网关依赖 external，部署需要完整 node_modules、package 文件和 protocol/dist。仅复制 gateway/server.js 不足以运行。web/dist 为网页产物。

.gitignore 排除凭据、data、依赖和构建产物。当前 hostPath 为 `pi-app`（只读代码）与 `pi-data`（数据），不使用旧 OpenHands/Canvas 源码。
