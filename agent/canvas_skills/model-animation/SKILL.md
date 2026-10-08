---
name: model-animation
description: "当用户要把模型做成动画时使用。没有自动绑骨和重定向。"
---

# 模型动画

auto-rig 自动绑骨尚未具备。可以做静态模型和图片序列。

## 步骤
1. 说明不能自动绑骨，也不能把动作套到骨骼上。
2. 需要静态模型时按普通流程报价。
3. 已有图片序列时可以用 media_convert 的 images_to_mp4。不要声称骨骼动画已经完成。

## 工具
text_to_model、image_to_model、media_convert。付费工具先报价。

## 做不到
auto-rig、动作重定向、remotion 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
