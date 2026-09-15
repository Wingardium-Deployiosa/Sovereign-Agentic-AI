"""HTTP client for the on-premise Agentic AI backend.

Implements the public API contract that the teammate's backend must
fulfil. The voice layer never assumes any internal implementation
detail of the backend (RAG, agents, vector DB, etc.).
"""

from __future__ import annotations

import logging
from typing import Iterable, Optional

import httpx

from app.config import BackendConfig

logger = logging.getLogger(__name__)


class BackendError(RuntimeError):
    """Raised when the backend returns a non-success response."""


class AssistantClient:
    """HTTP client wrapping the assistant backend API."""

    def __init__(self, config: BackendConfig, client: Optional[httpx.Client] = None) -> None:
        self.config = config
        self._client = client or httpx.Client(timeout=config.timeout_seconds)

    def query(
        self,
        message: str,
        *,
        session_id: Optional[str] = None,
        document_ids: Optional[Iterable[str]] = None,
        source: str = "voice",
    ) -> dict:
        """Send a query to the assistant backend."""
        payload = {
            "session_id": session_id or self.config.session_id,
            "message": message,
            "document_ids": list(document_ids or []),
            "source": source,
        }
        url = f"{self.config.url}/api/v1/assistant/query"
        logger.info("[BACKEND] Sending request to %s", url)
        try:
            response = self._client.post(url, json=payload)
        except httpx.HTTPError as exc:
            raise BackendError(f"Backend unreachable: {exc}") from exc
        if response.status_code >= 400:
            raise BackendError(
                f"Backend error {response.status_code}: {response.text}"
            )
        data = response.json()
        logger.info("[ASSISTANT] %s", data.get("response", ""))
        return data

    def close(self) -> None:
        try:
            self._client.close()
        except Exception:
            pass

    def __enter__(self) -> "AssistantClient":
        return self

    def __exit__(self, *exc) -> None:
        self.close()