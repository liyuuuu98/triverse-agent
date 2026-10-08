---
name: brep-build
description: "当用户要 STEP、B-rep 或 CadQuery 实体时使用。先说明实体内核尚未具备。"
---

# 实体建模

STEP / CadQuery B-rep 尚未具备。不要把三角网格叫成实体模型。

## 步骤
1. 直接说明没有实体内核，不能写出 STEP 或可编辑的 B-rep。
2. 用户改要三角网格时，才报价 text_to_mesh 或 image_to_mesh，并标明结果是网格。

## 工具
用户改要网格后才用 text_to_mesh 或 image_to_mesh，并先报价。

## 做不到
STEP / CadQuery B-rep 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
