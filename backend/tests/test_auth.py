"""Tests for authentication endpoints and token flow."""

import pytest


@pytest.mark.asyncio
async def test_login_success(client):
    """POST /auth/login with valid credentials."""
    r = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_failure(client):
    """POST /auth/login with invalid credentials."""
    r = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrong"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_authenticated_endpoint(client):
    """Use token to access protected endpoint."""
    # Login
    login_r = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    token = login_r.json()["access_token"]

    # Access protected endpoint
    r = await client.post(
        "/api/v1/sdn/flows",
        json={
            "dpid": "0000000000000001",
            "match": {"in_port": 1},
            "actions": [{"type": "output", "port": 2}],
            "priority": 100,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["success"] is True
    assert "flow_id" in data
