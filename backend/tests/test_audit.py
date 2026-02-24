"""Tests for audit log endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

# ── helpers ──────────────────────────────────────────────────────


async def _login(client: AsyncClient, user: str = "admin", pw: str = "admin123") -> str:
    r = await client.post("/api/v1/auth/login", json={"username": user, "password": pw})
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_audit_logs_require_auth(client: AsyncClient):
    r = await client.get("/api/v1/audit/logs")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_audit_logs_returns_list(client: AsyncClient):
    token = await _login(client)
    r = await client.get("/api/v1/audit/logs", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert "entries" in data
    assert "total" in data
    assert isinstance(data["entries"], list)


@pytest.mark.asyncio
async def test_audit_logs_with_filters(client: AsyncClient):
    token = await _login(client)
    r = await client.get(
        "/api/v1/audit/logs",
        params={"limit": 10, "offset": 0, "user": "admin"},
        headers=_auth(token),
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_clear_audit_requires_admin(client: AsyncClient):
    """Non-admin users cannot clear audit logs."""
    # Without auth
    r = await client.delete("/api/v1/audit/logs")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_clear_audit_admin(client: AsyncClient):
    token = await _login(client)
    r = await client.delete("/api/v1/audit/logs", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert "cleared" in r.json()
