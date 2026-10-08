---
name: glb-clips
description: "当用户要查看 GLB 里有没有动画片段时使用。不重定向骨骼。"
---

# GLB 片段

只检查现有 GLB。没有重定向库。

## 步骤
1. 确认文件在工作区且扩展名是 glb 或 gltf。
2. 用工作区内的一段 Python 读取文件里的动画名字。读不到就说明未发现片段。
3. 不要调用 motion-retarget，也不要声称已经绑骨。

## 工具
list_workspace_files、mesh_info。

## 做不到
auto-rig 自动绑骨和动作重定向尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
