# Triverse Agent 与 Tripo / Meshy 的能力对照

> 历史审查：以下实现状态记录于修复前，线上状态未因本地修改自动改变。当前源码行为与验证结果见 [修复记录](remediation-2026-10-09.md)、[MCP 与生成](mcp-and-generation.md)。
调研日期：2026-10-09（Asia/Shanghai）。

本文记录修复前的调研快照；修复后的本地实现及剩余工作见 [本轮优化交付](optimization-completion-2026-10-09.md)。线上能力尚需部署后重新核对。

## 判断与证据范围

LLM Agent 结合 3D 生成的方向已有产品验证。Meshy 的 3D Agent 覆盖创意讨论、批量概念图和概念转 3D。Tripo 的公开 API 覆盖生成、多视图、贴图、语义分割、网格补全、重拓扑、绑骨和动作重定向。Triverse 的机会是把这些能力编排成有约束、有检查、有交付物的完整任务。

本报告核对了当前工作区源代码，并只读查询线上 `http://10.15.127.211:30864/api/capabilities`。MCP 为 signed-in / connected，发现 23 个远程工具，平台加载 114 个技能。没有运行付费生成，也没有进行端到端资产验证。工具可发现代表接口已暴露，不代表输出质量已经验证；生成 profile 内部是否附带优化，需要进一步查询真实 schema / capability 数据。

X 搜索没有获得足够可核实的官方功能说明，因此竞品结论使用官网和开发文档。公开 API 的能力也不能直接等同于竞品 Agent 能自动完成的能力。

## 当前线上工具覆盖

| 能力 | 发现的工具 | 判断 |
| --- | --- | --- |
| 图片输入 | start_image_input、get_image_input、prepare_local_upload、finalize_local_upload | 有输入与上传协议；宿主上传 CLI 的部署和调用仍需端到端验证 |
| 图生 3D | quote_image_to_model、create_image_to_model | 已暴露报价与创建接口 |
| 文生 3D | get_text_to_model_capabilities、quote_text_to_model、create_text_to_model | 已暴露能力查询、报价与创建接口 |
| 重贴图 | list_retexture_sources、list_retexture_reference_images、quote_retexture、create_retexture | 支持描述或参考图；描述限定当前账号拥有的 Triverse 生成版本 |
| 任务与资产查询 | list_images、list_tasks、get_task、get_asset、get_capabilities、get_operation、refresh_task | 已暴露状态查询及原操作恢复入口 |
| 导出 | export_model、get_export、list_exports | 已暴露导出及导出回执恢复；实际格式以 schema / capability 为准 |
| 本地检查 | inspect_asset（本地工具） | GLB 三角面、顶点、材质数量与简单包围盒统计 |

23 个远程工具中没有发现独立的图片生成、重网格、预览渲染、多视图生成、拆件、绑骨、动作生成或打印修复工具。不能用旧技能中出现的工具名证明当前拥有这些能力。

## 缺口及补齐方式

| 用户任务 / 功能 | 竞品公开能力 | Triverse 当前缺口 | 补齐路径 |
| --- | --- | --- | --- |
| 一次给出多个概念并选一个转 3D | Meshy Agent 的批量概念图流程 | 没有独立 image generation 工具；缺候选图、选中与迭代的产品流程 | 图像生成 / 编辑 MCP，加候选图状态及视觉评审 |
| 正面、侧面、背面共同生成 | Tripo multiview；Meshy Multi-Image to 3D | 当前工具列表无多视图生成接口 | 接入多视图 API，验证视角、主体一致性和输入顺序 |
| 降面、重拓扑、UV、LOD、烘焙 | Tripo retopology；Meshy remesh / UV unwrap | 无独立 remesh / UV 工具；本地只有基础 GLB 统计 | MCP 接入优化接口；部署可验证的本地处理运行时，增加 UV、纹理预算和几何检查 |
| 拆出头、手臂、底座并分别处理 | Tripo 语义分割与分割后补全；Meshy Auto Split | 无拆件与部件补全工具，也缺部件选择与场景映射 | 接入分割 / 补全；稳定 part ID，保存层级和各部件版本 |
| 角色生成后走路、挥手 | Tripo rig / retarget；Meshy rigging、animation、text-to-motion | 无绑骨、动作或重定向工具；当前视口没有动画播放逻辑 | 接入角色处理工具，增加骨骼检查、动画播放器和变形评审 |
| 生成能打印的模型 | Meshy print analyze / repair / split | 无水密、非流形、薄壁检查和修复工具；统计面数不能证明可打印 | 接入检查与修复，记录毫米尺寸及打印机参数；对切片输出做验收 |
| 一句话布置可浏览的小场景 | Meshy 官方资产集教程将组装步骤交给 Blender | 当前视口按 index × 1.6 横排模型；SceneObject 没有位移、旋转、缩放字段 | 增加 transform、场景对象层级、相机 / 灯光执行、场景编辑工具和截图评审 |
| 选中局部后精确修改并保留其他部分 | Meshy Agent 文档明确不支持直接编辑已有 3D 模型；Tripo 分割提供部件操作基础 | 整模型重贴图不能代替局部几何编辑；无部件 / 面选择和局部编辑工具 | 先做部件级操作，再接网格编辑工具；以差异检查确认未选部分保留 |
| 多个模型保持统一风格并交付资产包 | Meshy Agent 支持风格一致的批量概念探索 | 逐次调用可以尝试，但未形成风格规范、批次评审与交付验收 | 保存参考图、色板、材质及面数预算；批次任务、预览图和 manifest |
| 精确外壳、螺纹、可加工 STEP | 本次查到的生成 / 网格 API 不足以证明精确 CAD 能力 | 技能明确缺少 STEP / CadQuery B-rep；无参数化约束与配合检验 | CAD 内核、参数模型、尺寸约束、间隙检查和物理验证；属于独立工程方向 |

