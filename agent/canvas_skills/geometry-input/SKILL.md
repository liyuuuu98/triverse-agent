---
name: geometry-input
description: "当用户要把网格或图片放进工作区并确认文件可读时使用。"
---

# 几何输入

只接收工作区相对路径。拒绝越出工作区的路径。

## 步骤
1. 用 list_workspace_files 确认文件在 workspace 内。
2. 网格调用 mesh_info。图片可以 media_probe。
3. 路径含 .. 或绝对路径时停止并说明，不要读工作区外的文件。

## 工具
list_workspace_files、mesh_info、media_probe。

## 做不到
不从工作区外取文件。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
