---
name: texture-bake
description: "当用户要把高模法线烘焙到低模时使用。这是本地 Cycles，不是远程贴图。"
---

# 法线烘焙

BLENDER_BIN 已设置时才烘焙。彩色贴图仍走 Triverse 报价。

## 步骤
1. 确认高模和低模都在工作区。调用 texture_bake。
2. Blender 未安装时说明未运行，不要编造 PNG。
3. 用户要彩色贴图时改报价 texture_model 或 text_to_texture，不要把法线当成彩色结果。

## 工具
texture_bake、texture_model、text_to_texture。

## 做不到
本地烘焙不是远程贴图，也不是 multicolor。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
