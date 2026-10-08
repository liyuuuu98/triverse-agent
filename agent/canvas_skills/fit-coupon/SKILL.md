---
name: fit-coupon
description: "当用户要核对模型是否落在给定尺寸范围内时使用。"
---

# 尺寸核对

用包围盒和缩放做尺寸核对，不生产实物试样。

## 步骤
1. mesh_info 读三轴尺寸，按网格单位理解，不假装已经测量过实物。
2. 用户要求改到某一轴的毫米值时调用 scale_model。
3. 把目标、结果和是否越界写入说明。

## 工具
mesh_info、scale_model、write_workspace_note。

## 做不到
没有实物量具，也没有打印机。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
