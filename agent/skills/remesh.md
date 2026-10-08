---
name: "重网格"
---

# 何时使用
用户要改面数、三角或四边，或换导出格式，对象是已有模型。

# 工具
- model_remesh：model_file、target_face_count（1000–5000000）、face_type（quad 或 triangle）、texture_size、export_format（fbx 或 glb）。
- mesh_info：只读本地网格。closed 不是水密修复。

报价即使是 0 也要先给用户看。confirm 默认 false，同意后才创建任务。watertight 水密修复尚未具备。
