---
name: "贴图"
---

# 何时使用
已经有几何，用户要换贴图或按文字上色。

# 工具
- texture_model：参考图 image_file 加几何 model_file。两者都可以是 file_key、公网 URL 或工作区路径。
- text_to_texture：text_prompt 加 model_url。model_url 必须是公网 URL，不能是 file_key 或本地路径。本地模型不会自动发布。

confirm 默认 false，只报价。同意后再创建。多色 multicolor 尚未具备。
