---
name: image-sheet
description: "当用户要把多张工作区图片拼成一张检查图时使用。"
---

# 图片拼图

用 ffmpeg 把 1 到 12 张图拼起来。

## 步骤
1. 确认每张图都在工作区。
2. 调用 image_sheet。columns 用 1 到 6，默认 2。
3. ffmpeg 不可用时说明未安装，不要编造拼图。

## 工具
image_sheet。

## 做不到
超过 12 张要分批。没有版式设计服务。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
