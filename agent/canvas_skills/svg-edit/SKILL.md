---
name: svg-edit
description: "当用户要修改工作区里的 SVG 时使用。"
---

# SVG

把 SVG 当文本编辑，不调用外部设计软件。

## 步骤
1. 只打开工作区内的 .svg。
2. 按用户的要求改形状或文字，保持文件仍是 SVG。
3. 用户要把轮廓变成三维时再报价，不自动转换。

## 工具
list_workspace_files、write_workspace_note。

## 做不到
没有矢量编辑器界面。浮雕服务尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
