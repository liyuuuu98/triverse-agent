---
name: portrait-reconstruction
description: "当用户要用照片重建头像模型时使用。只支持单张图。"
---

# 头像重建

单图生成头模。多视图、关键点和自动修脸都没有。

## 步骤
1. 选用一张参考图，报价 image_to_model。只要几何时用 image_to_mesh。
2. 不要把其余照片当作 multiview。
3. 完成后 mesh_audit。眼睛、鼻子没有单独修复步骤。

## 工具
image_to_model、image_to_mesh、mesh_audit。先报价。

## 做不到
multiview、sapiens、自动五官修复尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
