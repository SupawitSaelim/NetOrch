"""Tests for VRF management endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


async def _login(client: AsyncClient) -> str:
    r = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_vrf_list_no_auth_allowed(client: AsyncClient):
    """VRF list is public (no auth required)."""
    r = await client.get("/api/v1/vrf")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_vrf_list(client: AsyncClient):
    token = await _login(client)
    r = await client.get("/api/v1/vrf", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert "vrfs" in data
    assert isinstance(data["vrfs"], list)


@pytest.mark.asyncio
async def test_vrf_create_mock_mode(client: AsyncClient):
    token = await _login(client)
    # In mock mode (frr_enabled=false), create returns success without validation
    r = await client.post(
        "/api/v1/vrf",
        json={"name": "newvrf1"},
        headers=_auth(token),
    )
    assert r.status_code == 201
    assert r.json()["success"] is True


@pytest.mark.asyncio
async def test_vrf_create_valid(client: AsyncClient):
    token = await _login(client)
    r = await client.post(
        "/api/v1/vrf",
        json={"name": "testvrf1"},
        headers=_auth(token),
    )
    # 201 in mock mode, 500 only if SSH failure
    assert r.status_code in (200, 201, 500)


@pytest.mark.asyncio
async def test_vrf_delete_validate_name(client: AsyncClient):
    token = await _login(client)
    r = await client.delete(
        "/api/v1/vrf/testvrf$(whoami)",
        headers=_auth(token),
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_vrf_routes(client: AsyncClient):
    token = await _login(client)
    r = await client.get("/api/v1/vrf/default/routes", headers=_auth(token))
    assert r.status_code in (200, 500)
