---
name: promo-layout
description: "当用户要宣传图或把多张图排成一版时使用。生图先报价，拼图走本地 ffmpeg。"
---

# 宣传排版

新图要报价。已有图用 image_sheet 排列。

## 步骤
1. 需要新画面时报价 image_generation。
2. 已有 1 到 12 张图时调用 image_sheet。
3. 把输出路径写入说明。不要调用不存在的排版服务。

## 工具
image_generation、image_sheet。生图先报价。

## 做不到
没有印刷厂接口。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
