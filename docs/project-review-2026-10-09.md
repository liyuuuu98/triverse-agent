# Triverse 项目审查与 Hi3D 功能对比

> 历史审查：以下实现状态记录于修复前，线上状态未因本地修改自动改变。当前源码行为与验证结果见 [修复记录](remediation-2026-10-09.md)、[MCP 与生成](mcp-and-generation.md)。
审查日期：2026-10-09。范围是当前工作区的 Pi 版本、现有本地数据和已登录的 Triverse MCP。未执行付费生成、重新贴图或资产导出，未修改实现代码。Hi3D 信息通过 ego-browser 技能读取官方公开页面；功能声明不等于已实测的质量或成功率。

整体判断：Pi + MCP + skill + 浏览器视口的分工合理，但目前业务契约、skill 内容和生成后的落地流程没有对齐。最高优先级是适配真实 MCP 审批协议、清理旧 skill、建立持久化任务到资产到视口的流程。

1. **MCP 架构可以保留，审批实现必须先修。**

   当前是一个 Triverse Streamable HTTP MCP，OAuth 凭据持久化；本地只提供 read、write、edit、bash 和 inspect_asset。按真实 schema 发现远程工具、使用稳定 operation_id / export_id 恢复不确定结果，这些设计方向合理。不需要为了数量再拆多个 MCP。

   实际发现 23 个远程工具，所有 inputSchema 都没有 confirm。付费创建包括 create_image_to_model、create_text_to_model、create_retexture，报价分别是独立的 quote_*。创建接口要求 operation_id、max_credits、visibility 等。

   apps/gateway/src/mcp-approval.ts:43 的逻辑只有在 input.confirm=true 或 schema 含 confirm 时才进入审批处理。用真实 schema 做本地模拟，未审批的 create_text_to_model 没有返回 block，quote_text_to_model 没有发出 approval 事件。因此网关的审批约束没有覆盖当前付费接口；这不是实际扣款验证，服务端仍可能有其他限制。

   建议显式配置 quote→create 映射。报价成功后展示 credits_cost、公开/私有、输入、profile 和完整拟创建内容；服务器保存批准记录，创建时校验批准的意图、额度上限和唯一 operation_id。quote_text_to_model 不包含 prompt，不能仅按报价参数批准任意后续 prompt。重新贴图的报价参数与创建参数也不完全相同，需规范化而非简单比较两个输入对象。

   记录 pricing_version、parameter_registry_version 和 normalized_parameters，设定报价有效期；参数、价格或用途变化时重新报价。未知的付费写工具默认不能直接执行。export_model 会涉及导出意图和下载配额，也应按其实际业务规则处理，而不是视为普通 GET。

   approvals.json 位于 agent 可写的 workspace/.triverse 内，批准记录本身不应由 agent 修改。需要把授权数据放到受保护的服务端存储，并配合执行隔离；仅移动路径不足以约束不受隔离的 bash。

   OAuth 的云端体验也应调整：当前远程部署需要用户粘贴 localhost 回调地址，适合作为临时恢复入口；正式网页工作区应使用服务端可达的 HTTPS 回调。TRIVERSE_MCP_URL 可配置，但授权 metadata 和 clientId 仍固定为 dev 环境，切换环境时应一起配置或从受信任的 metadata 发现。界面中的 signed-in 只表示有 token，连接是否有效应继续以实际 MCP 连接为准。

