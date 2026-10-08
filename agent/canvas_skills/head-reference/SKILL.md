---
name: head-reference
description: "当用户要凭一张头部参考图生成模型时使用。只有单图，没有多视图。"
---

# 头部参考

一张图生成一个头。multiview 多视图尚未具备。

## 步骤
1. 确认参考图在工作区。报价 image_to_model，或只要几何时报价 image_to_mesh。
2. 不要附加第二张图当多视图。
3. 结果 mesh_audit。眼睛或鼻子没有单独修复器。

## 工具
image_to_model、image_to_mesh、mesh_audit。先报价。

## 做不到
multiview、sapiens、自动五官修复尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
