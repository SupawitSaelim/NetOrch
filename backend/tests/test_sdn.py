"""Tests for SDN flow and switch endpoints (mock mode)."""

import pytest


@pytest.mark.asyncio
async def test_get_flows(client):
    """GET /sdn/flows returns flow list."""
    r = await client.get("/api/v1/sdn/flows")
    assert r.status_code == 200
    data = r.json()
    assert "flows" in data
    assert "total" in data
    assert isinstance(data["flows"], list)


@pytest.mark.asyncio
async def test_get_switches(client):
    """GET /switches returns switch list."""
    r = await client.get("/api/v1/switches")
    assert r.status_code == 200
    data = r.json()
    assert "switches" in data
    assert isinstance(data["switches"], list)
    if data["switches"]:
        sw = data["switches"][0]
        assert "name" in sw
        assert "dpid" in sw


@pytest.mark.asyncio
async def test_get_single_flow_not_found(client):
    """GET /sdn/flows/{id} returns 404 for bad id."""
    r = await client.get("/api/v1/sdn/flows/nonexistent")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_add_flow_requires_auth(client):
    """POST /sdn/flows requires authentication."""
    r = await client.post(
        "/api/v1/sdn/flows",
        json={"dpid": "0000000000000001", "match": {"in_port": 1}, "actions": [{"type": "output", "port": 2}], "priority": 100},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_delete_flow_requires_auth(client):
    """DELETE /sdn/flows/{id} requires authentication."""
    r = await client.delete("/api/v1/sdn/flows/flow-001")
    assert r.status_code == 401
