"""Tests for routing API endpoints (FRR mock mode)."""

import pytest


@pytest.mark.asyncio
async def test_get_routes(client):
    """GET /routing/routes returns mock routing table."""
    r = await client.get("/api/v1/routing/routes")
    assert r.status_code == 200
    data = r.json()
    routes = data.get("routes", data) if isinstance(data, dict) else data
    assert isinstance(routes, list)
    assert len(routes) >= 1
    first = routes[0]
    assert "destination" in first
    assert "next_hop" in first
    assert "protocol" in first
    assert "metric" in first


@pytest.mark.asyncio
async def test_get_routes_filter_protocol(client):
    """Filter routes by protocol."""
    r = await client.get("/api/v1/routing/routes?protocol=bgp")
    assert r.status_code == 200
    data = r.json()
    routes = data.get("routes", data) if isinstance(data, dict) else data
    for route in routes:
        assert route["protocol"] == "bgp"


@pytest.mark.asyncio
async def test_bgp_summary(client):
    """GET /routing/bgp/summary returns BGP summary."""
    r = await client.get("/api/v1/routing/bgp/summary")
    assert r.status_code == 200
    data = r.json()
    assert "local_as" in data
    assert "router_id" in data
    assert "total_neighbors" in data
    assert "neighbors" in data
    assert isinstance(data["neighbors"], list)


@pytest.mark.asyncio
async def test_bgp_neighbors(client):
    """GET /routing/bgp/neighbors returns neighbor list."""
    r = await client.get("/api/v1/routing/bgp/neighbors")
    assert r.status_code == 200
    data = r.json()
    neighbors = data.get("neighbors", data) if isinstance(data, dict) else data
    assert isinstance(neighbors, list)
    if neighbors:
        n = neighbors[0]
        assert "neighbor" in n
        assert "remote_as" in n
        assert "state" in n


@pytest.mark.asyncio
async def test_ospf_neighbors(client):
    """GET /routing/ospf/neighbors returns OSPF neighbors."""
    r = await client.get("/api/v1/routing/ospf/neighbors")
    assert r.status_code == 200
    data = r.json()
    neighbors = data.get("neighbors", data) if isinstance(data, dict) else data
    assert isinstance(neighbors, list)


@pytest.mark.asyncio
async def test_add_static_route_requires_auth(client):
    """POST /routing/routes/static requires authentication."""
    r = await client.post(
        "/api/v1/routing/routes/static",
        json={"destination": "10.99.0.0/24", "next_hop": "192.168.1.1"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_add_static_route_with_auth(client):
    """POST /routing/routes/static with auth succeeds."""
    login_r = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    token = login_r.json()["access_token"]
    r = await client.post(
        "/api/v1/routing/routes/static",
        json={"destination": "10.99.0.0/24", "next_hop": "192.168.1.1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code in (200, 201)
