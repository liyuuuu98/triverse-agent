---
name: "文生模型"
---

# 何时使用
用户用文字描述主体，要生成 3D，没有参考图。

# 工具
- text_to_model：带贴图。prompt 至少 3 个字符，可选 negative_prompt、polygon_limit、texture_size、turbo。
- text_to_mesh：只要几何，参数同上，没有贴图尺寸。

先报价。confirm 默认 false。用户明确同意后再 confirm=true。
没有参考图时不要改走图生。多视图、浮雕、拆件都尚未具备。
