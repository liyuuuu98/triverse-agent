---
name: video-sequence
description: "当用户要把一组图片收成视频，或裁一段已有视频时使用。"
---

# 视频序列

用 ffmpeg 的图片序列或裁切。

## 步骤
1. 有序图片用 media_convert kind=images_to_mp4。
2. 已有视频要截取时用 trim，秒数来自用户。
3. 先 media_probe。不要使用 Remotion。

## 工具
media_probe、media_convert。

## 做不到
remotion 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
