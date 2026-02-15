"""Tests for topology endpoint."""

import pytest


@pytest.mark.asyncio
async def test_get_topology(client):
    """GET /topology returns nodes and links."""
    r = await client.get("/api/v1/topology")
    assert r.status_code == 200
    data = r.json()
    assert "nodes" in data
    assert "links" in data
    assert "timestamp" in data
    assert isinstance(data["nodes"], list)
    assert isinstance(data["links"], list)


@pytest.mark.asyncio
async def test_topology_node_structure(client):
    """Each node has required fields."""
    r = await client.get("/api/v1/topology")
    data = r.json()
    for node in data["nodes"]:
        assert "id" in node
        assert "type" in node
        assert "name" in node
        assert "metadata" in node
        assert node["type"] in ("switch", "router", "host", "network")


@pytest.mark.asyncio
async def test_topology_link_structure(client):
    """Each link has required fields."""
    r = await client.get("/api/v1/topology")
    data = r.json()
    for link in data["links"]:
        assert "id" in link
        assert "source" in link
        assert "target" in link
        assert "status" in link
        assert link["status"] in ("up", "down")


@pytest.mark.asyncio
async def test_topology_refresh_requires_auth(client):
    """POST /topology/refresh requires auth."""
    r = await client.post("/api/v1/topology/refresh")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_topology_refresh_with_auth(client):
    """POST /topology/refresh with auth returns topology."""
    login_r = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    token = login_r.json()["access_token"]
    r = await client.post(
        "/api/v1/topology/refresh",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "nodes" in data
