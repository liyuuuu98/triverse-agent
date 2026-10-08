---
name: eye-repair
description: "当用户要修复人像眼睛时使用。没有专门的眼睛修复器。"
---

# 眼睛

没有自动眼睛修复。不要声称眼睛已经被修好。

## 步骤
1. 说明没有眼睛修复服务，也没有 sapiens 人体关键点。
2. 用户同意重做整头时，用一张参考图报价 image_to_model。不要传多视图。
3. 结果只用 mesh_audit 检查，不宣称局部已经修复。

## 工具
image_to_model、mesh_audit。先报价。

## 做不到
sapiens、自动眼睛修复、multiview 多视图尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
