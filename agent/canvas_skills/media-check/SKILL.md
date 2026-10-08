---
name: media-check
description: "当用户要查看视频、音频或图片的编码和时长时使用。"
---

# 媒体检查

用 ffprobe 读取工作区文件。

## 步骤
1. 调用 media_probe。
2. available 为 false 时说明 ffprobe 未安装。
3. 不要在探测失败时编造时长。

## 工具
media_probe。

## 做不到
探测失败就停止，不改文件。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
