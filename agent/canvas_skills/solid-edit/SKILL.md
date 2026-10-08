---
name: solid-edit
description: "当用户要对两个网格做并、差或交时使用。需要本机 Blender。"
---

# 网格布尔

布尔是网格操作，不是实体内核。

## 步骤
1. 确认两个输入都在工作区。operation 只能是 difference、union 或 intersect。
2. BLENDER_BIN 已设置时调用 mesh_boolean。未设置就说明 Blender 未安装。
3. 成功后 mesh_audit 输出。不要把结果叫成 STEP。

## 工具
mesh_boolean、mesh_audit。

## 做不到
STEP / CadQuery B-rep 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
