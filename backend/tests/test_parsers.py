"""Tests for FRR service parsing helpers."""

import pytest

from app.services.frr_service import _parse_route_line, _parse_bgp_summary


class TestParseRouteLine:
    """Test the _parse_route_line helper."""

    def test_kernel_route(self):
        line = "K>* 0.0.0.0/0 [0/100] via 192.168.64.1, enp0s1, 00:06:15"
        result = _parse_route_line(line)
        assert result is not None
        assert result["destination"] == "0.0.0.0/0"
        assert result["protocol"] == "kernel"
        assert result["next_hop"] == "192.168.64.1"
        assert result["selected"] is True
        assert result["fib"] is True

    def test_static_route(self):
        line = "S>* 10.0.0.0/24 [1/0] via 192.168.64.1, enp0s1, weight 1, 00:36:46"
        result = _parse_route_line(line)
        assert result is not None
        assert result["destination"] == "10.0.0.0/24"
        assert result["protocol"] == "static"
        assert result["metric"] == 0

    def test_connected_route(self):
        line = "C>* 192.168.64.0/24 [0/100] is directly connected, enp0s1, 00:36:46"
        result = _parse_route_line(line)
        assert result is not None
        assert result["destination"] == "192.168.64.0/24"
        assert result["protocol"] == "connected"
        assert result["next_hop"] == "0.0.0.0"

    def test_ospf_route(self):
        line = "O   192.168.64.0/24 [110/10] is directly connected, enp0s1, weight 1, 00:36:46"
        result = _parse_route_line(line)
        assert result is not None
        assert result["protocol"] == "ospf"

    def test_non_route_line(self):
        line = "Codes: K - kernel route, C - connected"
        result = _parse_route_line(line)
        assert result is None

    def test_empty_line(self):
        result = _parse_route_line("")
        assert result is None


class TestParseBGPSummary:
    """Test the _parse_bgp_summary helper."""

    def test_parse_bgp_summary(self):
        output = """IPv4 Unicast Summary:
BGP router identifier 192.168.64.3, local AS number 65001 VRF default vrf-id 0
BGP table version 1
RIB entries 1, using 128 bytes of memory
Peers 1, using 24 KiB of memory

Neighbor        V         AS   MsgRcvd   MsgSent   TblVer  InQ OutQ  Up/Down State/PfxRcd   PfxSnt Desc
192.168.64.10   4      65002         0         0        0    0    0    never    Active        0 N/A
Total number of neighbors 1"""
        result = _parse_bgp_summary(output)
        assert result["router_id"] == "192.168.64.3"
        assert result["local_as"] == 65001
        assert result["total_neighbors"] == 1
        assert len(result["neighbors"]) == 1
        assert result["neighbors"][0]["neighbor"] == "192.168.64.10"
        assert result["neighbors"][0]["remote_as"] == 65002
        assert result["neighbors"][0]["state"] == "Active"

    def test_established_neighbor(self):
        output = """BGP router identifier 10.0.0.1, local AS number 65001
Neighbor        V         AS   MsgRcvd   MsgSent   TblVer  InQ OutQ  Up/Down State/PfxRcd   PfxSnt Desc
10.0.0.2        4      65002       100        80        0    0    0 01:23:45           5        3 N/A"""
        result = _parse_bgp_summary(output)
        assert result["established"] == 1
        assert result["neighbors"][0]["state"] == "Established"
        assert result["neighbors"][0]["prefixes_received"] == 5

    def test_empty_output(self):
        result = _parse_bgp_summary("")
        assert result["total_neighbors"] == 0
        assert result["neighbors"] == []
