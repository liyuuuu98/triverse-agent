---
name: asset-review-board
description: "当用户要评审一批已有模型是否能交付时使用。先诊断，不自动重做。"
---

# 资产评审

对工作区里已有的模型做交付检查。

## 步骤
1. list_workspace_files 后，对每个网格调用 mesh_audit 和 support_check。
2. 需要尺寸时只报告 mesh_info 的包围盒，不擅自 scale_model。
3. 把边界、非流形、退化和支撑估计写成 triverse- 评审说明。闭合检查不是水密修复。

## 工具
list_workspace_files、mesh_info、mesh_audit、support_check、write_workspace_note。

## 做不到
watertight 水密修复、split 拆件尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
