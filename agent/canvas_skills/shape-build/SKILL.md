---
name: shape-build
description: "当用户要用简单形体或高度图做网格时使用。"
---

# 形体

简单高低形体走 heightfield_mesh。复杂外形先报价。

## 步骤
1. 用户给了高度数组或灰度图时调用 heightfield_mesh，并说明这不是浮雕服务。
2. 需要任意物体外形时报价 text_to_mesh 或 image_to_mesh。
3. 之后可以 scale_model 和 export_stl。

## 工具
heightfield_mesh、text_to_mesh、image_to_mesh、scale_model、export_stl。

## 做不到
STEP 实体和 relief 浮雕服务尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
