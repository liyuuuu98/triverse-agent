---
name: grid-path
description: "当用户要在网格上求一条可行路径时使用。在工作区写代码并跑测试。"
---

# 网格路径

用工作区代码做网格寻路，不调用三维生成。

## 步骤
1. 按用户给的障碍和起终点写一个小程序。
2. 运行它，把路径或无解结果写入说明。
3. 不要把寻路结果说成导航硬件或游戏引擎已经接入。

## 工具
write_workspace_note，以及工作区里的代码。

## 做不到
真实游戏引擎尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
