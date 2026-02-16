"""Tests for Network Tools endpoints — ping, traceroute, arp, mac, capture, interfaces."""

from __future__ import annotations

import pytest
from unittest.mock import patch
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

_MOCK_TCPDUMP = """\
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes
12:34:56.789012 aa:bb:cc:dd:ee:01 > ff:ff:ff:ff:ff:ff, ethertype ARP (0x0806), length 42: Request who-has 10.0.0.20 tell 10.0.0.1, length 28
12:34:56.790000 aa:bb:cc:dd:ee:02 > aa:bb:cc:dd:ee:01, ethertype IPv4 (0x0800), length 98: 10.0.0.20 > 10.0.0.1: ICMP echo reply, id 1, seq 1, length 64
12:34:56.791000 aa:bb:cc:dd:ee:01 > aa:bb:cc:dd:ee:02, ethertype IPv4 (0x0800), length 74: 10.0.0.1.12345 > 10.0.0.20.80: Flags [S], seq 0, win 29200, length 0
3 packets captured
3 packets received by filter
0 packets dropped by kernel
"""

_MOCK_IFACE = """\
lo               UNKNOWN        127.0.0.1/8 ::1/128
eth0             UP             10.0.0.1/24 fe80::1/64
ovs-system       DOWN
sw1              UNKNOWN        192.168.1.1/24
"""


async def _mock_ssh(command: str, timeout: int = 15) -> CmdResult:
    """Return canned output for network tool commands."""
    cmd = command.strip()
    if "tcpdump" in cmd:
        return CmdResult(_MOCK_TCPDUMP.strip(), "", 0)
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
    if "ip -br addr" in cmd:
        return CmdResult(_MOCK_IFACE.strip(), "", 0)
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


_MOCK_PORTS_DESC = """\
OFPST_PORT_DESC reply (OF1.3) (xid=0x2):
 1(router1-veth0): addr:aa:d2:75:ad:68:cc
     config:     0
     state:      LIVE
     current:    10GB-FD COPPER
     speed: 10000 Mbps now, 0 Mbps max
 2(pc1-veth): addr:5e:0a:9e:24:9a:d8
     config:     0
     state:      LIVE
     current:    10GB-FD COPPER
     speed: 10000 Mbps now, 0 Mbps max
 LOCAL(sw1): addr:ce:6f:10:ea:82:4e
     config:     0
     state:      LIVE
     speed: 0 Mbps now, 0 Mbps max
"""

_MOCK_NS_LINK_ROUTER1 = """\
lo               UNKNOWN        00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP>
gre0@NONE        DOWN           0.0.0.0 <NOARP>
gretap0@NONE     DOWN           00:00:00:00:00:00 <BROADCAST,MULTICAST>
erspan0@NONE     DOWN           00:00:00:00:00:00 <BROADCAST,MULTICAST>
router1-eth0@if30 UP             de:3b:f4:69:26:a6 <BROADCAST,MULTICAST,UP,LOWER_UP>
"""

_MOCK_NS_LINK_PC1 = """\
lo               UNKNOWN        00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP>
gre0@NONE        DOWN           0.0.0.0 <NOARP>
gretap0@NONE     DOWN           00:00:00:00:00:00 <BROADCAST,MULTICAST>
erspan0@NONE     DOWN           00:00:00:00:00:00 <BROADCAST,MULTICAST>
pc1-eth0@if40    UP             d6:cf:5f:74:9b:31 <BROADCAST,MULTICAST,UP,LOWER_UP>
"""


@pytest.mark.anyio
async def test_mac_table_openflow_fallback(client):
    """When FDB is empty (OpenFlow mode), falls back to dump-ports-desc + namespace MACs."""
    async def _mock_openflow(command: str, timeout: int = 15) -> CmdResult:
        cmd = command.strip()
        if "fdb/show" in cmd:
            # Empty FDB — only header
            return CmdResult(" port  VLAN  MAC                Age", "", 0)
        if "dump-ports-desc" in cmd:
            return CmdResult(_MOCK_PORTS_DESC.strip(), "", 0)
        if "ip netns exec router1" in cmd and "ip -br link" in cmd:
            return CmdResult(_MOCK_NS_LINK_ROUTER1.strip(), "", 0)
        if "ip netns exec pc1" in cmd and "ip -br link" in cmd:
            return CmdResult(_MOCK_NS_LINK_PC1.strip(), "", 0)
        return await _mock_ssh(command, timeout)

    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_mock_openflow):
        r = await client.post("/api/v1/tools/mac", json={"bridge": "sw1"})
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["total"] == 2  # router1-veth0 + pc1-veth (LOCAL excluded)

    # Should resolve endpoint MACs from namespaces
    macs = {e['port_name']: e for e in data['entries']}
    assert 'router1-veth0' in macs
    assert macs['router1-veth0']['mac'] == 'de:3b:f4:69:26:a6'  # endpoint MAC
    assert macs['router1-veth0']['endpoint'] == 'router1'
    assert macs['router1-veth0']['port'] == '1'

    assert 'pc1-veth' in macs
    assert macs['pc1-veth']['mac'] == 'd6:cf:5f:74:9b:31'  # endpoint MAC
    assert macs['pc1-veth']['endpoint'] == 'pc1'
    assert macs['pc1-veth']['port'] == '2'


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


