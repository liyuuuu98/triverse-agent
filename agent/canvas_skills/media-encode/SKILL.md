---
name: media-encode
description: "当用户要把图片序列或媒体写成新文件时使用。"
---

# 媒体编码

用限定的 ffmpeg 操作写出新文件。

## 步骤
1. 图片序列用 media_convert kind=images_to_mp4，fps 为 1 到 60。
2. 缩放或裁切按用户参数选择 scale 或 trim。
3. 输出必须留在工作区。失败时返回 ffmpeg 的错误，不报成功。

## 工具
media_convert、media_probe。

## 做不到
不提供任意编码器参数面板。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
