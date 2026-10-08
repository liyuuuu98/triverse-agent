"""OpenHands tools that call the same executor as the HTTP agent.

The SDK only accepts a ToolDefinition subclass with create(), or an instance
that already has an executor. Lambdas are rejected. create() runs inside the
SDK thread pool, so the request binding is a lock-guarded global captured
onto the executor. agent_loop holds that lock for the whole turn.
"""

from __future__ import annotations

import json
from contextvars import ContextVar, Token
from typing import Any, ClassVar

from triverse_agent.tools import TOOL_DEFS, TOOLS_BY_NAME, execute_tool

_STATE: ContextVar[dict[str, Any] | None] = ContextVar("triverse_openhands_binding", default=None)
_GLOBAL: dict[str, Any] | None = None
_REGISTERED: list[str] | None = None


def bind_openhands(settings: Any, client: Any, workspace: Any) -> Token:
    """Publish the current request for tool executors, including worker threads."""

    global _GLOBAL
    payload = {"settings": settings, "client": client, "workspace": workspace}
    _GLOBAL = payload
    return _STATE.set(payload)


def reset_openhands(token: Token) -> None:
    """Drop the request binding. Call this before the agent lock is released."""

    global _GLOBAL
    _STATE.reset(token)
    _GLOBAL = None


def current_binding() -> dict[str, Any]:
    """Return the binding visible to this thread, else the lock-held global."""

    state = _STATE.get()
    if state is None:
        state = _GLOBAL
    if state is None:
        raise RuntimeError("OpenHands tools are not bound to a request")
    return state


def _class_name(tool_name: str) -> str:
    return "".join(part.capitalize() for part in tool_name.split("_")) + "Tool"


def register_agent_tools() -> list[str]:
    """Register one concrete tool per Triverse and workspace action."""

    global _REGISTERED
    if _REGISTERED is not None:
        return list(_REGISTERED)

    from openhands.sdk.tool import Action, Observation, ToolDefinition, ToolExecutor, register_tool
    from pydantic import Field, create_model

    class TriverseObservation(Observation):
        """Text observation. The body is JSON from execute_tool."""

    class TriverseExecutor(ToolExecutor):
        def __init__(self, tool_name: str, binding: dict[str, Any]) -> None:
            self.tool_name = tool_name
            self.binding = binding

        def __call__(self, action, conversation=None):
            spec = TOOLS_BY_NAME[self.tool_name]
            allowed = {param.name for param in spec.params}
            raw = action.model_dump()
            arguments = {key: value for key, value in raw.items() if key in allowed}
            result = execute_tool(
                self.tool_name,
                arguments,
                settings=self.binding["settings"],
                workspace=self.binding["workspace"],
                client=self.binding["client"],
            )
            text = json.dumps(result, ensure_ascii=False)[:8000]
            is_error = isinstance(result, dict) and set(result) == {"error"}
            return TriverseObservation.from_text(text=text, is_error=is_error)

    type_map = {
        "string": str,
        "integer": int,
        "boolean": bool,
        "object": dict[str, Any],
        "array": list[str],
    }
    names: list[str] = []
    for spec in TOOL_DEFS:
        fields: dict[str, Any] = {}
        for param in spec.params:
            py_type = type_map[param.json_type]
            if param.name == "confirm":
                fields[param.name] = (bool, Field(default=False, description=param.description))
            else:
                fields[param.name] = (
                    py_type | None,
                    Field(default=None, description=param.description),
                )
        action_type = create_model(
            _class_name(spec.name).removesuffix("Tool") + "Action",
            __base__=Action,
            **fields,
        )
        description = spec.description

        def _create(cls, conv_state=None, action_type=action_type, description=description, **params):
            if params:
                raise ValueError(f"{cls.name} does not accept params")
            binding = current_binding()
            return [
                cls(
                    description=description,
                    action_type=action_type,
                    observation_type=TriverseObservation,
                    executor=TriverseExecutor(cls.name, binding),
                )
            ]

        tool_cls = type(
            _class_name(spec.name),
            (ToolDefinition,),
            {
                "__annotations__": {"name": ClassVar[str]},
                "create": classmethod(_create),
                "__module__": __name__,
            },
        )
        register_tool(tool_cls.name, tool_cls)
        names.append(tool_cls.name)
    _REGISTERED = names
    return list(names)
