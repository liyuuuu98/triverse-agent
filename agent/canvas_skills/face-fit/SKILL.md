---
name: face-fit
description: "当用户要把已有人头或面具缩放到指定尺寸时使用。不做绑骨。"
---

# 面部尺寸

只缩放和检查现有网格。

## 步骤
1. mesh_info 读当前包围盒。
2. 用户给了目标毫米时调用 scale_model，axis 用用户指定的轴。
3. mesh_audit 复核。不要做 auto-rig 或 sapiens 对齐。

## 工具
mesh_info、scale_model、mesh_audit。

## 做不到
auto-rig 自动绑骨、sapiens 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
