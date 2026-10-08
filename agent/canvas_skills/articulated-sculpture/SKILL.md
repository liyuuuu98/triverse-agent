---
name: articulated-sculpture
description: "当用户要做可动雕塑时使用。先报价生成模型，再在工作区检查尺寸、支撑并导出。"
---

# 可动雕塑

目标是可动雕塑。把用户给出的尺寸、数量和不能出现的部分写进提示词，并记成 triverse- 说明。

## 步骤
1. 有一张参考图时调用 image_to_model；只要几何时调用 image_to_mesh。只有文字时调用 text_to_model 或 text_to_mesh。confirm 保持 false，把报价交给用户。
2. 结果进入工作区后调用 mesh_audit。需要指定尺寸时调用 scale_model。需要放稳时调用 support_check。
3. BLENDER_BIN 已设置时调用 blender_preview。没有设置就说明 Blender 未安装。用户同意后再报价 model_preview_render。
4. 需要加工文件时调用 export_stl 和 export_3mf。不要把文件发到打印机。
5. 用 write_workspace_note 记下所用文件、尺寸和检查结果。

## 工具
image_to_model、image_to_mesh、text_to_model、text_to_mesh、mesh_audit、scale_model、support_check、export_stl、export_3mf、blender_preview、model_preview_render。付费工具先报价。

## 做不到
split 拆件、multicolor 多色、physical printer 真实打印机、watertight 水密修复尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
