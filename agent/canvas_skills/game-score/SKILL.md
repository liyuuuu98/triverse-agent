---
name: game-score
description: "当用户要在工作区里实现分数和结算时使用。写成可运行代码并亲自跑一次，不要假装已有游戏引擎。"
---

# 计分

这是分数和结算的实现说明，不是现成库。

## 步骤
1. 用 list_workspace_files 看当前项目。没有项目时，在 workspace 里写一个小而能运行的分数和结算。
2. 只做这件事。写出运行命令并实际执行，把结果或失败记到 triverse- 说明。
3. 需要三维资源时先报价 image_to_model 或 text_to_model。用户接受前 confirm 保持 false。网格先 mesh_audit。
4. 不要连接权益服务，不要打 Electron 包，不要声称游戏引擎已经部署。

## 工具
list_workspace_files、write_workspace_note、mesh_info、mesh_audit。资源生成用 image_to_model 或 text_to_model，先报价。

## 做不到
真实游戏引擎、账号权益、Electron 桌面安装包尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
