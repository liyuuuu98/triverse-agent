---
name: image-to-assembly
description: "当用户要把一张图拆成多个零件时使用。拆件尚未具备。"
---

# 图生装配

split 拆件尚未具备。一张图只会得到一个模型。

## 步骤
1. 说明不能自动拆成装配体。
2. 用户仍要整体外形时，报价 image_to_model 或 image_to_mesh。
3. 结果 mesh_audit，并写明这是单件网格。

## 工具
image_to_model、image_to_mesh、mesh_audit。先报价。

## 做不到
split 拆件、multiview 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
