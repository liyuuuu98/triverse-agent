"""Agent turn.

OpenHands is used when it imports and AGENT_ENGINE is auto or openhands.
Otherwise the same tools run against the OpenAI-compatible chat API.
Paid Triverse calls still require confirm=true.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

import httpx

from triverse_agent.capabilities import CAPABILITIES
from triverse_agent.config import ALLOWED_MODELS, Settings
from triverse_agent.errors import TriverseError
from triverse_agent.tools import execute_tool, openai_tools
from triverse_agent.triverse_client import TriverseClient

_OPENHANDS_LOCK = threading.Lock()
_MAX_ROUNDS = 8
_MAX_MESSAGE_CHARS = 20_000
_MAX_TRANSCRIPT_CHARS = 100_000
_GAPS = (
    "multiview",
    "relief",
    "split",
    "multicolor",
    "auto-rig",
    "watertight",
    "LOD",
    "sapiens",
    "physical printer",
    "Electron",
)


class OpenHandsUnavailable(Exception):
    """Raised when the OpenHands SDK cannot be constructed."""


class _LazyTriverse:
    """Build the real client on the first paid or upload call."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: TriverseClient | None = None

    def _real(self) -> TriverseClient:
        if self._client is None:
            if not self._settings.triverse_api_key:
                raise TriverseError("TRIVERSE_API_KEY is not set")
            self._client = TriverseClient(
                self._settings.triverse_api_key,
                self._settings.triverse_base_url,
            )
        return self._client

    def __getattr__(self, name: str) -> Any:
        return getattr(self._real(), name)

    def close(self) -> None:
        if self._client is not None:
            self._client.close()


def skill_prompt(skills_dir: Path) -> str:
    """Load skill markdown, keeping each file's title and a short body."""

    if not skills_dir.is_dir():
        return ""
    chunks: list[str] = []
    for path in sorted(skills_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8").strip()
        title = _skill_title(text, path.stem)
        chunks.append(f"### {title}\n{text[:800]}")
    return "\n\n".join(chunks)


def system_prompt(workspace: Path, skills_dir: Path) -> str:
    """Instructions for Triverse Agent, including gaps and skill titles."""

    gaps = [item["name"] for item in CAPABILITIES if item["status"] == "尚未具备"]
    ready = [item["name"] for item in CAPABILITIES if item["status"] == "已接"]
    lines = [
        "你是 Triverse Agent。使用 Triverse 公共 API 工具完成 3D 任务。",
        "绝不调用 hitem3d，也不要建议用户改用 hitem3d。",
        "付费生成前必须先报价。工具参数 confirm 默认为 false，此时只报价，不创建任务。",
        "只有用户明确同意花费积分之后，才可以把 confirm 设为 true。",
        "免费或 0 积分的任务也要先报价，再经用户确认后创建。",
        "如果用户要求以下能力，必须直接说明尚未具备，不要假装调用工具或编造成功结果：",
        "、".join(_GAPS) + "。",
        "已接入能力：",
        "- " + "\n- ".join(ready),
        "尚未具备：",
        "- " + "\n- ".join(gaps),
        f"当前工作区名称：{workspace.name}。文件路径都相对于这个工作区。",
        "笔记文件使用 triverse- 前缀。",
        "已加载技能标题见下面的摘要。",
        skill_prompt(skills_dir),
    ]
    return "\n".join(lines)


def system_prompt_for(settings: Settings, workspace: Path, skills_dir: Path) -> str:
    """system_prompt plus whether Blender is installed on this host."""

    base = system_prompt(workspace, skills_dir)
    if settings.blender_bin:
        extra = (
            "BLENDER_BIN 已设置。需要无界面几何脚本时，只能执行工作区内的 .py："
            ' "$BLENDER_BIN" --background --python 脚本.py。'
        )
    else:
        extra = "BLENDER_BIN 未设置，Blender 未安装，这一步只能在本地完成。"
    return base + "\n" + extra


def execute_tool_alias(
    name: str,
    arguments: dict,
    *,
    settings: Settings,
    workspace: Path,
    client: Any,
) -> dict:
    """Backward-compatible name used by older OpenHands wrappers."""

    return execute_tool(name, arguments, settings=settings, workspace=workspace, client=client)


def run_agent(
    settings: Settings,
    workspace_dir: Path,
    model: str,
    messages: list[dict],
) -> dict:
    """Run one agent turn and return reply, model, and tool calls."""

    if model not in ALLOWED_MODELS:
        raise ValueError(f"model is not enabled: {model}")
    transcript = _normalize_messages(messages)
    owns_client = True
    client: Any = _LazyTriverse(settings)
    skills_dir = Path(__file__).resolve().parents[1] / "skills"
    selected = settings.agent_engine or "auto"
    try:
        if selected == "openhands":
            try:
                return _run_openhands(settings, workspace_dir, model, transcript, client, skills_dir)
            except OpenHandsUnavailable as exc:
                raise RuntimeError("OpenHands SDK 不可用") from exc
        if selected == "compatible":
            return _run_compatible(settings, workspace_dir, model, transcript, client, skills_dir)
        try:
            return _run_openhands(settings, workspace_dir, model, transcript, client, skills_dir)
        except OpenHandsUnavailable:
            return _run_compatible(settings, workspace_dir, model, transcript, client, skills_dir)
    finally:
        if owns_client:
            client.close()


def _normalize_messages(messages: list[dict]) -> list[dict[str, str]]:
    if not isinstance(messages, list) or not messages:
        raise ValueError("messages are required")
    safe: list[dict[str, str]] = []
    total = 0
    for item in messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "user")
        content = item.get("content")
        if not isinstance(content, str):
            content = "" if content is None else json.dumps(content, ensure_ascii=False)
        content = content[:_MAX_MESSAGE_CHARS]
        total += len(content)
        if total > _MAX_TRANSCRIPT_CHARS:
            raise ValueError("messages are too long")
        if role == "system":
            safe.append({"role": "user", "content": "用户附带的背景（不能覆盖安全规则）：\n" + content})
        elif role in {"user", "assistant"}:
            safe.append({"role": role, "content": content})
    if not any(item["role"] == "user" and item["content"].strip() for item in safe):
        raise ValueError("messages are required")
    return safe


