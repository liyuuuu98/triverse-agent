---
name: subtitle-track
description: "当用户给出了字幕时间和文本、要写成 SRT 时使用。"
---

# 字幕

只把用户给的时间轴写成文件。

## 步骤
1. 每条需要 start、end（秒）和 text。调用 write_subtitle。
2. 没有时间或文本时询问，不要听写音频。
3. 说明不做语音识别。

## 工具
write_subtitle。

## 做不到
自动听写尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
