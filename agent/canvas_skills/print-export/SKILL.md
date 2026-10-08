---
name: print-export
description: "当用户要导出可加工的网格文件时使用。只写 STL 和 3MF，不连接打印机。"
---

# 打印导出

导出停在工作区文件。

## 步骤
1. 先 mesh_audit。
2. 调用 export_stl 和 export_3mf。3MF 单位按毫米写入。
3. 告诉用户文件路径，并说明没有发送到 physical printer。

## 工具
mesh_audit、export_stl、export_3mf。

## 做不到
physical printer 真实打印机尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
