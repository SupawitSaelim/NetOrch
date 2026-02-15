"""Tests for monitoring endpoint."""

import pytest


@pytest.mark.asyncio
async def test_get_monitoring_stats(client):
    """GET /monitoring/stats returns system metrics."""
    r = await client.get("/api/v1/monitoring/stats")
    assert r.status_code == 200
    data = r.json()
    assert "cpu_usage" in data
    assert "memory_usage" in data
    assert "uptime" in data
    assert isinstance(data["cpu_usage"], (int, float))
    assert isinstance(data["memory_usage"], (int, float))


@pytest.mark.asyncio
async def test_get_events(client):
    """GET /monitoring/events returns event list."""
    r = await client.get("/api/v1/monitoring/events")
    assert r.status_code == 200
    data = r.json()
    assert "events" in data
    assert isinstance(data["events"], list)
