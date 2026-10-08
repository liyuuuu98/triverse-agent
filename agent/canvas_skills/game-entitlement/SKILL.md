---
name: game-entitlement
description: "当用户要查询或发放账号权益、许可或资格时使用。直接说明尚未具备。"
---

# 权益

账号权益尚未具备。不要编造许可结果。

## 步骤
1. 说明这里没有权益接口。
2. 不要根据本地文件判断用户是否已购买。
3. 三维生成只使用 Triverse 报价，不把报价说成权益。

## 工具
无权益工具。

## 做不到
账号权益尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
