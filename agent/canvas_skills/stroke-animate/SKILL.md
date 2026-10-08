---
name: stroke-animate
description: "当用户要把笔画或图片序列收成视频时使用。没有 Remotion。"
---

# 笔画动画

remotion 尚未具备。图片序列可以合成 MP4。

## 步骤
1. 说明没有 Remotion，也不能从一张图自动生成笔画动画。
2. 用户已经有按顺序命名的图片时，调用 media_convert kind=images_to_mp4。
3. 需要字幕时另外调用 write_subtitle，不做语音识别。

## 工具
media_convert、write_subtitle。

## 做不到
remotion 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
