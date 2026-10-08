---
name: asset-page
description: "当用户要整理模型交付页、资产清单或检查图册时使用。"
---

# 资产页

把当前工作区里的模型和图片整理成一份可读说明，不重新生成模型。

## 步骤
1. 调用 list_workspace_files。对每个网格调用 mesh_audit。
2. 图片多于一张时调用 image_sheet。BLENDER_BIN 已设置时对主模型调用 blender_preview。
3. 用 write_workspace_note 写出文件名、面数、检查结果和仍缺的项。

## 工具
list_workspace_files、mesh_audit、image_sheet、blender_preview、write_workspace_note。

## 做不到
不会生成新的远程模型，除非用户另外要求并接受报价。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