2. **114 个 skill 中，113 个仍是旧 Canvas 内容。**

   本地 Pi loadSkills 和运行网关 /api/capabilities 都返回 114 个 skill，113 个包含 OpenHands Canvas / 30862 的旧环境说明。许多 skill 引用 mesh_info、model_remesh、mesh_audit、media_convert、list_workspace_files 等当前工具列表里不存在的名字。文档中的“唯一 skill”描述已经与运行时不符。

   create-game-ready-asset 虽然使用新的 mcp__triverse__ 前缀，仍要求远程 remesh 和 render；当前 23 个工具没有提供这两项。它重复 inspect_asset，并把 50,000 三角形作为通用界限。这个数字不能代表所有游戏资产的预算；面数之外还需考虑纹理、材质、UV、法线、尺寸、枢轴、碰撞体和目标平台。

   createProject 会复制全部 SKILL.md 到项目，loader 又加载项目副本和全局目录。实测一个已有项目出现 114 个名称冲突，项目副本胜出。修改全局 skill 不会自动更新已有项目；复制函数还只复制 SKILL.md，未来添加 scripts/、references/ 等资源时会遗漏。

   建议先保留 6–8 个与真实工具对应的核心流程：能力选择、文字生成、图片输入与生成、重新贴图、任务恢复、资产导出与预览、资产检查、版本管理。游戏、打印、头像等可作为目标模板；只有对应工具和验证流程到位后再启用专项 skill。

   增加 requiresTools、适用输入、产物、通过条件和失败恢复信息，由网关按当前能力过滤。把尚未支持的能力列在能力表里，避免为每个缺口注册一个看似可执行的 skill。技能采用明确版本；项目选择跟随全局版本或固定版本，避免静默副本覆盖。保留工作区读取边界时，可物化一个版本化 skill 包，而不是加载两份同名内容。

3. **图片附件还没有可靠接通远程生成输入。**

   saveChatImages 把图片放到 refs/ 并给对话模型读取，这是正确的素材接收流程。但云端生成需要 READY 的 source={asset_id,item_id,file_id}，不能直接接受 refs/ 路径。

   当前 MCP 说明要求 triverse-mcp-local-upload inspect → start_image_input → prepare_local_upload → put → finalize_local_upload → verify。仓库及部署清单没有安装该 helper，本次本机 PATH 也没有这个命令；远端 Pod 是否另行安装未核实。当前代码没有负责这条链路的宿主工具。

   建议增加 upload_reference 宿主工具，负责路径边界、MIME、大小、SHA-256、稳定 attempt_id、上传和 READY 校验，向模型只返回可引用的云端身份。短期上传租约由宿主内部传递，不让模型把租约写入 bash 命令、对话或长期日志。这属于完成 MCP 授权的文件传输，不需要重新引入旧的直接业务 API。

   前端接受 GIF，远程 prepare_local_upload 的枚举只有 PNG/JPEG/WebP/AVIF，应统一输入格式或做显式转换。上传多张图片也不等于支持多视图生成；当前 image-to-model 的输入是一个 source。

4. **生成流程需要代码保证，不能依赖模型补齐任务、文件和场景。**

   tasks.json 和 versions.json 在项目创建时初始化，HTTP 提供读取接口，但业务代码没有自动根据 MCP 创建、完成、导出事件写入它们。它们可能由 agent 自己写文件，因此不能作为可靠任务账本。

   translate 目前把远程结果变成最多 400 字的工具摘要，没有把 structuredContent 中的 operation_id、task_id、result references、账单、恢复动作和进度纳入业务状态。导出返回 FileManifest（URL、有效期、大小、SHA-256），不是直接写入 workspace 的 GLB。代码没有负责下载、校验、版本登记和场景注册的完整桥接。

   create-game-ready-asset 只要求先读取 scene.json，没有明确要求把新资产添加到 objects / activeAssetId / selectedIds 并增加 version。视口只显示 scene.objects 中的本地 GLB。因此任务成功、文件到位、模型出现在视口是三个不同的条件，应该由同一个落地步骤保证。

   建议持久化流程如下：

   ```text
   明确目标及当前选中资产
     → 校验输入与 profile 能力
     → 上传并校验 READY（图片输入时）
     → 获取报价、批准完整创建意图
     → 先保存 operation_id，再提交 create
     → 后台同步 task 和 billing
     → 选择确切 asset/item/file/candidate
     → 保存 export_id，再请求 export
     → 下载文件、校验大小与 SHA-256
     → 本地检查与预览
     → 原子登记版本和场景，推送 scene 事件
     → 交付；按需要另行批准重新贴图或优化
   ```

   请求结果未知时先 get_operation，导出结果未知时先 get_export；按 next_action / recovery_action / retry_after_seconds 处理，避免换新 ID 重提付费意图。get_task 读取持久化状态，refresh_task 才负责同步，不能假设单纯重复 GET 会主动刷新所有上游进度。后台任务应独立于聊天轮次和浏览器连接，重启后能继续观察原任务。

   本地预览先用现有视口，远程渲染只在确有服务且用户需要成片时使用。重新贴图和重新生成应明确区分；保留原模型，形成版本关系，避免每次修改都重生成几何。

