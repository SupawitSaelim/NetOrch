"""Tests for Phase 3 Advanced features: failure sim, traffic eng, metrics."""

import pytest


# ── Helpers ──────────────────────────────────────────────────────

async def _login(client) -> str:
    r = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ═══════════════════════════════════════════════════════════════
# Failure Simulation
# ═══════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_list_active_failures_empty(client):
    """GET /simulate/failures returns empty list initially."""
    token = await _login(client)
    r = await client.get("/api/v1/simulate/failures", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert isinstance(data["failures"], list)


@pytest.mark.asyncio
async def test_simulate_link_down(client):
    """POST /simulate/link-down creates a simulated link failure."""
    token = await _login(client)
    r = await client.post(
        "/api/v1/simulate/link-down",
        json={"link_id": "veth-sw1-h1"},
        headers=_auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert "veth-sw1-h1" in data["message"]
    assert data["failure"]["target_type"] == "link"
    assert data["failure"]["target_id"] == "veth-sw1-h1"


@pytest.mark.asyncio
async def test_simulate_link_down_duplicate(client):
    """POST /simulate/link-down for same link returns error."""
    token = await _login(client)

    # Reset state first
    await client.post("/api/v1/simulate/restore", headers=_auth(token))

    # First time succeeds
    r1 = await client.post(
        "/api/v1/simulate/link-down",
        json={"link_id": "eth-dup"},
        headers=_auth(token),
    )
    assert r1.status_code == 200
    assert r1.json()["success"] is True

    # Duplicate fails
    r2 = await client.post(
        "/api/v1/simulate/link-down",
        json={"link_id": "eth-dup"},
        headers=_auth(token),
    )
    assert r2.status_code == 200
    assert r2.json()["success"] is False


@pytest.mark.asyncio
async def test_simulate_link_down_missing_id(client):
    """POST /simulate/link-down without link_id returns 400."""
    token = await _login(client)
    r = await client.post(
        "/api/v1/simulate/link-down",
        json={"link_id": ""},
        headers=_auth(token),
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_simulate_node_failure(client):
    """POST /simulate/node-failure isolates a node."""
    token = await _login(client)

    # Restore first to clear state
    await client.post("/api/v1/simulate/restore", headers=_auth(token))

    r = await client.post(
        "/api/v1/simulate/node-failure",
        json={"node_id": "sw1"},
        headers=_auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["failure"]["target_type"] == "node"


@pytest.mark.asyncio
async def test_simulate_restore_all(client):
    """POST /simulate/restore restores all failures."""
    token = await _login(client)

    # Create a failure
    await client.post(
        "/api/v1/simulate/link-down",
        json={"link_id": "restore-test-link"},
        headers=_auth(token),
    )

    # Restore all
    r = await client.post("/api/v1/simulate/restore", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["restored"] >= 1

    # Verify no failures remain
    r2 = await client.get("/api/v1/simulate/failures", headers=_auth(token))
    assert r2.json()["total"] == 0


@pytest.mark.asyncio
async def test_simulate_restore_one(client):
    """POST /simulate/restore/{target_id} restores a single failure."""
    token = await _login(client)

    # Clear first
    await client.post("/api/v1/simulate/restore", headers=_auth(token))

    # Create two failures
    await client.post(
        "/api/v1/simulate/link-down",
        json={"link_id": "link-a"},
        headers=_auth(token),
    )
    await client.post(
        "/api/v1/simulate/link-down",
        json={"link_id": "link-b"},
        headers=_auth(token),
    )

    # Restore only one
    r = await client.post("/api/v1/simulate/restore/link-a", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["success"] is True

    # Verify one remains
    r2 = await client.get("/api/v1/simulate/failures", headers=_auth(token))
    assert r2.json()["total"] == 1
    assert r2.json()["failures"][0]["target_id"] == "link-b"

    # Cleanup
    await client.post("/api/v1/simulate/restore", headers=_auth(token))


@pytest.mark.asyncio
async def test_simulate_restore_nonexistent(client):
    """POST /simulate/restore/{target_id} for unknown target returns error."""
    token = await _login(client)
    r = await client.post("/api/v1/simulate/restore/does-not-exist", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["success"] is False


@pytest.mark.asyncio
async def test_simulate_requires_auth(client):
    """Simulation endpoints require authentication."""
    r = await client.post("/api/v1/simulate/link-down", json={"link_id": "x"})
    assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════
# Traffic Engineering
# ═══════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_list_traffic_policies_empty(client):
    """GET /traffic/policies initially returns empty list."""
    token = await _login(client)
    r = await client.get("/api/v1/traffic/policies", headers=_auth(token))
    assert r.status_code == 200
    data = r.json()
    assert "policies" in data
    assert isinstance(data["policies"], list)
    assert "total" in data


@pytest.mark.asyncio
async def test_create_traffic_policy(client):
    """POST /traffic/policies creates a new policy."""
    token = await _login(client)
    r = await client.post(
        "/api/v1/traffic/policies",
        json={
            "name": "Test Policy",
            "description": "Route DC traffic",
            "match": {"src_ip": "10.0.0.0/24", "dst_ip": "10.0.1.0/24", "protocol": "tcp"},
            "action": {"type": "forward", "output_port": 2},
            "priority": 200,
        },
        headers=_auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["policy"]["name"] == "Test Policy"
    assert data["policy"]["priority"] == 200
    assert data["policy"]["enabled"] is True
    assert data["policy"]["id"].startswith("policy-")


@pytest.mark.asyncio
async def test_create_policy_missing_name(client):
    """POST /traffic/policies without name returns 400."""
    token = await _login(client)
    r = await client.post(
        "/api/v1/traffic/policies",
        json={"name": ""},
        headers=_auth(token),
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_traffic_policy_crud_lifecycle(client):
    """Full CRUD lifecycle: create → get → toggle → delete."""
    token = await _login(client)

    # Create
    r = await client.post(
        "/api/v1/traffic/policies",
        json={"name": "Lifecycle Test", "match": {"src_ip": "192.168.0.0/16"}, "action": {"type": "drop"}},
        headers=_auth(token),
    )
    assert r.status_code == 200
    policy_id = r.json()["policy"]["id"]

    # Get by ID
    r2 = await client.get(f"/api/v1/traffic/policies/{policy_id}", headers=_auth(token))
    assert r2.status_code == 200
    assert r2.json()["name"] == "Lifecycle Test"

    # Toggle off
    r3 = await client.post(f"/api/v1/traffic/policies/{policy_id}/toggle", headers=_auth(token))
    assert r3.status_code == 200
    assert r3.json()["policy"]["enabled"] is False

    # Toggle back on
    r4 = await client.post(f"/api/v1/traffic/policies/{policy_id}/toggle", headers=_auth(token))
    assert r4.status_code == 200
    assert r4.json()["policy"]["enabled"] is True

    # Update
    r5 = await client.put(
        f"/api/v1/traffic/policies/{policy_id}",
        json={"name": "Updated Name", "priority": 500},
        headers=_auth(token),
    )
    assert r5.status_code == 200
    assert r5.json()["policy"]["name"] == "Updated Name"
    assert r5.json()["policy"]["priority"] == 500

    # Delete
    r6 = await client.delete(f"/api/v1/traffic/policies/{policy_id}", headers=_auth(token))
    assert r6.status_code == 200
    assert r6.json()["success"] is True

    # Verify deleted
    r7 = await client.get(f"/api/v1/traffic/policies/{policy_id}", headers=_auth(token))
    assert r7.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_policy(client):
    """DELETE /traffic/policies/{id} for unknown policy returns 404."""
    token = await _login(client)
    r = await client.delete("/api/v1/traffic/policies/policy-99999", headers=_auth(token))
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_toggle_nonexistent_policy(client):
    """POST /traffic/policies/{id}/toggle for unknown policy returns 404."""
    token = await _login(client)
    r = await client.post("/api/v1/traffic/policies/policy-99999/toggle", headers=_auth(token))
    assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════
# Metrics Export
# ═══════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_metrics_export_json(client):
    """GET /metrics/export returns structured JSON metrics."""
    r = await client.get("/api/v1/metrics/export")
    assert r.status_code == 200
    data = r.json()
    assert data["format"] == "json"
    assert "timestamp" in data
    assert "system" in data
    assert "health" in data
    assert "resources" in data
    assert "networking" in data
    assert "api" in data
    assert isinstance(data["resources"]["cpu_usage_percent"], (int, float))
    assert isinstance(data["resources"]["memory_usage_percent"], (int, float))
    assert "frr" in data["networking"]
    assert "ovs" in data["networking"]
    assert "ryu" in data["networking"]


@pytest.mark.asyncio
async def test_metrics_export_json_system_info(client):
    """GET /metrics/export includes correct system info."""
    r = await client.get("/api/v1/metrics/export")
    data = r.json()
    assert data["system"]["version"] == "0.1.0"
    assert data["system"]["mode"] in ("dc", "wan")
    assert isinstance(data["system"]["uptime_seconds"], int)
    assert isinstance(data["system"]["hostname"], str)


@pytest.mark.asyncio
async def test_metrics_prometheus(client):
    """GET /metrics/prometheus returns Prometheus exposition format."""
    r = await client.get("/api/v1/metrics/prometheus")
    assert r.status_code == 200
    text = r.text
    # Check key metric lines exist
    assert "netorch_up " in text
    assert "netorch_uptime_seconds " in text
    assert "netorch_cpu_usage_percent " in text
    assert "netorch_memory_usage_percent " in text
    assert "netorch_api_requests_total " in text
    assert "netorch_component_health" in text
    assert "netorch_frr_bgp_neighbors " in text
    assert "netorch_ovs_bridges " in text
    assert "netorch_ryu_switches " in text
    # Check HELP/TYPE annotations
    assert "# HELP netorch_up" in text
    assert "# TYPE netorch_up gauge" in text
    assert "# TYPE netorch_uptime_seconds counter" in text


@pytest.mark.asyncio
async def test_metrics_prometheus_no_auth_required(client):
    """Metrics endpoints don't require authentication (for Prometheus scraping)."""
    r1 = await client.get("/api/v1/metrics/export")
    assert r1.status_code == 200
    r2 = await client.get("/api/v1/metrics/prometheus")
    assert r2.status_code == 200
