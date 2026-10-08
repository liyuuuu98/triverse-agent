---
name: replace-brief
description: "当用户要写一份替换说明或修改简报时使用。"
---

# 替换简报

把要替换的对象、保留项和禁止项写成工作区说明。

## 步骤
1. 用 write_workspace_note 写简报，包含输入文件、希望保留的部分和不要出现的部分。
2. 用户确认要重新生成时再报价对应工具。
3. 不要在写简报这一步创建付费任务。

## 工具
write_workspace_note、list_workspace_files。

## 做不到
简报本身不修改模型。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