5. **视口、检查和交付的语义需要收紧。**

   当前视口支持 GLB、旋转、缩放、选择、网格和重置。scene.camera 没有被消费，mode 只显示为文字；对象按数组位置固定间隔摆放。协议没有对象 position / rotation / scale，不适合表达真正的场景搭建。加载异常被 ModelBoundary 静默隐藏，固定单位大小的选中框也不代表模型尺寸。

   优先增加按真实包围盒聚焦、自适应选中框、可见加载错误、资产卡片及真实下载操作，再加入变换、版本比较和动画播放。skill 中的 [View] / [Compare] / [Download] 是普通输出文本，当前 UI 没有与它们对应的结构化动作。

   inspectGlb 只读 metadata：bounds 只取第一个 primitive；面数默认 count/3，未考虑其他 primitive.mode；也没有汇总节点变换、实例、贴图大小、UV、动画等。它适合粗略统计，不应成为 game-ready / print-ready 认证。非 GLB 文件还返回普通成功结果“not a mesh”，应该为要求网格的流程产生明确失败。

   apps/gateway/src/server.ts:336 没有用 turn.failed 决定最终状态：模型以 error 事件结束但 promise 未抛出时，仍可能写回 idle。每个流事件都异步覆盖 messages.json，也缺少串行及原子写入保障。建议独立保存业务状态，消息使用追加日志或节流快照，并确保最终 error 状态不被 done 覆盖。

6. **执行边界有明确的代码问题。**

   prepareBash 仅设置初始 cwd、精简环境、拦截部分敏感关键词。临时目录验证表明命令 cd ..; pwd 仍能离开 workspace。部署文档已经说明 process 模式不是容器隔离，但 README/agent 指令中“shell 出不了工作区”的表述过强。

   inspect_asset 只调用 resolveInside，没有像文件 read/write 工具一样调用 realInside。临时目录中，工作区内指向工作区外文件的 symlink 可以被它读取。本次使用无敏感内容的 fixture 验证，未读取真实密钥。

   现有 HTTP 入口没有用户认证，所有项目共用 DATA_DIR/.pi 的 MCP 身份；部署容器为 root，挂载整个 /data。当前方式适合受控单人环境。如果要多人使用，需要账号/项目权限、每用户凭据、受保护审批账本，以及每项目受限容器或 Job。增加同等权限的 sidecar 不会自动形成隔离边界。

