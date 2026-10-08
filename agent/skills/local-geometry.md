---
name: "本地几何"
---

# 何时使用
用户要在本机看网格、导出、光顺、缩放、估计支撑，或用 Blender 改几何。不调用 Triverse，不扣积分。

# 工具
- mesh_info：顶点数、面数、closed。closed 只是闭合检查，不是 watertight 水密修复。
- mesh_audit：边界边、非流形边、退化面、连通块。只读。
- export_stl：写出 triverse-*.stl。
- export_3mf：写出毫米制 3MF。不连接打印机。
- taubin_smooth：λ/μ 光顺。不补洞，不是水密修复。
- scale_model：按 x、y 或 z 轴当前尺寸等比缩放到毫米。
- heightfield_mesh：高度数组或灰度图做成位移体。不是 relief 浮雕服务。
- support_check：Z 轴向上的几何估计。不是实物稳定性证明。
- media_probe：本机 ffprobe。没有就说明未安装。
- media_convert：trim、scale、images_to_mp4、mix_audio。不接受任意滤镜。
- image_sheet：1 到 12 张图拼成检查图。
- write_subtitle：写 SRT。不做语音识别。
- mesh_boolean、blender_preview、texture_bake、run_blender：需要 BLENDER_BIN。

# Blender
集群把 Blender 4.2 挂在 /opt/triverse-env。若设置了 BLENDER_BIN，无界面调用是：
"$BLENDER_BIN" --background --python 工作区内脚本.py
若没有设置 BLENDER_BIN，Blender 未安装，这一步只能在本地完成。
