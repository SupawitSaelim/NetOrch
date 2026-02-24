"""Tests for system mode and info endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


async def _login(client: AsyncClient) -> str:
    r = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_system_mode_get(client: AsyncClient):
    r = await client.get("/api/v1/system/mode")
    assert r.status_code == 200
    assert r.json()["mode"] in ("dc", "wan")


@pytest.mark.asyncio
async def test_system_mode_set_requires_auth(client: AsyncClient):
    r = await client.put("/api/v1/system/mode", json={"mode": "wan"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_system_mode_set(client: AsyncClient):
    token = await _login(client)
    r = await client.put(
        "/api/v1/system/mode",
        json={"mode": "wan"},
        headers=_auth(token),
    )
    assert r.status_code == 200
    assert r.json()["mode"] == "wan"

    # Reset back to dc
    await client.put(
        "/api/v1/system/mode",
        json={"mode": "dc"},
        headers=_auth(token),
    )


@pytest.mark.asyncio
async def test_system_mode_invalid(client: AsyncClient):
    token = await _login(client)
    r = await client.put(
        "/api/v1/system/mode",
        json={"mode": "invalid"},
        headers=_auth(token),
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_system_info(client: AsyncClient):
    r = await client.get("/api/v1/system/info")
    assert r.status_code == 200
    data = r.json()
    assert "version" in data
    assert "mode" in data


@pytest.mark.asyncio
async def test_system_details(client: AsyncClient):
    r = await client.get("/api/v1/system/details")
    assert r.status_code == 200
    data = r.json()
    assert "mode_description" in data
    assert "frr_enabled" in data
    assert "is_production" in data
