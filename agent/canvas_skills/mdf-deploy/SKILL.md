---
name: mdf-deploy
description: "当用户要部署 MDF 模块时使用。直接说明尚未具备。"
---

# MDF

MDF 尚未具备。不要寻找未列出的部署接口。

## 步骤
1. 说明没有 MDF 运行时。
2. 用户改要普通本地脚本时，在 workspace 里写并运行。
3. 不要把密钥写进示例。

## 工具
无 MDF 工具。本地脚本只用工作区文件。

## 做不到
MDF 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
