---
name: "图生模型"
---

# 何时使用
用户有一张图，要生成 3D。只要一张图，不要多视图。

# 工具
- image_to_model：带贴图。image_file、model_version 默认 v2、polygon_limit（1000–1500000）、texture_size（1024–4096）、turbo。
- image_to_mesh：只要几何。
- image_to_artistic_mesh：艺术网格。model_version 默认 craftsman-v3-2-3，num_verts 默认 4096。

image_file 可以是 file_key、公网 URL，或工作区相对路径。confirm 默认 false，只报价。只有用户同意花费积分后才 confirm=true，那时才会上传本地文件并创建任务。

multiview 多视图尚未具备。
