---
name: head-template
description: "当用户要从已有头模改尺寸或检查时使用。不生成新头，除非用户另外要求。"
---

# 头模模板

以工作区里的头模为起点做缩放和诊断。

## 步骤
1. mesh_audit 现有文件。
2. 按用户的毫米值 scale_model。
3. 需要新头时才报价，并说明这是另一次生成。

## 工具
mesh_audit、scale_model、image_to_model。

## 做不到
split 拆件和 auto-rig 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
