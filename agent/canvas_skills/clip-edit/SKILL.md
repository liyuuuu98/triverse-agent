---
name: clip-edit
description: "当用户要按秒裁视频或音频时使用。"
---

# 片段裁切

只按用户给出的起止时间裁切一个文件。

## 步骤
1. media_probe 确认文件和时长。
2. media_convert 的 kind 用 trim，start 和 end 用用户的秒数。
3. 没有起止时间就询问，不要猜。

## 工具
media_probe、media_convert。

## 做不到
remotion 尚未具备。不做自动剪辑。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
