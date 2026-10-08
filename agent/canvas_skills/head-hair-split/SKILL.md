---
name: head-hair-split
description: "当用户要把头和头发分成两个模型时使用。拆件尚未具备。"
---

# 头和头发

split 拆件尚未具备。

## 步骤
1. 说明不能把头和头发自动拆开。
2. 可以报价生成一个包含两者的模型，或让用户分别提供两张图各生成一次。
3. 每次生成都单独报价。不要用多视图参数。

## 工具
image_to_model、mesh_audit。先报价。

## 做不到
split 拆件、multiview 多视图尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
