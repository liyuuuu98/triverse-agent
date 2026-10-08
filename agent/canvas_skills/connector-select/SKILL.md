---
name: connector-select
description: "当用户要比较连接件并选出一种外形时使用。先写比较，再按选择生成网格。"
---

# 连接件

根据用户给的尺寸和受力方向写一份比较，不假装有标准件库。

## 步骤
1. 用 write_workspace_note 列出用户提到的连接方式、配合尺寸和取舍。
2. 用户选定后，报价 text_to_mesh 或 image_to_mesh。
3. 用 scale_model 调尺寸，export_3mf 导出。不要发到打印机。

## 工具
write_workspace_note、text_to_mesh、image_to_mesh、scale_model、export_3mf。

## 做不到
没有标准件库。physical printer 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
