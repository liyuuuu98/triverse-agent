---
name: exterior-surface
description: "当用户要改模型外表面的颜色或贴图时使用。远程贴图先报价，本地烘焙只产法线。"
---

# 外表面

外表面要么走 Triverse 贴图，要么在本地烘焙法线。两者不要混称。

## 步骤
1. 有参考图时报价 texture_model。只有文字时报价 text_to_texture，model_url 必须是公网 URL。
2. 用户只要本地法线、且 BLENDER_BIN 已设置时，调用 texture_bake。未安装就说明。
3. 不要把本地法线 PNG 说成彩色贴图已经完成。

## 工具
texture_model、text_to_texture、texture_bake。付费工具先报价。

## 做不到
multicolor 多色打印尚未具备。texture_bake 不是远程贴图。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