## 竞品能力的实际边界

- Meshy Agent 文档明确：暂不能直接编辑已有模型；更深入的 DCC / 切片工具连接仍在路线图中。其官方资产集教程也把最终场景装配放在 Blender。
- Meshy Rigging API 文档主要支持纹理完整、肢体清晰的标准人形模型。不能把网页上广泛的角色宣传直接当成 API 的输入保证。
- Meshy Auto Split 当前要求指定的 Meshy 生成任务和模型版本，不支持所有模型类型；拆分后不保留原纹理。Triverse 资产不能未经验证直接当成它的输入任务。
- Tripo mesh completion 面向分割任务输出的部件；这不是任意网格的通用精密修复，也不能证明装配公差。
- 接入 API 后仍应在代表性输入上验证成功率、视觉质量、费用、延迟和格式兼容性。

## 当前项目更应先处理的基础问题

本地 114 个 `skills/*/SKILL.md` 中有 113 个包含 OpenHands 引用，使用旧端口、旧 workspace 说明及旧工具名。例如 `service-select` 写有 image_generation、model_remesh、mesh_audit，当前线上列表并没有这些工具。`create-game-ready-asset` 要求重网格和渲染，但当前接口没有独立实现这两步。

网关确实按真实 MCP 发现结果展示工具（`apps/gateway/src/capabilities.ts`），Agent 规则也要求以当前工具列表为准。旧技能仍被加载，会带来流程冲突。应迁移技能并按所需工具 / 运行时依赖标记：可执行、需要接入、仅规划。不要把技能数量作为功能完成度。

`apps/web/src/viewport.tsx` 当前是静态 GLB 查看器：支持轨道相机、点选、网格开关；对象位置硬编码，灯光固定，未执行 `scene.camera` 的目标 / 预设。`packages/protocol/src/index.ts` 的 SceneObject 缺少 transform。场景编排要同时修改状态协议、Agent 工具和视口执行。

`apps/gateway/src/inspect.ts` 只读取 GLB JSON 统计，不分析实际拓扑、壁厚、UV、骨骼变形或完整世界空间包围盒。可用于基础报告，不能直接充当生产或打印质量证明。

## 建议顺序

1. **统一能力与流程**：迁移旧技能；明确每条流程所需的真实工具；把现有生成 → 查询 → 导出 → 本地加载 / 检查完成端到端验证。
2. **补生成后的交付闭环**：场景 transform、多视角截图、版本比较、重网格、资产预算检查和资产包导出。新工具应由 Triverse MCP / 平台接入，当前 Agent 不绕过平台直接调用供应商 HTTP API。
3. **补概念探索与批量一致性**：图片生成 / 编辑、候选图选择、批次任务、统一风格参考及有限次数的迭代。
4. **按目标用户选择专项**：游戏方向接绑骨 / 动作 / 引擎验收；打印方向接壁厚 / 修复 / 拆件 / 切片。精确 CAD 单独规划。

首个建议验收任务：用户要求“做一套同风格的道具，组成可以浏览的小场景”。交付模型文件、可浏览场景、预览图、资产清单及面数 / 文件预算报告；对未达标项提供明确失败或待修复状态。它能展示 Agent 从需求规划到加工、组织与验收的价值。

## 主要来源

- [Meshy 3D Agent 文档](https://docs.meshy.ai/en/webapp/3d-agent)
- [Meshy 官方资产集教程](https://www.meshy.ai/tutorials/generate-a-full-set-of-game-assets-in-one-chat-with-meshy-3d-agent)
- [Tripo API 概览](https://developers.tripo3d.ai/en/docs/introduction)
- [Tripo 多视图](https://developers.tripo3d.ai/en/docs/generation-multiview-to-model)
- [Tripo 分割](https://developers.tripo3d.ai/en/docs/mesh-segment)
- [Tripo 部件补全](https://developers.tripo3d.ai/en/docs/mesh-complete)
- [Meshy Multi-Image API](https://docs.meshy.ai/en/api/multi-image-to-3d)
- [Meshy Rigging API](https://docs.meshy.ai/en/api/rigging)
- [Meshy Text to Motion API](https://docs.meshy.ai/en/api/text-to-motion)
- [Meshy Auto Split API](https://docs.meshy.ai/en/api/auto-split)
- [Meshy 打印检查](https://docs.meshy.ai/en/api/analyze-printability)
- [Meshy 打印修复](https://docs.meshy.ai/en/api/repair-printability)
