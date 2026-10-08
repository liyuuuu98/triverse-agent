---
name: print-joints
description: "当用户要做可打印的关节件时使用。导出文件，不发送打印。"
---

# 关节打印件

关节只做到缩放、估计和导出。

## 步骤
1. 没有模型时先报价 text_to_mesh，把关节尺寸写进提示词。
2. scale_model 到用户的毫米，support_check 作几何估计。
3. export_stl 和 export_3mf。说明这不是实物配合证明。

## 工具
text_to_mesh、scale_model、support_check、export_stl、export_3mf。

## 做不到
physical printer、自动公差验证尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
