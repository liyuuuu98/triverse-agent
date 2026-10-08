---
name: metahuman-fit
description: "当用户要把模型配成 MetaHuman 时使用。直接说明尚未具备。"
---

# MetaHuman

MetaHuman 尚未具备。不要导出它的绑定或控制器。

## 步骤
1. 说明没有 MetaHuman 适配器。
2. 可以报价生成普通人体网格，但必须标明不是 MetaHuman。
3. 不要做 auto-rig。

## 工具
用户改要普通网格时用 image_to_model 或 text_to_model，先报价。

## 做不到
MetaHuman、auto-rig、sapiens 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
