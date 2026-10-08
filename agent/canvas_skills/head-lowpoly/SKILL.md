---
name: head-lowpoly
description: "当用户要把头模型减到指定面数时使用。远程重网格先报价，没有 LOD 链。"
---

# 低面数头模

减面走 model_remesh。LOD 尚未具备。

## 步骤
1. 先 mesh_info 看当前面数。
2. 报价 model_remesh，target_face_count 用用户的数字，face_type 用 triangle 或用户指定的 quad。
3. 完成后再次 mesh_info。不要声称生成了多级 LOD。

## 工具
mesh_info、model_remesh。先报价。

## 做不到
LOD 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
