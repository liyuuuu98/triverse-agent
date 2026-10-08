---
name: audio-mix
description: "当用户要把两段工作区音频混成一条时使用。"
---

# 混音

只用本机 ffmpeg 混合两路音频。

## 步骤
1. 先对两个输入调用 media_probe。ffprobe 不可用就说明未安装。
2. 调用 media_convert，kind 为 mix_audio，inputs 正好两个，output 放在工作区。
3. 不对用户提供的滤镜字符串原样执行。

## 工具
media_probe、media_convert。

## 做不到
没有独立的调音台或自动配乐服务。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
