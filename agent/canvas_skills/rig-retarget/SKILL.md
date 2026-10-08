---
name: rig-retarget
description: "当用户要绑骨或把动作重定向到模型时使用。直接说明尚未具备。"
---

# 绑骨重定向

auto-rig 自动绑骨和动作重定向尚未具备。

## 步骤
1. 说明不能创建骨架，也不能迁移权重。
2. 可以保留静态模型，并用 mesh_audit 检查。
3. 不要把蒙皮权重写成已经可用。

## 工具
mesh_audit、list_workspace_files。

## 做不到
auto-rig、skin weights 迁移、MetaHuman 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
