"""Let OpenHands read LiteLLM usage fields that were deleted after init.

LiteLLM drops unset optional token fields with object.__delattr__. The name
stays in pydantic model_fields_set, and OpenHands then raises AttributeError
after the model has already answered.
"""

from __future__ import annotations

from collections.abc import Iterable

_PATCH_MARK = "_triverse_missing_token_fallback"


def install_token_detail_fallback(classes: Iterable[type]) -> None:
    for cls in classes:
        if getattr(cls, _PATCH_MARK, False):
            continue
        original = cls.__getattr__

        def __getattr__(self, name: str, _original=original):
            try:
                return _original(self, name)
            except AttributeError:
                fields = getattr(type(self), "model_fields", None)
                if isinstance(fields, dict) and name in fields:
                    return None
                raise

        cls.__getattr__ = __getattr__
        setattr(cls, _PATCH_MARK, True)


def tolerate_missing_token_details() -> None:
    try:
        from litellm.types.utils import (
            CompletionTokensDetailsWrapper,
            PromptTokensDetailsWrapper,
        )
    except ImportError:
        return
    install_token_detail_fallback(
        (PromptTokensDetailsWrapper, CompletionTokensDetailsWrapper)
    )
