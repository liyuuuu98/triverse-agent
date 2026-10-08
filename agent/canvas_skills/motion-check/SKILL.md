---
name: motion-check
description: "当用户要检查动作文件或 GLB 动画是否存在时使用。不重定向。"
---

# 动作检查

只报告工作区里能读到的动作信息。

## 步骤
1. 列出相关文件。GLB 按 glb-clips 的方法读动画名。
2. 读不到就说明没有发现可检查的动作。
3. 不要修改骨骼，也不要生成新动作。

## 工具
list_workspace_files、mesh_info。

## 做不到
动作重定向和 auto-rig 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
