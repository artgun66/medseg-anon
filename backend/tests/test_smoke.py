"""Smoke tests — proves the skeleton wires together. CI-required."""
from __future__ import annotations

import pytest
from django.test import Client


@pytest.mark.django_db
def test_root_returns_phase_marker() -> None:
    response = Client().get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "medseg-backend"
    assert body["status"] == "ok"


@pytest.mark.django_db
def test_healthz() -> None:
    response = Client().get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_inference_backend_protocol_imports() -> None:
    from apps.inference.backends.base import (
        ChatRequest,
        Chunk,
        HealthStatus,
        InferenceBackend,
        ModelHandle,
    )

    assert all(
        c is not None
        for c in (InferenceBackend, ChatRequest, Chunk, ModelHandle, HealthStatus)
    )
