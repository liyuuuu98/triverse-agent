---
name: taubin-smooth
description: "当用户要光顺三角网格时使用。不补洞，也不做水密修复。"
---

# Taubin 光顺

使用本地 Taubin λ/μ。默认锁定开口边界。

## 步骤
1. 调用 taubin_smooth。iterations 为 1 到 50，lamb 在 (0, 1]，mu 在 [-1, 0)。
2. 用户没指定时用默认 8、0.5、-0.53，lock_boundary 为 true。
3. 告诉用户输出路径，并说明这不是 watertight 水密修复。

## 工具
taubin_smooth、mesh_audit。

## 做不到
watertight 水密修复尚未具备。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
