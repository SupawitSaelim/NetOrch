"""Tests for Network Tools endpoints — ping, traceroute, arp, mac, bridges."""

from __future__ import annotations

import pytest
from unittest.mock import patch, AsyncMock
from app.services.ssh_utils import CmdResult


# ── Mock helpers ──────────────────────────────────────────────────

_MOCK_PING = """\
PING 10.0.0.20 (10.0.0.20) 56(84) bytes of data.
64 bytes from 10.0.0.20: icmp_seq=1 ttl=64 time=0.042 ms
64 bytes from 10.0.0.20: icmp_seq=2 ttl=64 time=0.038 ms

--- 10.0.0.20 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1001ms
rtt min/avg/max/mdev = 0.038/0.040/0.042/0.002 ms
"""

_MOCK_TRACEROUTE = """\
traceroute to 10.0.0.20 (10.0.0.20), 15 hops max, 60 byte packets
 1  10.0.0.1  0.321 ms  0.290 ms  0.273 ms
 2  10.0.0.20  0.543 ms  0.521 ms  0.510 ms
"""

_MOCK_ARP = """\
10.0.0.1 dev eth0 lladdr aa:bb:cc:dd:ee:01 REACHABLE
10.0.0.20 dev eth0 lladdr aa:bb:cc:dd:ee:02 STALE
"""

_MOCK_FDB = """\
 port  VLAN  MAC                Age
    1     0  aa:bb:cc:dd:ee:01   10
    2     0  aa:bb:cc:dd:ee:02   25
    3     0  ff:ff:ff:ff:ff:ff    5
"""

_MOCK_LIST_BR = "sw1\nsw2\n"

_MOCK_NETNS = "h1 (id: 0)\nh2 (id: 1)\nrouter1 (id: 2)\n"


async def _mock_ssh(command: str, timeout: int = 15) -> CmdResult:
    """Return canned output for network tool commands."""
    cmd = command.strip()
    if "ping" in cmd:
        return CmdResult(_MOCK_PING.strip(), "", 0)
    if "traceroute" in cmd:
        return CmdResult(_MOCK_TRACEROUTE.strip(), "", 0)
    if "ip neigh" in cmd:
        return CmdResult(_MOCK_ARP.strip(), "", 0)
    if "fdb/show" in cmd:
        return CmdResult(_MOCK_FDB.strip(), "", 0)
    if "ovs-vsctl list-br" in cmd:
        return CmdResult(_MOCK_LIST_BR.strip(), "", 0)
    if "ip netns list" in cmd:
        return CmdResult(_MOCK_NETNS.strip(), "", 0)
    return CmdResult("", "unknown command", 1)


# ── Tests ─────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_ping(client):
    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_mock_ssh):
        r = await client.post("/api/v1/tools/ping", json={
            "source": "h1",
            "target": "10.0.0.20",
            "count": 2,
        })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["source"] == "h1"
    assert data["target"] == "10.0.0.20"
    assert data["summary"]["transmitted"] == 2
    assert data["summary"]["received"] == 2
    assert data["summary"]["loss_pct"] == 0.0
    assert data["summary"]["rtt_avg"] == 0.040


@pytest.mark.anyio
async def test_traceroute(client):
    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_mock_ssh):
        r = await client.post("/api/v1/tools/traceroute", json={
            "source": "h1",
            "target": "10.0.0.20",
        })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert len(data["hops"]) == 2
    assert data["hops"][0]["hop"] == 1


@pytest.mark.anyio
async def test_arp(client):
    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_mock_ssh):
        r = await client.post("/api/v1/tools/arp", json={"source": "h1"})
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert len(data["entries"]) == 2
    assert data["entries"][0]["ip"] == "10.0.0.1"
    assert data["entries"][0]["mac"] == "aa:bb:cc:dd:ee:01"
    assert data["entries"][0]["state"] == "REACHABLE"


@pytest.mark.anyio
async def test_mac_table(client):
    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_mock_ssh):
        r = await client.post("/api/v1/tools/mac", json={"bridge": "sw1"})
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["bridge"] == "sw1"
    assert data["total"] == 3
    assert len(data["entries"]) == 3
    assert data["entries"][0]["mac"] == "aa:bb:cc:dd:ee:01"
    assert data["entries"][0]["port"] == "1"
    assert data["entries"][0]["vlan"] == "0"
    assert data["entries"][0]["age"] == "10"
    assert data["entries"][2]["mac"] == "ff:ff:ff:ff:ff:ff"


@pytest.mark.anyio
async def test_mac_table_invalid_bridge(client):
    """Invalid bridge name should return 400."""
    r = await client.post("/api/v1/tools/mac", json={"bridge": "sw1; rm -rf /"})
    assert r.status_code == 400


@pytest.mark.anyio
async def test_list_bridges(client):
    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_mock_ssh):
        r = await client.get("/api/v1/tools/bridges")
    assert r.status_code == 200
    data = r.json()
    assert data["bridges"] == ["sw1", "sw2"]


@pytest.mark.anyio
async def test_list_hosts(client):
    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_mock_ssh):
        r = await client.get("/api/v1/tools/hosts")
    assert r.status_code == 200
    data = r.json()
    assert "h1" in data["hosts"]
    assert "router1" in data["hosts"]


@pytest.mark.anyio
async def test_ping_invalid_source(client):
    """Injection attempt in source should be rejected."""
    r = await client.post("/api/v1/tools/ping", json={
        "source": "h1; cat /etc/passwd",
        "target": "10.0.0.1",
    })
    assert r.status_code == 400


@pytest.mark.anyio
async def test_ping_invalid_target(client):
    """Injection attempt in target should be rejected."""
    r = await client.post("/api/v1/tools/ping", json={
        "source": "h1",
        "target": "10.0.0.1; rm -rf /",
    })
    assert r.status_code == 400
