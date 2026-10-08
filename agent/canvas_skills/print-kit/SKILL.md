---
name: print-kit
description: "当用户要导出一套加工文件时使用。逐个导出，不拆件，不发送打印机。"
---

# 加工套件

套件里的每个网格单独导出。不能自动拆成零件。

## 步骤
1. list_workspace_files，对每个网格 mesh_audit、scale_model（仅当用户给了尺寸）和 support_check。
2. 每个文件 export_stl 与 export_3mf。
3. 写一份清单。split 拆件尚未具备，不要从一个模型变出多个零件。

## 工具
list_workspace_files、mesh_audit、scale_model、support_check、export_stl、export_3mf。

## 做不到
split、physical printer、multicolor 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
