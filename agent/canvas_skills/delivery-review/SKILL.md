---
name: delivery-review
description: "当用户要在交付前检查网格、支撑和文件是否齐全时使用。"
---

# 交付检查

只做检查和说明，不自动修复。

## 步骤
1. mesh_audit 看边界、非流形和退化。support_check 看 Z 轴向上的几何估计。
2. 需要加工文件时确认 export_stl 和 export_3mf 的输出已经在工作区。
3. 把未通过的项写成说明。不要把诊断说成水密修复。

## 工具
mesh_audit、support_check、list_workspace_files、export_stl、export_3mf。

## 做不到
watertight 水密修复和 physical printer 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
