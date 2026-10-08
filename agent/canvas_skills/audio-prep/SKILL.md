---
name: audio-prep
description: "当用户要检查并整理音频，再裁切或混音时使用。"
---

# 音频准备

先探测，再按用户指定的秒数裁切或混合。

## 步骤
1. 对每个文件调用 media_probe，记下时长和编码。
2. 用户给了起止秒时，media_convert 的 kind 用 trim。两路混合时 kind 用 mix_audio。
3. 不要发明用户没给的时间范围。

## 工具
media_probe、media_convert。

## 做不到
不做语音识别，也不生成新的音乐。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