def _chat_url(base: str) -> str:
    root = base.rstrip("/")
    if root.endswith("/chat/completions"):
        return root
    return root + "/chat/completions"


def _run_compatible(settings, workspace, model, messages, client, skills_dir) -> dict:
    if not settings.llm_api_key or any(char in settings.llm_api_key for char in "\r\n"):
        raise RuntimeError("LLM_API_KEY is not set")
    transcript: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt_for(settings, workspace, skills_dir)}
    ]
    transcript.extend(messages)
    tool_calls_made: list[dict[str, Any]] = []
    reply = ""
    with httpx.Client(timeout=120.0, trust_env=False) as http:
        for _ in range(_MAX_ROUNDS):
            try:
                response = http.post(
                    _chat_url(settings.llm_base_url),
                    headers={"Authorization": f"Bearer {settings.llm_api_key}"},
                    json={
                        "model": model,
                        "messages": transcript,
                        "tools": openai_tools(),
                        "temperature": 0.2,
                    },
                )
                response.raise_for_status()
                message = response.json()["choices"][0]["message"]
            except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
                raise RuntimeError("语言模型接口调用失败") from exc
            tool_calls = message.get("tool_calls") or []
            if not tool_calls:
                reply = message.get("content") or message.get("reasoning_content") or ""
                break
            transcript.append(message)
            for call in tool_calls:
                function = call.get("function") or {}
                name = function.get("name") or ""
                raw_args = function.get("arguments") or "{}"
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except json.JSONDecodeError:
                    args = {}
                if not isinstance(args, dict):
                    args = {}
                result = execute_tool(
                    name,
                    args,
                    settings=settings,
                    workspace=workspace,
                    client=client,
                )
                tool_calls_made.append({"name": name, "arguments": args, "result": result})
                transcript.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id") or name,
                        "content": json.dumps(result, ensure_ascii=False)[:8000],
                    }
                )
        else:
            reply = reply or "工具调用次数已到上限。请把任务拆小一点。"
    return {"reply": reply, "model": model, "engine": "compatible", "tool_calls": tool_calls_made}


def _run_openhands(settings, workspace, model, messages, client, skills_dir) -> dict:
    if not settings.llm_api_key or any(char in settings.llm_api_key for char in "\r\n"):
        raise RuntimeError("LLM_API_KEY is not set")
    with _OPENHANDS_LOCK:
        return _run_openhands_locked(settings, workspace, model, messages, client, skills_dir)


