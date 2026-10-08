---
name: nose-repair
description: "当用户要单独修复鼻子时使用。没有局部修复器。"
---

# 鼻子

没有鼻子修复服务。

## 步骤
1. 说明不能只改鼻子。
2. 用户同意重做时，用一张参考图报价 image_to_model。
3. 用 mesh_audit 看整体，不宣称鼻子已经修复。

## 工具
image_to_model、mesh_audit。先报价。

## 做不到
自动五官修复、sapiens 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
