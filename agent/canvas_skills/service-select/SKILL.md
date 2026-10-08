---
name: service-select
description: "当用户的请求可能对应多个工具或一个缺口时使用。先选路，再调用。"
---

# 能力选择

按下面的对应关系选择，不要发明接口。

## 步骤
1. 单图带贴图用 image_to_model，单图只要几何用 image_to_mesh，艺术网格用 image_to_artistic_mesh。
2. 纯文字用 text_to_model 或 text_to_mesh。贴图用 texture_model 或 text_to_texture。重网格用 model_remesh。格式用 convert_model_format。远程预览用 model_preview_render。
3. 平面图用 image_generation。提示词用 prompt_optimize。以上都先报价。
4. 本地网格用 mesh_info、mesh_audit、taubin_smooth、scale_model、export_stl、export_3mf、heightfield_mesh、support_check。
5. 媒体用 media_probe 和 media_convert。Blender 工具只在 BLENDER_BIN 已设置时使用。
6. multiview 多视图、浮雕服务、拆件、多色、自动绑骨、水密修复、LOD、sapiens、打印机、Electron、权益、MDF、STEP、remotion、MetaHuman、真实游戏引擎都回答尚未具备。

## 工具
只调用上表点名的工具。

## 做不到
表里标成尚未具备的项目不要用别的工具冒充。

## 约束
- 付费的 Triverse 任务先报价。用户明确接受之前，confirm 保持 false。
- 只读写当前 workspace。Agent 写出的文件以 triverse- 开头。
- 在 OpenHands Canvas（端口 30862）上，这些工具来自 MCP 服务器 triverse。workspace 填 /projects 下的一个目录名；文件在工作区根目录时留空。
- 没有对应实现时直接说明尚未具备，不要编造成功。
