"""ModalBackend — routes inference to Modal serverless GPU via public HTTP endpoint.

Calls the chat_http fastapi_endpoint on Modal via httpx SSE streaming.
No Modal SDK credentials required on the Render side.
"""
from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncIterator
from uuid import UUID, uuid4

import httpx

from apps.inference.backends.base import (
    ChatRequest,
    Chunk,
    HealthStatus,
    ModelHandle,
)

logger = logging.getLogger(__name__)

MODAL_MODEL_SLUG = "medgemma-4b-it"
MODAL_CHAT_URL = os.environ.get(
    "MODAL_CHAT_URL",
    "https://anon-workspace--medgemma-chat-http.modal.run",
)


class ModalBackend:
    target_id: UUID = uuid4()

    async def chat_completions(self, req: ChatRequest) -> AsyncIterator[Chunk]:
        payload = {
            "messages": req.messages,
            "extra": req.extra or {},
        }
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream(
                "POST",
                MODAL_CHAT_URL,
                json=payload,
                headers={"Accept": "text/event-stream"},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        yield Chunk(delta=line[6:])

    async def list_models(self) -> list[ModelHandle]:
        return [
            ModelHandle(
                id=MODAL_MODEL_SLUG,
                display_name="MedGemma 4B Instruct — vision+text (Modal GPU)",
                context_length=8192,
            )
        ]

    async def health(self) -> HealthStatus:
        return HealthStatus(ok=True, detail="Modal serverless backend")
