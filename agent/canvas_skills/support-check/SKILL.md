---
name: support-check
description: "当用户要估计模型按 Z 轴向上是否站得住时使用。"
---

# 支撑估计

这是底面接触点的几何估计。

## 步骤
1. 调用 support_check。
2. 报告 stable_estimate、margin_mm 和 note。
3. 说明它不证明摩擦、填充或实物抗倾倒。

## 工具
support_check。

## 做不到
不是实物稳定性证明，也不是打印机支撑生成。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
