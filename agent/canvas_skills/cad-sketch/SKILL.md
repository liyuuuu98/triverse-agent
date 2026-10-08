---
name: cad-sketch
description: "当用户要改二维草图或轮廓时使用。没有 CAD 内核，只编辑工作区里的文本或 SVG。"
---

# 草图

把草图当成工作区里的 SVG 或文本，不用实体内核。

## 步骤
1. 找到用户指出的 SVG 或文本。没有就新建 triverse-sketch.svg，只含用户描述的简单形状。
2. 修改后把路径和改动写进说明。
3. 用户要三维时再报价，不把草图自动升成 B-rep。

## 工具
list_workspace_files、write_workspace_note。三维用 text_to_mesh，先报价。

## 做不到
STEP / CadQuery B-rep 尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
