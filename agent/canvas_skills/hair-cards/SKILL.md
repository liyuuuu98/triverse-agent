---
name: hair-cards
description: "当用户要把头发拆成卡片网格时使用。拆件尚未具备。"
---

# 头发卡片

split 拆件尚未具备。不能自动把头发切成卡片。

## 步骤
1. 说明不能自动拆出发片。
2. 用户同意生成整头时，用一张参考图报价 image_to_model，并说明头发和头是同一个模型。
3. 用 mesh_audit 检查整体，不要声称卡片已经分离。

## 工具
image_to_model、mesh_audit。先报价。

## 做不到
split 拆件、auto-rig 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
