---
name: print-plan
description: "当用户要规划加工尺寸和支撑时使用。只做几何估计和导出。"
---

# 加工计划

计划包含尺寸、支撑估计和文件路径，不包含打印机指令。

## 步骤
1. scale_model 到用户指定的轴和毫米。
2. support_check。说明这不是摩擦或实物抗倾倒证明。
3. export_3mf 和 export_stl，把结果写入说明。

## 工具
scale_model、support_check、export_3mf、export_stl、mesh_audit。

## 做不到
physical printer 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