# ── Capture tests ─────────────────────────────────────────────────

@pytest.mark.anyio
async def test_capture_basic(client):
    """Basic capture returns parsed packets."""
    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_mock_ssh):
        r = await client.post("/api/v1/tools/capture", json={
            "source": "",
            "interface": "eth0",
            "count": 3,
            "timeout": 10,
        })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["interface"] == "eth0"
    assert data["total"] == 3
    assert len(data["packets"]) == 3
    # First packet should be ARP
    pkt0 = data["packets"][0]
    assert pkt0["protocol"] == "ARP"
    assert pkt0["src_mac"] == "aa:bb:cc:dd:ee:01"
    assert pkt0["dst_mac"] == "ff:ff:ff:ff:ff:ff"
    assert pkt0["timestamp"] == "12:34:56.789012"
    # Second packet should be ICMP
    pkt1 = data["packets"][1]
    assert pkt1["protocol"] == "ICMP"
    assert pkt1["src_ip"] == "10.0.0.20"
    assert pkt1["dst_ip"] == "10.0.0.1"
    # Third packet should be TCP
    pkt2 = data["packets"][2]
    assert pkt2["protocol"] == "TCP"


@pytest.mark.anyio
async def test_capture_summary(client):
    """Capture returns summary statistics."""
    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_mock_ssh):
        r = await client.post("/api/v1/tools/capture", json={})
    assert r.status_code == 200
    data = r.json()
    assert data["summary"]["captured"] == 3
    assert data["summary"]["received"] == 3
    assert data["summary"]["dropped"] == 0


@pytest.mark.anyio
async def test_capture_with_netns(client):
    """Capture in a netns wraps with ip netns exec."""
    calls = []
    async def _spy_ssh(command: str, timeout: int = 15) -> CmdResult:
        calls.append(command)
        return await _mock_ssh(command, timeout)

    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_spy_ssh):
        r = await client.post("/api/v1/tools/capture", json={
            "source": "h1",
            "interface": "eth0",
        })
    assert r.status_code == 200
    assert any("ip netns exec h1" in c and "tcpdump" in c for c in calls)


@pytest.mark.anyio
async def test_capture_with_filter(client):
    """Capture with BPF filter passes it to tcpdump."""
    calls = []
    async def _spy_ssh(command: str, timeout: int = 15) -> CmdResult:
        calls.append(command)
        return await _mock_ssh(command, timeout)

    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_spy_ssh):
        r = await client.post("/api/v1/tools/capture", json={
            "filter": "icmp",
        })
    assert r.status_code == 200
    assert any("icmp" in c for c in calls)
    assert r.json()["filter"] == "icmp"


@pytest.mark.anyio
async def test_capture_invalid_filter(client):
    """BPF filter with shell metacharacters should be rejected."""
    r = await client.post("/api/v1/tools/capture", json={
        "filter": "icmp; cat /etc/passwd",
    })
    assert r.status_code == 400


@pytest.mark.anyio
async def test_capture_invalid_source(client):
    """Source with injection should be rejected."""
    r = await client.post("/api/v1/tools/capture", json={
        "source": "h1; rm -rf /",
    })
    assert r.status_code == 400


# ── Interfaces tests ──────────────────────────────────────────────

@pytest.mark.anyio
async def test_list_interfaces(client):
    """List interfaces returns parsed interface list."""
    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_mock_ssh):
        r = await client.get("/api/v1/tools/interfaces")
    assert r.status_code == 200
    data = r.json()
    ifaces = data["interfaces"]
    assert len(ifaces) == 4
    # Check eth0
    eth0 = next(i for i in ifaces if i["name"] == "eth0")
    assert eth0["state"] == "UP"
    assert "10.0.0.1/24" in eth0["addresses"]


@pytest.mark.anyio
async def test_list_interfaces_with_netns(client):
    """List interfaces in a netns wraps with ip netns exec."""
    calls = []
    async def _spy_ssh(command: str, timeout: int = 15) -> CmdResult:
        calls.append(command)
        return await _mock_ssh(command, timeout)

    with patch("app.api.v1.network_tools.ssh_exec", side_effect=_spy_ssh):
        r = await client.get("/api/v1/tools/interfaces?source=h1")
    assert r.status_code == 200
    assert any("ip netns exec h1" in c for c in calls)

