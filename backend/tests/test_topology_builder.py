"""Tests for topology builder endpoints — presets, router config, BGP/OSPF."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest


# ── Helper: auth token ──
async def _token(client):
    r = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    return r.json()["access_token"]


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


# Mock SSH for vtysh commands
_MOCK_RUNNING_CONFIG = """\
Building configuration...

Current configuration:
!
frr defaults traditional
hostname router1
!
router bgp 65001
 bgp router-id 10.0.0.1
 neighbor 10.0.0.2 remote-as 65002
!
end
"""

_MOCK_ROUTES = """\
Codes: K - kernel route, C - connected, S - static, R - RIP,
       O - OSPF, B - BGP, > - selected route

C>* 10.0.0.0/24 is directly connected, eth0, 00:10:00
B>* 172.16.0.0/16 [20/0] via 10.0.0.2, eth0, weight 1, 00:05:00
K>* 0.0.0.0/0 [0/0] via 10.0.0.1, eth0, weight 1, 01:00:00
"""


async def _mock_ssh_builder(command: str, timeout: int = 15):
    """Mock SSH for topology builder commands."""
    from app.services.ssh_utils import CmdResult

    cmd = command.strip()

    # vtysh commands
    if "vtysh" in cmd and "show running-config" in cmd:
        return CmdResult(_MOCK_RUNNING_CONFIG, "", 0)
    if "vtysh" in cmd and "show ip route" in cmd:
        return CmdResult(_MOCK_ROUTES, "", 0)
    if "vtysh" in cmd and "show interface brief" in cmd:
        return CmdResult("Interface  Status  VRF  Addresses\neth0       up      default  10.0.0.1/24", "", 0)
    if "vtysh" in cmd and ("configure terminal" in cmd or "router bgp" in cmd or "router ospf" in cmd):
        return CmdResult("", "", 0)

    # ip netns
    if cmd == "ip netns list":
        return CmdResult("router1 (id: 0)\npc1 (id: 1)", "", 0)
    if "ip netns list | grep -w" in cmd:
        name = cmd.split("grep -w ")[-1]
        if name in ("router1", "pc1"):
            return CmdResult(name, "", 0)
        return CmdResult("", "", 1)
    if "ip netns add" in cmd:
        return CmdResult("", "", 0)
    if "ip netns exec" in cmd and "sysctl" in cmd:
        return CmdResult("net.ipv4.ip_forward = 1", "", 0)
    if "ip netns exec" in cmd and "ip link set" in cmd:
        return CmdResult("", "", 0)
    if "ip netns exec" in cmd and "ip addr add" in cmd:
        return CmdResult("", "", 0)
    if "ip netns exec" in cmd and "ip route" in cmd:
        return CmdResult("", "", 0)
    if "ip netns del" in cmd:
        return CmdResult("", "", 0)

    # ip link
    if "ip link add" in cmd:
        return CmdResult("", "", 0)
    if "ip link set" in cmd:
        return CmdResult("", "", 0)
    if "ip link del" in cmd:
        return CmdResult("", "", 0)
    if "ip -o link show" in cmd:
        return CmdResult("", "", 0)
    if "ip -br addr show" in cmd:
        return CmdResult("", "", 0)

    # FRR
    if cmd.startswith("mkdir"):
        return CmdResult("", "", 0)
    if cmd.startswith("chown"):
        return CmdResult("", "", 0)
    if "cat >" in cmd:
        return CmdResult("", "", 0)
    if "pkill" in cmd:
        return CmdResult("", "", 0)
    if "rm -rf" in cmd:
        return CmdResult("", "", 0)
    if "/usr/libexec/frr/" in cmd:
        return CmdResult("", "", 0)
    if cmd.startswith("cp "):
        return CmdResult("", "", 0)

    # OVS
    if "ovs-vsctl" in cmd or "ovs-ofctl" in cmd:
        if "br-exists" in cmd:
            return CmdResult("", "", 1)  # bridge doesn't exist
        if "add-br" in cmd or "add-port" in cmd or "del-br" in cmd or "del-port" in cmd:
            return CmdResult("", "", 0)
        if "set bridge" in cmd or "set-controller" in cmd or "set-fail-mode" in cmd:
            return CmdResult("", "", 0)
        if "list-br" in cmd:
            return CmdResult("br-test", "", 0)
        if "list-ports" in cmd:
            return CmdResult("", "", 0)
        if "port-to-br" in cmd:
            return CmdResult("", "", 1)
        return CmdResult("", "", 0)

    return CmdResult("", "unknown command", 1)


@pytest.fixture
async def auth_client(client):
    """Client with auth token."""
    token = await _token(client)
    return client, token


# ═══════════════════════════════════════════════════════════════
# Presets Tests
# ═══════════════════════════════════════════════════════════════

class TestPresets:
    """Tests for topology preset save/load/delete."""

    @pytest.fixture(autouse=True)
    def _cleanup_presets(self, tmp_path):
        """Use a temporary presets file for each test."""
        test_file = tmp_path / "presets.json"
        with patch("app.api.v1.topology_builder._PRESETS_FILE", test_file):
            yield

    @pytest.mark.asyncio
    async def test_list_presets_empty(self, client):
        r = await client.get("/api/v1/topology/builder/presets")
        assert r.status_code == 200
        assert r.json()["presets"] == []

    @pytest.mark.asyncio
    async def test_save_preset(self, auth_client):
        client, token = auth_client
        r = await client.post(
            "/api/v1/topology/builder/presets",
            json={"name": "test-preset", "description": "A test"},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["success"] is True
        assert "test-preset" in r.json()["message"]

    @pytest.mark.asyncio
    async def test_save_and_list_preset(self, auth_client):
        client, token = auth_client
        await client.post(
            "/api/v1/topology/builder/presets",
            json={"name": "my-topo", "description": "My topology"},
            headers=_auth(token),
        )
        r = await client.get("/api/v1/topology/builder/presets")
        assert r.status_code == 200
        presets = r.json()["presets"]
        assert len(presets) >= 1
        names = [p["name"] for p in presets]
        assert "my-topo" in names

    @pytest.mark.asyncio
    async def test_delete_preset(self, auth_client):
        client, token = auth_client
        # Save first
        await client.post(
            "/api/v1/topology/builder/presets",
            json={"name": "del-me", "description": ""},
            headers=_auth(token),
        )
        # Delete
        r = await client.delete("/api/v1/topology/builder/presets/del-me")
        assert r.status_code == 200
        assert r.json()["success"] is True

        # Verify gone
        r = await client.get("/api/v1/topology/builder/presets")
        names = [p["name"] for p in r.json()["presets"]]
        assert "del-me" not in names

    @pytest.mark.asyncio
    async def test_delete_nonexistent_preset(self, client):
        r = await client.delete("/api/v1/topology/builder/presets/nope")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_preset(self, auth_client):
        client, token = auth_client
        await client.post(
            "/api/v1/topology/builder/presets",
            json={"name": "get-me", "description": "desc"},
            headers=_auth(token),
        )
        r = await client.get("/api/v1/topology/builder/presets/get-me")
        assert r.status_code == 200
        data = r.json()
        assert data["description"] == "desc"
        assert "nodes" in data
        assert "links" in data
        assert "saved_at" in data

    @pytest.mark.asyncio
    async def test_get_nonexistent_preset(self, client):
        r = await client.get("/api/v1/topology/builder/presets/nope")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_save_preset_invalid_name(self, auth_client):
        client, token = auth_client
        r = await client.post(
            "/api/v1/topology/builder/presets",
            json={"name": "bad name!!", "description": ""},
            headers=_auth(token),
        )
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_preset_overwrite(self, auth_client):
        client, token = auth_client
        await client.post(
            "/api/v1/topology/builder/presets",
            json={"name": "dup", "description": "first"},
            headers=_auth(token),
        )
        await client.post(
            "/api/v1/topology/builder/presets",
            json={"name": "dup", "description": "second"},
            headers=_auth(token),
        )
        r = await client.get("/api/v1/topology/builder/presets/dup")
        assert r.json()["description"] == "second"


# ═══════════════════════════════════════════════════════════════
# Router Config Tests
# ═══════════════════════════════════════════════════════════════

class TestRouterConfig:
    """Tests for per-router config/routes/BGP/OSPF endpoints."""

    @pytest.mark.asyncio
    async def test_get_router_config(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder):
            r = await client.get(
                "/api/v1/topology/builder/routers/router1/config",
                headers=_auth(token),
            )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "router1"
        assert "config" in data
        assert "router bgp" in data["config"]

    @pytest.mark.asyncio
    async def test_get_router_routes(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder):
            r = await client.get(
                "/api/v1/topology/builder/routers/router1/routes",
                headers=_auth(token),
            )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "router1"
        assert "routes" in data
        assert "10.0.0.0/24" in data["routes"]

    @pytest.mark.asyncio
    async def test_get_router_interfaces(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder):
            r = await client.get(
                "/api/v1/topology/builder/routers/router1/interfaces",
                headers=_auth(token),
            )
        assert r.status_code == 200
        assert "interfaces" in r.json()

    @pytest.mark.asyncio
    async def test_add_bgp_neighbor(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder):
            r = await client.post(
                "/api/v1/topology/builder/routers/router1/bgp/neighbor",
                json={"neighbor_ip": "10.0.0.3", "remote_as": 65003},
                headers=_auth(token),
            )
        assert r.status_code == 200
        assert r.json()["success"] is True
        assert "65003" in r.json()["message"]

    @pytest.mark.asyncio
    async def test_add_bgp_neighbor_invalid_ip(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder):
            r = await client.post(
                "/api/v1/topology/builder/routers/router1/bgp/neighbor",
                json={"neighbor_ip": "invalid!", "remote_as": 65003},
                headers=_auth(token),
            )
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_delete_bgp_neighbor(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder):
            r = await client.delete(
                "/api/v1/topology/builder/routers/router1/bgp/neighbor/10.0.0.2",
                headers=_auth(token),
            )
        assert r.status_code == 200
        assert r.json()["success"] is True

    @pytest.mark.asyncio
    async def test_configure_ospf(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder):
            r = await client.post(
                "/api/v1/topology/builder/routers/router1/ospf",
                json={"network": "10.0.0.0/24", "area": "0"},
                headers=_auth(token),
            )
        assert r.status_code == 200
        assert r.json()["success"] is True
        assert "10.0.0.0/24" in r.json()["message"]

    @pytest.mark.asyncio
    async def test_configure_ospf_invalid_network(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder):
            r = await client.post(
                "/api/v1/topology/builder/routers/router1/ospf",
                json={"network": "bad-net", "area": "0"},
                headers=_auth(token),
            )
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_router_config_invalid_name(self, auth_client):
        client, token = auth_client
        r = await client.get(
            "/api/v1/topology/builder/routers/bad%20name!/config",
            headers=_auth(token),
        )
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════
# Builder CRUD Tests (switch, host, router, cloud)
# ═══════════════════════════════════════════════════════════════

class TestBuilderCRUD:
    """Tests for create/delete switches, hosts, routers, clouds."""

    @pytest.mark.asyncio
    async def test_create_switch(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder), \
             patch("app.api.v1.topology_builder.ovs_exec", side_effect=_mock_ssh_builder):
            r = await client.post(
                "/api/v1/topology/builder/switches",
                json={"name": "br-test", "protocols": "OpenFlow13"},
                headers=_auth(token),
            )
        assert r.status_code == 201
        assert r.json()["success"] is True
        assert "br-test" in r.json()["message"]

    @pytest.mark.asyncio
    async def test_create_switch_empty_name(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder), \
             patch("app.api.v1.topology_builder.ovs_exec", side_effect=_mock_ssh_builder):
            r = await client.post(
                "/api/v1/topology/builder/switches",
                json={"name": ""},
                headers=_auth(token),
            )
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_create_host(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder), \
             patch("app.api.v1.topology_builder.ovs_exec", side_effect=_mock_ssh_builder):
            r = await client.post(
                "/api/v1/topology/builder/hosts",
                json={"name": "pc2", "ip": "10.0.1.2/24"},
                headers=_auth(token),
            )
        assert r.status_code == 201
        assert r.json()["success"] is True

    @pytest.mark.asyncio
    async def test_create_router(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder), \
             patch("app.api.v1.topology_builder.ovs_exec", side_effect=_mock_ssh_builder):
            r = await client.post(
                "/api/v1/topology/builder/routers",
                json={"name": "rtr1"},
                headers=_auth(token),
            )
        assert r.status_code == 201
        assert r.json()["success"] is True
        assert "FRR" in r.json()["message"]

    @pytest.mark.asyncio
    async def test_create_cloud(self, auth_client):
        client, token = auth_client
        r = await client.post(
            "/api/v1/topology/builder/clouds",
            json={"name": "internet-test"},
            headers=_auth(token),
        )
        assert r.status_code == 201
        assert r.json()["success"] is True

    @pytest.mark.asyncio
    async def test_delete_switch(self, auth_client):
        client, token = auth_client

        async def _mock_br_exists(command, timeout=15):
            from app.services.ssh_utils import CmdResult
            if "br-exists" in command and "test-sw" in command:
                return CmdResult("", "", 0)  # exists
            return await _mock_ssh_builder(command, timeout)

        with patch("app.api.v1.topology_builder.ovs_exec", side_effect=_mock_br_exists):
            r = await client.delete("/api/v1/topology/builder/switches/test-sw")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_nonexistent_switch(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ovs_exec", side_effect=_mock_ssh_builder):
            r = await client.delete("/api/v1/topology/builder/switches/nope")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_router(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder), \
             patch("app.api.v1.topology_builder.ovs_exec", side_effect=_mock_ssh_builder):
            r = await client.delete("/api/v1/topology/builder/routers/router1")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_nonexistent_router(self, auth_client):
        client, token = auth_client

        async def _no_ns(command, timeout=15):
            from app.services.ssh_utils import CmdResult
            if "ip netns list | grep -w" in command:
                return CmdResult("", "", 1)  # not found
            return await _mock_ssh_builder(command, timeout)

        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_no_ns):
            r = await client.delete("/api/v1/topology/builder/routers/nope")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_list_hosts(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder):
            r = await client.get("/api/v1/topology/builder/hosts")
        assert r.status_code == 200
        assert "hosts" in r.json()
        assert "total" in r.json()

    @pytest.mark.asyncio
    async def test_clear_all(self, auth_client):
        client, token = auth_client
        with patch("app.api.v1.topology_builder.ssh_exec", side_effect=_mock_ssh_builder), \
             patch("app.api.v1.topology_builder.ovs_exec", side_effect=_mock_ssh_builder):
            r = await client.delete("/api/v1/topology/builder/all")
        assert r.status_code == 200
        assert r.json()["success"] is True
        assert "removed_bridges" in r.json()
        assert "removed_namespaces" in r.json()
