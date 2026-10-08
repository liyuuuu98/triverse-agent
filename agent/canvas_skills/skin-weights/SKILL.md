---
name: skin-weights
description: "当用户要蒙皮权重时使用。直接说明尚未具备。"
---

# 蒙皮权重

没有自动绑骨，也不能写入可用的蒙皮权重。

## 步骤
1. 说明 auto-rig 尚未具备。
2. 不要生成一份看起来像权重的随机数据。
3. 静态网格仍可用 mesh_audit 检查。

## 工具
mesh_audit。

## 做不到
auto-rig 自动绑骨尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
