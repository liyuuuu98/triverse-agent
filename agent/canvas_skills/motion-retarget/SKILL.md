---
name: motion-retarget
description: "当用户要把动作重定向到另一个模型时使用。直接说明尚未具备。"
---

# 动作重定向

没有重定向库，auto-rig 也尚未具备。

## 步骤
1. 说明不能把动作套到另一套骨骼上。
2. 可以检查源文件里有没有动画名。
3. 不要用 Blender 脚本假装重定向已经完成，除非用户自己提供并确认过脚本，且结果要标明未验证。

## 工具
list_workspace_files。

## 做不到
动作重定向、auto-rig 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