7. **与 Hi3D 的差别，主要在真实能力覆盖和交付完整性。**

   必须分别比较 Hi3D Agent 桌面客户端和 Hi3D 网页平台。Agent 官方 FAQ 明确客户端支持预览，但当前不支持直接手动编辑；网页平台的 Maker Studio 能力不能直接算作 Agent 自身手动编辑能力。[Hi3D Agent 官方说明](https://www.hi3d.ai/hi3d-agent)

   | 维度 | 当前项目可确认的接入 | Hi3D 官方公开说明 |
   | --- | --- | --- |
   | 产品形态 | 云端浏览器工作区，Pi harness，多个可选对话模型 | Agent 是桌面客户端，部分处理在云端 |
   | 文字/图片生成 | 两种生成都有 quote/create 接口；尚未验证付费端到端结果 | 提供对话生成与迭代流程 |
   | 贴图 | 当前已提供文字/图片参考重新贴图；texture_size 为 1024–4096 | 网页平台提供风格贴图；v3.0 官方宣传最高 8K |
   | 重网格/几何优化 | 当前 23 个工具没有 remesh 接口 | Agent 页面展示几何与网格优化流程 |
   | 角色动画 | 当前无绑骨、动作重定向工具 | Agent 页面展示人形绑骨动画 |
   | 低模头像 | 旧 skill 提到重网格，但实际缺对应工具 | Agent 页面展示低模头像、基础绑定及表情 |
   | 游戏原型 | 可以用文件/bash 写代码；旧 game skill 未与当前工具接通，无专用试玩入口 | Agent 页面展示模型到互动场景与小游戏流程 |
   | 打印 | 当前无拆件、多色、打印检查专用接口；显式格式转换限定 GLB/OBJ | 网页平台提供拆件、多色、STL/3MF 等导出及切片器衔接 |
   | 预览/编辑 | 浏览器 GLB 预览；尚无直接几何编辑 | Agent 支持文件预览，FAQ 明确目前无直接手动编辑 |
   | 成本展示 | 对话模型走 Teamo，业务走 Triverse credits，缺统一消费展示 | Agent FAQ 说明对话 token 与业务调用统一换算为 credits |

   Hi3D Agent 的 skill、动画、低模头像、小游戏及计费信息来自其[官方 Agent 页](https://www.hi3d.ai/hi3d-agent)；几何分辨率和最高纹理规格来自[v3.0 页](https://www.hi3d.ai/hi3d-3-0)；打印、格式及切片器流程来自[官网首页](https://www.hi3d.ai/)。这些是官方声明，本次没有下载客户端、生成样本或比较模型质量。2048³ 是官方几何分辨率表述，不能当成最终多边形数。

   当前项目的可发展方向是网页项目空间、可替换业务服务、可追踪的授权和版本、可扩展的宿主工具。Hi3D 已经提供更多完整业务场景；增加同名 skill 不会自动获得这些能力。建议先让“单资产生成→显示→改贴图→新版本→下载”可靠成立，再选择游戏资产或打印工作流中的一条扩展。

8. **实施顺序和验证结果。**

   第一阶段：按真实 quote/create 协议重做审批；保护批准记录；清理或禁用旧 skill，迁移已有项目副本；让 capability 面板只显示可用能力。

   第二阶段：补齐宿主上传与下载工具、持久化 operation/task/export 状态、后台恢复、版本和场景原子登记；修复错误状态和文件边界。完成文字生成、图片生成、重新贴图三条核心流程。

   第三阶段：完善预览与比较，再接入真实减面/网格优化。随后选择游戏或打印专项。若做游戏，优先静态道具预算与交付，角色绑骨另列能力；若做打印，优先尺寸、厚度、水密、拆件和 3MF，不能用普通 GLB 统计替代。

   模型选择建议用同一组典型任务评估成功率、调用数、延迟和成本，再决定默认值。当前每个模型都写死相同 contextWindow / maxTokens、cost=0、reasoning=false，并使用 thinkingLevel=off；这些元数据需要对齐供应方能力，不能据此推断真实成本或能力。先把轮询、文件传输和状态登记移出 LLM 循环，比直接更换所有对话模型更值得验证。

   npm test：在允许本地监听的环境下 20/20 通过。第一次沙箱内运行的两项失败是 listen EPERM，重跑已排除该环境问题。现有审批测试模拟的是旧的 confirm 接口，不能证明真实付费接口被拦截。

   npm run build：通过，Vite 前端构建耗时约 3 分 32 秒；产物主 JS 约 578 KB，视口 JS 约 1,023 KB，gzip 分别约 175 KB、276 KB。这是当前机器单次观测，不是标准性能基准。视口已经做 lazy import；后续可继续检查主入口和视口依赖分块、缓存及模型文件加载。

   补充验证：真实 MCP 23 个工具均无 confirm；未批准 create 的审批钩子没有 block；独立 quote 没有 approval 事件；项目副本胜过全局 skill；inspect_asset 能读取越界 symlink；bash 能离开初始 cwd。所有补充验证使用本地模拟及无敏感 fixture，没有创建远程付费任务。

   建议增加使用真实 schema 的契约与流程测试：未批准/改 prompt/改 source/超 max_credits 的创建、报价业务失败、不确定 operation 恢复、重复导出意图、上传 READY 校验、下载 hash 不匹配、完成后场景登记、旧项目 skill 升级、模型 error 不回到 idle。核心验收是用户能看到、选中、修改并下载正确版本，同时任务与账单可以恢复。
