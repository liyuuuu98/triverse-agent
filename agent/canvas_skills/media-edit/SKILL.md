---
name: media-edit
description: "当用户要裁切或缩放工作区里的视频、音频时使用。"
---

# 媒体裁剪

只做 trim 和 scale 两种 ffmpeg 操作。

## 步骤
1. media_probe 确认输入。
2. 裁切用 media_convert kind=trim。缩放用 kind=scale，宽高在 2 到 4096。
3. 不接受用户写的任意滤镜串。

## 工具
media_probe、media_convert。

## 做不到
remotion 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
