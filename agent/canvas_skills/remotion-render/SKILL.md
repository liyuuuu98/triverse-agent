---
name: remotion-render
description: "当用户要 Remotion 渲染时使用。直接说明尚未具备，改走 ffmpeg。"
---

# Remotion

remotion 尚未具备。

## 步骤
1. 说明没有 Remotion 运行时。
2. 已有图片序列时用 media_convert 的 images_to_mp4。
3. 已有成片时只用 trim 或 scale。

## 工具
media_convert、media_probe。

## 做不到
remotion 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
