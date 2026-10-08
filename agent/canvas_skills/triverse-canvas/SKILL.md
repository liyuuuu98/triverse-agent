---
name: triverse-canvas
description: "当请求还没对应到具体工具时先使用。它说明 30862 上哪些事能做、哪些尚未具备。"
---

# Triverse Canvas

30862 的工具来自 Pod 内的 triverse MCP。新对话才会载入技能和 MCP。已打开的旧对话看不到这次新增的能力。

## 步骤
1. image_to_model、text_to_model、贴图、model_remesh、convert_model_format、model_preview_render、image_generation 和 prompt_optimize 都先报价。confirm 默认 false。
2. 网格统计、诊断、STL、3MF、Taubin、缩放、灰度高度场、支撑估计、ffmpeg 和字幕不扣三维积分。
3. Blender 布尔、四视图和法线烘焙依赖 BLENDER_BIN。未设置就说明 Blender 未安装。
4. 灰度高度场不是 relief 浮雕服务。支撑估计不是实物证明。3MF 不发送到打印机。
5. 游戏、原型和演示只在工作区写代码并运行。不要假装引擎或 Electron 已经存在。
6. 多视图、浮雕服务、拆件、多色、自动绑骨、水密修复、LOD、sapiens、物理打印机、Electron、账号权益、MDF、STEP、remotion、MetaHuman 和真实游戏引擎都回答尚未具备。

## 工具
MCP 服务器 triverse 里的工具。workspace 是 /projects 下的目录名。

## 做不到
表里标成尚未具备的项目不要用别的工具冒充。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
