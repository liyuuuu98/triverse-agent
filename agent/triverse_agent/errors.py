"""Errors raised by the Triverse public API client."""

from __future__ import annotations

from typing import Any


class TriverseError(Exception):
    """Failure returned by the Triverse API or blocked before a paid call.

    ``message`` is safe to show: the client strips the API key before raising.
    """

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.status = status
        self.payload = payload
        super().__init__(message)


__all__ = ["TriverseError"]
