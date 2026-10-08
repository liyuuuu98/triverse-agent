---
name: mesh-audit
description: "当用户要诊断网格是否有边界、非流形或退化面时使用。"
---

# 网格诊断

mesh_audit 只读，不修改网格。

## 步骤
1. 调用 mesh_audit。
2. 向用户报告边界边、非流形边、退化面、连通块和 closed。
3. 说明 closed 不是 watertight 水密修复。

## 工具
mesh_audit。

## 做不到
watertight 水密修复尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
