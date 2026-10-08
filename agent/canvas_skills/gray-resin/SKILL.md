---
name: gray-resin
description: "当用户要看灰模或素模预览时使用。这不是树脂打印。"
---

# 灰模预览

灰模只是预览颜色，不是灰树脂材料和打印机。

## 步骤
1. BLENDER_BIN 已设置时调用 blender_preview。未设置就说明 Blender 未安装。
2. 用户要服务端图片时再报价 model_preview_render。
3. 不要把预览图说成已经用树脂打印。

## 工具
blender_preview、model_preview_render。付费渲染先报价。

## 做不到
physical printer 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
