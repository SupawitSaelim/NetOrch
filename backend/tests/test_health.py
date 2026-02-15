"""Tests for health and system info endpoints."""

import pytest


@pytest.mark.asyncio
async def test_root(client):
    """Root endpoint returns project info."""
    r = await client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert "name" in data
    assert "version" in data
    assert data["api"] == "/api/v1"


@pytest.mark.asyncio
async def test_health(client):
    """Health endpoint returns all component statuses."""
    r = await client.get("/api/v1/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert "components" in data
    assert "timestamp" in data
    comp = data["components"]
    for key in ("api", "frr", "ryu", "ovs"):
        assert key in comp


@pytest.mark.asyncio
async def test_system_info(client):
    """System info returns version and mode."""
    r = await client.get("/api/v1/system/info")
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == "0.1.0"
    assert data["mode"] in ("dc", "wan")
    assert isinstance(data["uptime"], int)
    assert "hostname" in data
