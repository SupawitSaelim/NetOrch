"""Tests for SDN/Ryu service parsing helpers."""

from app.services.ryu_service import (
    _parse_actions,
    _parse_dump_flows,
    _match_dict_to_ofctl,
    _actions_list_to_ofctl,
)


class TestParseActions:
    """Test _parse_actions helper."""

    def test_string_with_output_port(self):
        result = _parse_actions("output:1")
        assert result == [{"type": "OUTPUT", "port": 1}]

    def test_string_flood(self):
        result = _parse_actions("FLOOD")
        assert result == [{"type": "FLOOD", "port": ""}]

    def test_string_normal(self):
        result = _parse_actions("NORMAL")
        assert result == [{"type": "NORMAL", "port": ""}]

    def test_string_local(self):
        result = _parse_actions("output:LOCAL")
        assert result == [{"type": "OUTPUT", "port": "LOCAL"}]

    def test_multiple_actions(self):
        result = _parse_actions("output:1,output:2")
        assert len(result) == 2
        assert result[0] == {"type": "OUTPUT", "port": 1}
        assert result[1] == {"type": "OUTPUT", "port": 2}

    def test_already_list(self):
        inp = [{"type": "output", "port": 1}]
        result = _parse_actions(inp)
        assert result == inp

    def test_empty_string(self):
        assert _parse_actions("") == []

    def test_none(self):
        assert _parse_actions(None) == []


class TestParseDumpFlows:
    """Test _parse_dump_flows helper."""

    def test_ip_match(self):
        raw = " cookie=0x0, duration=10s, table=0, n_packets=100, n_bytes=1024, priority=200,ip,nw_src=192.168.64.0/24 actions=NORMAL"
        flows = _parse_dump_flows(raw, "sw1")
        assert len(flows) == 1
        f = flows[0]
        assert f["priority"] == 200
        assert f["match"].get("ip") is True
        assert f["match"].get("nw_src") == "192.168.64.0/24"

    def test_arp_match(self):
        raw = " cookie=0x0, duration=5s, table=0, n_packets=50, n_bytes=512, priority=50,arp actions=FLOOD"
        flows = _parse_dump_flows(raw, "sw1")
        assert len(flows) == 1
        assert flows[0]["match"].get("arp") is True

    def test_skip_header(self):
        raw = "OFPST_FLOW reply:\n cookie=0x0, duration=1s, table=0, n_packets=0, n_bytes=0, priority=100,in_port=1 actions=output:2"
        flows = _parse_dump_flows(raw, "br0")
        assert len(flows) == 1

    def test_empty(self):
        assert _parse_dump_flows("", "br0") == []


class TestMatchDictToOfctl:
    """Test _match_dict_to_ofctl helper."""

    def test_basic(self):
        assert _match_dict_to_ofctl({"in_port": 1, "eth_type": 2048}) in (
            "in_port=1,eth_type=2048",
            "eth_type=2048,in_port=1",
        )

    def test_bool_shorthand(self):
        assert _match_dict_to_ofctl({"arp": True}) == "arp"


class TestActionsListToOfctl:
    """Test _actions_list_to_ofctl helper."""

    def test_output(self):
        assert _actions_list_to_ofctl([{"type": "OUTPUT", "port": 2}]) == "output:2"

    def test_flood(self):
        assert _actions_list_to_ofctl([{"type": "FLOOD"}]) == "flood"

    def test_drop(self):
        assert _actions_list_to_ofctl([{"type": "DROP"}]) == "drop"

    def test_empty(self):
        assert _actions_list_to_ofctl([]) == "drop"
