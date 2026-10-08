"""Triverse and workspace tools shared by the HTTP API and the agent loop.

Paid Triverse methods default to quote-only. confirm must be exactly true
before a tool will ask the client to create a task.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from triverse_agent.config import Settings
from triverse_agent.errors import TriverseError
from triverse_agent.local_tools import (
    blender_preview,
    export_3mf,
    export_stl,
    heightfield_mesh,
    image_sheet,
    list_files,
    media_convert,
    media_probe,
    mesh_audit,
    mesh_boolean,
    mesh_info,
    run_blender,
    safe_workspace_file,
    scale_model,
    support_check,
    taubin_smooth,
    texture_bake,
    write_note,
    write_subtitle,
)
from triverse_agent.triverse_client import TriverseClient

_TASK_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_IMAGE_LIMIT = 50 * 1024 * 1024
_MODEL_LIMIT = 200 * 1024 * 1024
_META_KEYS = {"confirm", "payload", "security_risk", "summary", "kind"}

FLOW_METHODS: dict[str, str] = {
    "image_to_model": "image-to-model",
    "image_to_mesh": "image-to-mesh",
    "image_to_artistic_mesh": "image-to-artistic-mesh",
    "text_to_model": "text-to-model",
    "text_to_mesh": "text-to-mesh",
    "texture_model": "texture-model",
    "text_to_texture": "text-to-texture",
    "model_remesh": "model-remesh",
    "convert_model_format": "convert-model-format",
    "model_preview_render": "model-preview-render",
    "image_generation": "image-generation",
    "prompt_optimize": "prompt-optimize",
}

_CONFIRM_HELP = "默认 false，只报价不创建任务、不冻结积分。只有用户明确同意花费积分后才能为 true。"


@dataclass(frozen=True)
class Param:
    """One JSON-schema field for an agent tool."""

    name: str
    json_type: str
    description: str


@dataclass(frozen=True)
class ToolDef:
    """Agent-facing tool. kind is flow, read, or local."""

    name: str
    description: str
    kind: str
    params: tuple[Param, ...] = ()
    flow_name: str | None = None


def _flow(name: str, description: str, params: tuple[Param, ...]) -> ToolDef:
    confirm = Param("confirm", "boolean", _CONFIRM_HELP)
    extra = Param("payload", "object", "其余公开 API 字段。不要放密钥。")
    return ToolDef(name, description, "flow", params + (confirm, extra), FLOW_METHODS[name])


TOOL_DEFS: tuple[ToolDef, ...] = (
    _flow(
        "image_to_model",
        "单张参考图生成带贴图的 3D 模型。confirm 默认 false，只报价。多视图 multiview 尚未具备。不要调用 hitem3d。",
        (
            Param("image_file", "string", "file_key、公网 URL，或工作区相对路径。"),
            Param("model_version", "string", "默认 v2。"),
            Param("polygon_limit", "integer", "1000 到 1500000。"),
            Param("texture_size", "integer", "1024 到 4096。"),
            Param("turbo", "boolean", "true 走更快但质量更低的路径。"),
        ),
    ),
    _flow(
        "image_to_mesh",
        "单张参考图生成不含贴图的几何网格。confirm 默认 false，只报价。",
        (
            Param("image_file", "string", "file_key、公网 URL，或工作区相对路径。"),
            Param("model_version", "string", "默认 v2。"),
            Param("polygon_limit", "integer", "1000 到 1500000。"),
            Param("turbo", "boolean", "true 走更快的几何路径。"),
        ),
    ),
    _flow(
        "image_to_artistic_mesh",
        "单张参考图生成艺术网格。confirm 默认 false，只报价。",
        (
            Param("image_file", "string", "file_key、公网 URL，或工作区相对路径。"),
            Param("model_version", "string", "默认 craftsman-v3-2-3。"),
            Param("num_verts", "integer", "目标顶点数，至少 1，默认 4096。"),
        ),
    ),
    _flow(
        "text_to_model",
        "文字生成带贴图的 3D 模型。confirm 默认 false，只报价。",
        (
            Param("prompt", "string", "主体描述，至少 3 个字符。"),
            Param("negative_prompt", "string", "不希望出现的内容。"),
            Param("polygon_limit", "integer", "1000 到 1500000。"),
            Param("texture_size", "integer", "1024 到 4096。"),
            Param("turbo", "boolean", "true 走更快的路径。"),
        ),
    ),
    _flow(
        "text_to_mesh",
        "文字生成不含贴图的几何网格。confirm 默认 false，只报价。",
        (
            Param("prompt", "string", "主体描述，至少 3 个字符。"),
            Param("negative_prompt", "string", "不希望出现的内容。"),
            Param("polygon_limit", "integer", "1000 到 1500000。"),
            Param("turbo", "boolean", "true 走更快的路径。"),
        ),
    ),
    _flow(
        "texture_model",
        "用参考图给已有几何贴图。confirm 默认 false，只报价。",
        (
            Param("image_file", "string", "参考图 file_key、公网 URL，或工作区相对路径。"),
            Param("model_file", "string", "几何 file_key、公网 URL，或工作区相对路径。"),
            Param("polygon_limit", "integer", "1000 到 1500000。"),
            Param("texture_size", "integer", "1024 到 4096。"),
        ),
    ),
    _flow(
        "text_to_texture",
        "用文字给已有几何贴图。model_url 必须是公网 URL。confirm 默认 false，只报价。",
        (
            Param("text_prompt", "string", "贴图描述，至少 3 个字符。"),
            Param("model_url", "string", "几何模型的公网 URL，不能是本地路径。"),
            Param("polygon_limit", "integer", "1000 到 1500000。"),
            Param("texture_size", "integer", "1024 到 4096。"),
        ),
    ),
    _flow(
        "model_remesh",
        "远程重网格。即使报价为 0，也要等用户确认后再创建。水密修复尚未具备。",
        (
            Param("model_file", "string", "file_key、公网 URL，或工作区相对路径。"),
            Param("target_face_count", "integer", "1000 到 5000000。"),
            Param("face_type", "string", "quad 或 triangle。"),
            Param("texture_size", "integer", "1024、2048 或 4096。"),
            Param("export_format", "string", "fbx 或 glb。"),
        ),
    ),
    _flow(
        "convert_model_format",
        "远程格式转换。confirm 默认 false，只报价。本地仅导出 STL 时用 export_stl。",
        (
            Param("model_file", "string", "file_key、公网 URL，或工作区相对路径。"),
            Param("source_format", "string", "源格式，例如 glb。"),
            Param("target_format", "string", "目标格式，例如 fbx。以接口接受的值为准。"),
        ),
    ),
    _flow(
        "model_preview_render",
        "服务端预览渲染。multi_angle 只是相机角度，不是 multiview 建模。multiview 尚未具备。",
        (
            Param("model_file", "string", "file_key、公网 URL，或工作区相对路径。"),
            Param("render_mode", "string", "basic、multi_angle、custom 或 preset。"),
            Param("image_count", "integer", "1 到 10。"),
            Param("resolution", "string", "例如 1024x1024 或 2048x2048。"),
            Param("camera_angles", "array", "例如 front、left、right、back。"),
            Param("preset_name", "string", "可选预设名。"),
        ),
    ),
    _flow(
        "image_generation",
        "文字生成平面图。confirm 默认 false，只报价。",
        (
            Param("prompt", "string", "至少 3 个字符。"),
            Param("ai_model", "string", "seedream_4_0、seedream_4_5 或 seedream_5_0_lite。"),
            Param("image_count", "integer", "创建时 1 到 4。"),
        ),
    ),
    _flow(
        "prompt_optimize",
        "优化用户描述。字段是 user_input。先报价；即使用户不付费，也要确认后再创建任务。",
        (Param("user_input", "string", "1 到 500 个字符。"),),
    ),
    ToolDef(
        "get_task",
        "查询 Triverse 任务状态。只读，不创建任务、不扣积分。",
        "read",
        (Param("task_uuid", "string", "任务 UUID。"),),
    ),
    ToolDef(
        "upload_workspace_image",
        "把工作区里的图片上传到 Triverse，返回 file_key。不创建生成任务。",
        "read",
        (Param("path", "string", "工作区相对路径。"),),
    ),
    ToolDef(
        "upload_workspace_model",
        "把工作区里的模型上传到 Triverse，返回 file_key。不创建生成任务。",
        "read",
        (Param("path", "string", "工作区相对路径。"),),
    ),
    ToolDef(
        "list_workspace_files",
        "列出当前工作区里的文件（相对路径和字节大小）。",
        "local",
    ),
    ToolDef(
        "write_workspace_note",
        "在工作区写入 triverse- 前缀的 Markdown 笔记。不要写密钥。",
        "local",
        (
            Param("name", "string", "笔记名，不要带目录。"),
            Param("text", "string", "笔记正文。"),
        ),
    ),
    ToolDef(
        "mesh_info",
        "本地只读网格统计。closed 不是水密修复，水密修复尚未具备。",
        "local",
        (Param("path", "string", "工作区相对路径。"),),
    ),
    ToolDef(
        "export_stl",
        "把工作区网格导出为 triverse-*.stl。不调用远程接口，不扣积分。",
        "local",
        (Param("path", "string", "工作区相对路径。"),),
    ),
    ToolDef(
        "media_probe",
        "用本机 ffprobe 查看媒体信息。未安装 ffprobe 时要说明，不要编造结果。",
        "local",
        (Param("path", "string", "工作区相对路径。"),),
    ),
    ToolDef(
        "run_blender",
        "仅当 BLENDER_BIN 已设置时，用 Blender 无界面执行工作区内的 .py。未设置则 Blender 未安装，步骤只能本地完成。",
        "local",
        (Param("script", "string", "工作区内的 .py 相对路径。"),),
    ),
    ToolDef(
        "export_3mf",
        "把工作区网格写成毫米制 3MF。不连接打印机，不扣积分。",
        "local",
        (
            Param("path", "string", "工作区相对路径。"),
            Param("output", "string", "可选，必须以 .3mf 结尾。"),
        ),
    ),
    ToolDef(
        "mesh_audit",
        "只读诊断：边界边、非流形边、退化面、连通块、面积和体积。不修改网格，不是水密修复。",
        "local",
        (Param("path", "string", "工作区相对路径。"),),
    ),
    ToolDef(
        "taubin_smooth",
        "本地 Taubin λ/μ 光顺三角网格。不补洞，不是水密修复，不扣积分。",
        "local",
        (
            Param("path", "string", "工作区相对路径。"),
            Param("iterations", "integer", "1 到 50，默认 8。"),
            Param("lamb", "number", "0 到 1，默认 0.5。"),
            Param("mu", "number", "-1 到 0，默认 -0.53。"),
            Param("lock_boundary", "boolean", "默认 true，固定开口边界顶点。"),
            Param("output", "string", "可选输出路径，默认 triverse-smooth-*.glb。"),
        ),
    ),
    ToolDef(
        "scale_model",
        "按 x、y 或 z 轴的当前尺寸等比缩放到指定毫米。不扣积分。",
        "local",
        (
            Param("path", "string", "工作区相对路径。"),
            Param("size_mm", "number", "目标尺寸，毫米。"),
            Param("axis", "string", "x、y 或 z，默认 z。"),
            Param("output", "string", "可选输出路径。"),
        ),
    ),
    ToolDef(
        "heightfield_mesh",
        "用高度数组或灰度图做本地位移体。不是 Hi3D 浮雕服务，不扣积分。",
        "local",
        (
            Param("heights", "array", "可选。二维数字数组，至少 2x2。"),
            Param("image", "string", "可选。工作区里的图片，用 ffmpeg 转成灰度。"),
            Param("width_mm", "number", "默认 40。"),
            Param("depth_mm", "number", "默认 40。"),
            Param("amplitude_mm", "number", "高度倍数，默认 4。"),
            Param("base_mm", "number", "底板厚度，默认 1。0 表示只有顶面。"),
            Param("output", "string", "可选输出路径。"),
        ),
    ),
    ToolDef(
        "support_check",
        "按 Z 轴向上估计重心投影是否落在底面接触区域内。不是实物稳定性证明。",
        "local",
        (Param("path", "string", "工作区相对路径。"),),
    ),
    ToolDef(
        "media_convert",
        "用本机 ffmpeg 做裁切、缩放、图片序列转 MP4 或两路混音。没有 ffmpeg 时说明未安装。不接受任意滤镜字符串。",
        "local",
        (
            Param("kind", "string", "trim、scale、images_to_mp4 或 mix_audio。"),
            Param("inputs", "array", "工作区相对路径。"),
            Param("output", "string", "输出相对路径。"),
            Param("start", "number", "trim 起点秒。"),
            Param("end", "number", "trim 终点秒。"),
            Param("width", "integer", "scale 宽度。"),
            Param("height", "integer", "scale 高度。"),
            Param("fps", "integer", "images_to_mp4 帧率，1 到 60。"),
        ),
    ),
    ToolDef(
        "image_sheet",
        "把 1 到 12 张工作区图片拼成一张检查图。需要 ffmpeg。",
        "local",
        (
            Param("images", "array", "工作区相对路径。"),
            Param("columns", "integer", "1 到 6，默认 2。"),
            Param("output", "string", "可选，默认 triverse-sheet.png。"),
        ),
    ),
    ToolDef(
        "write_subtitle",
        "把给定时间轴写成 SRT。不做语音识别。",
        "local",
        (
            Param("cues", "array", "每项含 start、end（秒）和 text。"),
            Param("output", "string", "可选，必须以 .srt 结尾。"),
        ),
    ),
    ToolDef(
        "mesh_boolean",
        "用 Blender 对两个网格做 difference、union 或 intersect。未安装 Blender 时返回未运行。",
        "local",
        (
            Param("a", "string", "被操作的网格。"),
            Param("b", "string", "第二网格。"),
            Param("operation", "string", "difference、union 或 intersect。"),
            Param("output", "string", "可选，.glb 或 .stl。"),
        ),
    ),
    ToolDef(
        "blender_preview",
        "用 Blender Workbench 从已有网格渲染 front、back、left、right 四张 PNG。未安装则返回未运行。",
        "local",
        (
            Param("path", "string", "工作区相对路径。"),
            Param("output_dir", "string", "可选输出目录。"),
        ),
    ),
    ToolDef(
        "texture_bake",
        "用 Blender Cycles CPU 把高模法线烘焙到低模。不是远程贴图。未安装 Blender 时返回未运行。",
        "local",
        (
            Param("high", "string", "高模相对路径。"),
            Param("low", "string", "低模相对路径。"),
            Param("output", "string", "可选 PNG 路径。"),
        ),
    ),
)

TOOLS_BY_NAME: dict[str, ToolDef] = {spec.name: spec for spec in TOOL_DEFS}
_ALIASES = {"workspace_note": "write_workspace_note"}


def _flag(value: object, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes"}
    return bool(value)


def confirm_requested(value: object) -> bool:
    """Return True only for an explicit confirmation, never for the string false."""

    if value is True:
        return True
    if isinstance(value, str) and value.strip().lower() in {"true", "yes", "1"}:
        return True
    return False


def openai_tools() -> list[dict[str, Any]]:
    """OpenAI chat-completions tool list."""

    tools = []
    for spec in TOOL_DEFS:
        properties: dict[str, Any] = {}
        for param in spec.params:
            schema: dict[str, Any] = {"type": param.json_type, "description": param.description}
            if param.name == "heights":
                schema["items"] = {"type": "array", "items": {"type": "number"}}
            elif param.name == "cues":
                schema["items"] = {
                    "type": "object",
                    "properties": {
                        "start": {"type": "number"},
                        "end": {"type": "number"},
                        "text": {"type": "string"},
                    },
                }
            elif param.json_type == "array":
                schema["items"] = {"type": "string"}
            properties[param.name] = schema
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": spec.name,
                    "description": spec.description,
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "additionalProperties": False,
                    },
                },
            }
        )
    return tools


def execute_tool(
    name: str,
    arguments: dict | None,
    *,
    settings: Settings,
    workspace: Path,
    client: TriverseClient | Any,
) -> dict:
    """Run one agent tool. Failures become an error object and do not raise."""

    tool_name = _ALIASES.get(name, name)
    args = dict(arguments or {})
    try:
        if tool_name in FLOW_METHODS:
            return _run_flow(tool_name, args, workspace=workspace, client=client)
        if tool_name == "get_task":
            return _get_task(args, client=client)
        if tool_name in {"upload_workspace_image", "upload_workspace_model"}:
            kind = "image" if tool_name.endswith("image") else "model"
            return _upload_path(client, workspace, str(args.get("path") or ""), kind)
        if tool_name == "list_workspace_files":
            return {"files": list_files(workspace)}
        if tool_name == "write_workspace_note":
            note_name = args.get("name") or args.get("filename") or "note"
            note_text = args.get("text", args.get("content", ""))
            if not isinstance(note_text, str):
                raise ValueError("笔记正文必须是字符串")
            return {"path": write_note(workspace, str(note_name), note_text)}
        if tool_name == "mesh_info":
            return mesh_info(workspace, str(args["path"]))
        if tool_name == "export_stl":
            return {"path": export_stl(workspace, str(args["path"]))}
        if tool_name == "media_probe":
            return media_probe(workspace, str(args["path"]))
        if tool_name == "run_blender":
            return run_blender(workspace, str(args["script"]), settings.blender_bin)
        if tool_name == "export_3mf":
            return {"path": export_3mf(workspace, str(args["path"]), args.get("output"))}
        if tool_name == "mesh_audit":
            return mesh_audit(workspace, str(args["path"]))
        if tool_name == "taubin_smooth":
            return taubin_smooth(
                workspace,
                str(args["path"]),
                iterations=int(args.get("iterations") or 8),
                lamb=float(args.get("lamb") if args.get("lamb") is not None else 0.5),
                mu=float(args.get("mu") if args.get("mu") is not None else -0.53),
                lock_boundary=_flag(args.get("lock_boundary"), default=True),
                output=args.get("output"),
            )
        if tool_name == "scale_model":
            return scale_model(
                workspace,
                str(args["path"]),
                size_mm=float(args["size_mm"]),
                axis=str(args.get("axis") or "z"),
                output=args.get("output"),
            )
        if tool_name == "heightfield_mesh":
            return heightfield_mesh(
                workspace,
                heights=args.get("heights"),
                image=args.get("image"),
                width_mm=float(args.get("width_mm") or 40),
                depth_mm=float(args.get("depth_mm") or 40),
                amplitude_mm=float(args.get("amplitude_mm") if args.get("amplitude_mm") is not None else 4),
                base_mm=float(args.get("base_mm") if args.get("base_mm") is not None else 1),
                output=args.get("output"),
            )
        if tool_name == "support_check":
            return support_check(workspace, str(args["path"]))
        if tool_name == "media_convert":
            return media_convert(
                workspace,
                str(args["kind"]),
                inputs=list(args.get("inputs") or []),
                output=str(args["output"]),
                start=args.get("start"),
                end=args.get("end"),
                width=args.get("width"),
                height=args.get("height"),
                fps=args.get("fps"),
            )
        if tool_name == "image_sheet":
            return image_sheet(
                workspace,
                list(args.get("images") or []),
                columns=int(args.get("columns") or 2),
                output=str(args.get("output") or "triverse-sheet.png"),
            )
        if tool_name == "write_subtitle":
            return write_subtitle(workspace, list(args.get("cues") or []), str(args.get("output") or "triverse-subtitles.srt"))
        if tool_name == "mesh_boolean":
            return mesh_boolean(
                workspace,
                str(args["a"]),
                str(args["b"]),
                str(args["operation"]),
                settings.blender_bin,
                args.get("output"),
            )
        if tool_name == "blender_preview":
            return blender_preview(workspace, str(args["path"]), settings.blender_bin, args.get("output_dir"))
        if tool_name == "texture_bake":
            return texture_bake(workspace, str(args["high"]), str(args["low"]), settings.blender_bin, args.get("output"))
        return {"error": f"unknown tool {tool_name}"}
    except (TriverseError, OSError, ValueError, KeyError, RuntimeError, ModuleNotFoundError) as exc:
        return {"error": str(exc)}


def _run_flow(name: str, arguments: dict, *, workspace: Path, client: Any) -> dict:
    confirm = confirm_requested(arguments.get("confirm"))
    payload = _merged_payload(name, arguments)
    if confirm:
        rejected = _reject_local_model_url(payload)
        if rejected is not None:
            return rejected
        payload = _replace_local_assets(client, workspace, payload)
    runner = getattr(client, name, None)
    if not callable(runner):
        return {"error": f"TriverseClient 没有方法 {name}"}
    result = runner(payload, confirm=confirm)
    if isinstance(result, dict):
        return result
    return {"result": result}


def _merged_payload(name: str, arguments: dict) -> dict[str, Any]:
    spec = TOOLS_BY_NAME[name]
    raw_payload = arguments.get("payload") or {}
    if raw_payload is None:
        raw_payload = {}
    if not isinstance(raw_payload, dict):
        raise ValueError("payload 必须是对象")
    known = {param.name for param in spec.params} - _META_KEYS
    merged: dict[str, Any] = {}
    for key, value in raw_payload.items():
        if key in _META_KEYS or value is None:
            continue
        merged[key] = value
    for key, value in arguments.items():
        if key not in known or value is None:
            continue
        merged[key] = value
    return merged


def _reject_local_model_url(payload: dict[str, Any]) -> dict[str, str] | None:
    value = payload.get("model_url")
    if not isinstance(value, str):
        return None
    if value.lower().startswith(("http://", "https://")):
        return None
    return {
        "error": "text-to-texture 的 model_url 必须是公网 URL。本地文件不会自动发布，这一步尚未代劳。"
    }


def _replace_local_assets(client: Any, workspace: Path, payload: dict[str, Any]) -> dict[str, Any]:
    updated = dict(payload)
    for field, kind, limit in (
        ("image_file", "image", _IMAGE_LIMIT),
        ("model_file", "model", _MODEL_LIMIT),
    ):
        value = updated.get(field)
        if not isinstance(value, str) or _is_remote_asset(value):
            continue
        path = safe_workspace_file(workspace, value)
        if not path.is_file():
            raise FileNotFoundError(value)
        uploaded = _upload_file(client, path, kind, limit)
        updated[field] = _file_key(uploaded)
    return updated


def _upload_path(client: Any, workspace: Path, relative: str, kind: str) -> dict:
    path = safe_workspace_file(workspace, relative)
    if not path.is_file():
        raise FileNotFoundError(relative)
    limit = _IMAGE_LIMIT if kind == "image" else _MODEL_LIMIT
    return _upload_file(client, path, kind, limit)


def _upload_file(client: Any, path: Path, kind: str, limit: int) -> dict:
    size = path.stat().st_size
    if size > limit:
        raise ValueError(f"文件超过 {limit} 字节")
    data = path.read_bytes()
    content_type = _content_type(path)
    if kind == "image":
        return client.upload_image(data, path.name, content_type)
    return client.upload_model(data, path.name, content_type)


def _get_task(arguments: dict, *, client: Any) -> dict:
    task_uuid = arguments.get("task_uuid") or arguments.get("id") or ""
    if not isinstance(task_uuid, str) or _TASK_ID.fullmatch(task_uuid) is None:
        raise ValueError("task_uuid 不合法")
    result = client.task(task_uuid)
    if isinstance(result, dict):
        return result
    return {"result": result}


def _is_remote_asset(value: str) -> bool:
    lowered = value.lower()
    return lowered.startswith(("http://", "https://", "tasks/", "data:"))


def _content_type(path: Path) -> str:
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".avif": "image/avif",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".obj": "model/obj",
        ".stl": "model/stl",
    }.get(path.suffix.lower(), "application/octet-stream")


def _file_key(result: Any) -> str:
    if not isinstance(result, dict):
        raise TriverseError("上传结果无效")
    data = result.get("data")
    if isinstance(data, dict) and isinstance(data.get("file_key"), str):
        return data["file_key"]
    if isinstance(result.get("file_key"), str):
        return result["file_key"]
    raise TriverseError("上传结果没有 file_key")
