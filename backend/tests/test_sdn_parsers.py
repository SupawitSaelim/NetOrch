"""Tests for SDN/Ryu service parsing helpers."""

from app.services.ryu_service import _parse_actions, _parse_match_from_raw


class TestParseActions:
    """Test _parse_actions helper."""

    def test_string_with_output_port(self):
        result = _parse_actions("output:1")
        assert result == [{"type": "OUTPUT", "port": "1"}]

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
        assert result[0] == {"type": "OUTPUT", "port": "1"}
        assert result[1] == {"type": "OUTPUT", "port": "2"}

    def test_already_list(self):
        inp = [{"type": "output", "port": 1}]
        result = _parse_actions(inp)
        assert result == inp

    def test_empty_string(self):
        assert _parse_actions("") == []

    def test_none(self):
        assert _parse_actions(None) == []


class TestParseMatchFromRaw:
    """Test _parse_match_from_raw helper."""

    def test_ip_match(self):
        raw = "priority=200,ip,nw_src=192.168.64.0/24 actions=NORMAL"
        result = _parse_match_from_raw(raw)
        assert result.get("ip") == "true"
        assert result.get("nw_src") == "192.168.64.0/24"

    def test_arp_match(self):
        raw = "priority=50,arp actions=FLOOD"
        result = _parse_match_from_raw(raw)
        assert result.get("arp") == "true"

    def test_no_match(self):
        raw = "some random string"
        result = _parse_match_from_raw(raw)
        assert result == {}
