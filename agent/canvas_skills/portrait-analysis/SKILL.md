---
name: portrait-analysis
description: "当用户要分析人像照片时使用。没有人体关键点检测。"
---

# 人像分析

可以描述用户给出的可见信息。sapiens 尚未具备。

## 步骤
1. 说明没有关键点、年龄或身份识别服务。
2. 只根据用户提供的图片和问题作描述，不编造测量值。
3. 要生成头模时改走 head-reference，并先报价。

## 工具
无关键点工具。生成时用 image_to_model，先报价。

## 做不到
sapiens 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
