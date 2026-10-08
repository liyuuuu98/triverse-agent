---
name: source-prepare
description: "当用户要在生成前检查参考图或模型是否在工作区时使用。"
---

# 素材准备

先确认输入，再决定是否报价。

## 步骤
1. list_workspace_files。图片用 media_probe，网格用 mesh_info。
2. 文件缺失就停下来要路径。不要找工作区外的文件。
3. 输入确认后，按用户目标报价对应的生成工具。

## 工具
list_workspace_files、media_probe、mesh_info。

## 做不到
不在准备阶段创建付费任务。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
