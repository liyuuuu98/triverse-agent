"""Runtime settings loaded from the process environment."""

from __future__ import annotations

import os

from pydantic import BaseModel, ConfigDict, Field

# Canvas / chat model picker. The LLM gateway is separate from the 3D API.
ALLOWED_MODELS = [
    "gpt-6-astra",
    "gpt-6-sol",
    "claude-haiku-5-5",
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    # DeepSeek 4.1 Flash. Gateway ID is deepseek-flash; it routes to
    # deepseek-v4-1-flash-260910. Do not send deepseek-v4-flash.
    "deepseek-flash",
    "glm-5.3-flash",
]
DEFAULT_MODEL = "claude-haiku-5-5"


class Settings(BaseModel):
    """Process settings. API keys are strings but omitted from ``repr``."""

    model_config = ConfigDict(hide_input_in_errors=True)

    triverse_api_key: str = Field(default="", repr=False)
    triverse_base_url: str = "https://api.triverse.ai/api/v1"
    llm_api_key: str = Field(default="", repr=False)
    llm_base_url: str = "https://api.teamorouter.cn/v1"
    llm_model: str = DEFAULT_MODEL
    agent_engine: str = "auto"
    blender_bin: str = ""
    workspace_root: str = "./workspaces"
    host: str = "0.0.0.0"
    port: int = 8080
    # If set, require header X-Session-API-Key.
    session_api_key: str = Field(default="", repr=False)


# HOST is intentionally not read; ``host`` stays at its default.
_ENV_FIELDS = {
    "TRIVERSE_API_KEY": "triverse_api_key",
    "TRIVERSE_BASE_URL": "triverse_base_url",
    "LLM_API_KEY": "llm_api_key",
    "LLM_BASE_URL": "llm_base_url",
    "LLM_MODEL": "llm_model",
    "WORKSPACE_ROOT": "workspace_root",
    "PORT": "port",
    "SESSION_API_KEY": "session_api_key",
    "AGENT_ENGINE": "agent_engine",
    "BLENDER_BIN": "blender_bin",
}


def load_settings() -> Settings:
    """Load settings from the environment.

    Reads TRIVERSE_API_KEY, TRIVERSE_BASE_URL, LLM_API_KEY, LLM_BASE_URL,
    LLM_MODEL, WORKSPACE_ROOT, PORT, SESSION_API_KEY, AGENT_ENGINE, and
    BLENDER_BIN. Blank values are ignored. Secret files are not read.
    An LLM_MODEL outside ALLOWED_MODELS falls back to the default.
    """
    values: dict[str, str] = {}
    for env_name, field_name in _ENV_FIELDS.items():
        raw = os.environ.get(env_name)
        if raw is None or raw.strip() == "":
            continue
        values[field_name] = raw.strip()
    settings = Settings.model_validate(values)
    if settings.llm_model not in ALLOWED_MODELS:
        settings.llm_model = DEFAULT_MODEL
    return settings


__all__ = ["ALLOWED_MODELS", "DEFAULT_MODEL", "Settings", "load_settings"]
