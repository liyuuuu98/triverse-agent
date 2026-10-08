---
name: surface-fit
description: "当用户要把网格缩放到某个表面尺寸时使用。没有 CAD 曲面拟合。"
---

# 尺寸贴合

用单轴等比缩放近似用户要的尺寸。

## 步骤
1. mesh_info 读当前尺寸。
2. scale_model 的 axis 和 size_mm 用用户指定的值。
3. 说明这是等比缩放，不是曲面贴合或实体重建。

## 工具
mesh_info、scale_model。

## 做不到
STEP 曲面拟合尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
