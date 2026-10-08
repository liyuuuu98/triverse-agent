---
name: ball-joint
description: "当用户要设计球窝关节的网格时使用。可以布尔或生成外形，但不能发送到打印机。"
---

# 球窝关节

球窝关节只做到网格和导出。物理配合要由用户自己试装。

## 步骤
1. 已有两个网格时，BLENDER_BIN 已设置就用 mesh_boolean 做 union 或 difference。未设置就说明 Blender 未安装。
2. 没有网格时，先报价 text_to_mesh 或 image_to_mesh，把球径和间隙写进提示词。
3. 用 scale_model 调到用户给的毫米，再 export_stl 和 export_3mf。

## 工具
mesh_boolean、text_to_mesh、image_to_mesh、scale_model、export_stl、export_3mf。

## 做不到
physical printer 真实打印机、自动公差验证尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
