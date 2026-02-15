"""Fixtures shared across all tests."""

from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient

# Force all services into mock mode for testing
os.environ["FRR_ENABLED"] = "false"
os.environ["RYU_ENABLED"] = "false"
os.environ["OVS_ENABLED"] = "false"
os.environ["DEBUG"] = "false"

from app.main import app  # noqa: E402


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    """Async HTTP client for testing FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