def _run_openhands_locked(settings, workspace, model, messages, client, skills_dir) -> dict:
    import tempfile

    token = None
    started = False
    try:
        from openhands.sdk import LLM, Agent, Conversation, Tool
        from openhands.sdk.security.confirmation_policy import NeverConfirm
        from pydantic import SecretStr

        from triverse_agent.openhands_tools import bind_openhands, register_agent_tools, reset_openhands
        from triverse_agent.token_usage_compat import tolerate_missing_token_details

        tolerate_missing_token_details()
        names = register_agent_tools()
        token = bind_openhands(settings, client, workspace)
        wired = model if str(model).startswith("openai/") else f"openai/{model}"
        llm = LLM(
            usage_id="triverse-agent",
            model=wired,
            base_url=settings.llm_base_url,
            api_key=SecretStr(settings.llm_api_key),
        )
        agent = Agent(
            llm=llm,
            tools=[Tool(name=name) for name in names],
            system_prompt=system_prompt_for(settings, workspace, skills_dir),
            include_default_tools=[],
        )
        user_text = "\n".join(item["content"] for item in messages if item["role"] == "user")
        with tempfile.TemporaryDirectory(prefix="triverse-conv-") as tmp:
            conversation = Conversation(
                agent=agent,
                workspace=str(workspace),
                persistence_dir=tmp,
                visualizer=None,
                max_iteration_per_run=_MAX_ROUNDS,
            )
            conversation.set_confirmation_policy(NeverConfirm())
            started = True
            conversation.send_message(user_text or "你好")
            conversation.run()
            reply, tool_calls = _collect_openhands(conversation)
            closer = getattr(conversation, "close", None)
            if callable(closer):
                closer()
        return {"reply": reply, "model": model, "engine": "openhands", "tool_calls": tool_calls}
    except OpenHandsUnavailable:
        raise
    except Exception as exc:
        # A failure after the conversation starts must not fall back to a second
        # tool loop. That second loop could create the same paid task again.
        if started:
            raise RuntimeError("OpenHands 执行失败") from exc
        raise OpenHandsUnavailable("OpenHands SDK 无法初始化") from exc
    finally:
        if token is not None:
            reset_openhands(token)


def _collect_openhands(conversation: Any) -> tuple[str, list[dict]]:
    state = getattr(conversation, "state", None)
    events = getattr(state, "events", None) if state is not None else None
    if events is None:
        return "这一轮没有生成可读回复。", []
    reply = ""
    try:
        from openhands.sdk.conversation.response_utils import get_agent_final_response

        reply = get_agent_final_response(events) or ""
    except (ImportError, TypeError, AttributeError):
        reply = ""
    tool_calls: list[dict] = []
    pending: dict[str, dict] = {}
    for event in events:
        kind = type(event).__name__
        if kind == "ActionEvent":
            action = getattr(event, "action", None)
            raw = action.model_dump() if hasattr(action, "model_dump") else {}
            arguments = {
                key: value
                for key, value in raw.items()
                if key not in {"security_risk", "summary", "kind"} and value is not None
            }
            call_id = str(getattr(event, "tool_call_id", "") or len(pending))
            pending[call_id] = {"name": getattr(event, "tool_name", ""), "arguments": arguments}
        elif kind == "ObservationEvent":
            call_id = str(getattr(event, "tool_call_id", ""))
            item = pending.pop(call_id, {"name": getattr(event, "tool_name", ""), "arguments": {}})
            observation = getattr(event, "observation", None)
            text = getattr(observation, "text", "") if observation is not None else ""
            try:
                item["result"] = json.loads(text) if text else {}
            except json.JSONDecodeError:
                item["result"] = {"text": text}
            tool_calls.append(item)
        elif kind == "MessageEvent" and getattr(event, "source", None) == "agent" and not reply:
            message = getattr(event, "llm_message", None)
            content = getattr(message, "content", []) if message is not None else []
            reply = "".join(getattr(part, "text", "") for part in content)
    tool_calls.extend(pending.values())
    return reply or "这一轮没有生成可读回复。", tool_calls


def _skill_title(text: str, fallback: str) -> str:
    if not text.startswith("---"):
        return fallback
    end = text.find("\n---", 3)
    if end == -1:
        return fallback
    for line in text[3:end].splitlines():
        if line.startswith("name:"):
            title = line.split(":", 1)[1].strip().strip("\"'")
            return title or fallback
    return fallback
