---
name: multiview-parts
description: "当用户要用多张视图一起建模或拆零件时使用。两项都尚未具备。"
---

# 多视图零件

multiview 多视图一起建模和 split 拆件都尚未具备。

## 步骤
1. 说明不能把多张视图合成一个模型，也不能自动拆件。
2. 用户改用一张图时，报价一次 image_to_model 或 image_to_mesh。
3. 不要把其余图片当作额外视角参数。

## 工具
image_to_model、image_to_mesh。先报价。

## 做不到
multiview、split 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
