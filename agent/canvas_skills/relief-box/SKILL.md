---
name: relief-box
description: "当用户要做盒子表面高低时使用。浮雕服务尚未具备，只能在用户同意后做本地灰度位移体。"
---

# 盒子表面高低

用户要的是盒子表面高低。relief 浮雕 / 深度服务尚未具备。不要把它说成已经完成的浮雕。

## 步骤
1. 先说明浮雕服务尚未具备。用户仍要一个本地高低形体时，调用 heightfield_mesh。有灰度图传 image，有数字阵列传 heights。
2. 用 scale_model 调到用户要求的毫米尺寸，再用 support_check 做几何估计。
3. 用 export_stl 和 export_3mf 写出文件。不要发送到打印机，也不要声称多色或分层加工已经完成。
4. 说明里写明这是本地灰度位移体，不是浮雕服务。

## 工具
heightfield_mesh、scale_model、support_check、mesh_audit、export_stl、export_3mf。

## 做不到
relief 浮雕服务、multicolor 多色、physical printer 真实打印机尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
