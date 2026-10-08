---
name: api-demo-service
description: "当用户要一个演示服务或接口示例时使用。只在工作区写代码，也不把密钥写进文件。"
---

# 接口演示

做一个读得到、跑得起来的本地演示。不要把 Triverse 或对话密钥写进仓库、脚本或说明。

## 步骤
1. 在 workspace 里写一个小示例，并写明怎么运行。
2. 实际运行一次。失败就保留错误输出。
3. 若演示需要真实三维任务，先报价，等用户接受后再把 confirm 设为 true。

## 工具
list_workspace_files、write_workspace_note。真实三维任务用对应的 Triverse 工具并先报价。

## 做不到
MDF、账号权益尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
