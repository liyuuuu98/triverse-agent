---
name: model-preview
description: "当用户要从已有网格得到前后左右预览图时使用。本地和工作室渲染是两条路。"
---

# 模型预览

本地用 Blender Workbench。远程渲染要报价。

## 步骤
1. BLENDER_BIN 已设置时调用 blender_preview，得到 front、back、left、right。
2. 未设置就说明 Blender 未安装。用户要服务端图时报价 model_preview_render。
3. multi_angle 只是相机角度，不是 multiview 建模。

## 工具
blender_preview、model_preview_render。

## 做不到
multiview 建模尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
