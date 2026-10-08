---
name: "预览渲染"
---

# 何时使用
用户要服务端渲染预览图，而不是在网页里转一转本地 glb。

# 工具
model_preview_render。model_file、render_mode（basic、multi_angle、custom、preset）、image_count（1–10）、resolution、camera_angles、preset_name。

multi_angle 只是相机角度，不是 multiview 建模。multiview 尚未具备。
页面上的 model-viewer 只预览工作区里的 glb/gltf，不调用这个接口。confirm 默认 false。
