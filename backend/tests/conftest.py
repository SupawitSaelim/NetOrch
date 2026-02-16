"""Fixtures shared across all tests."""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

# Force all services into mock mode for testing
os.environ["FRR_ENABLED"] = "false"
os.environ["RYU_ENABLED"] = "false"
os.environ["OVS_ENABLED"] = "false"
os.environ["DEBUG"] = "false"

from app.main import app  # noqa: E402
from app.services.ssh_utils import CmdResult  # noqa: E402

# ---------------------------------------------------------------------------
# Mock SSH responses for OVS commands used by RyuService
# ---------------------------------------------------------------------------
_MOCK_LIST_BR = "sw-test\n"
_MOCK_OFCTL_SHOW = """OFPT_FEATURES_REPLY: dpid:0000aabbccddee01
 1(eth0): addr:aa:bb:cc:dd:ee:01
     config:     0
     state:      0
 2(eth1): addr:aa:bb:cc:dd:ee:02
     config:     0
     state:      0
 LOCAL(sw-test): addr:aa:bb:cc:dd:ee:ff
     config:     PORT_DOWN
     state:      LINK_DOWN
"""
_MOCK_DUMP_FLOWS = """OFPST_FLOW reply:
 cookie=0x0, duration=100.0s, table=0, n_packets=500, n_bytes=51200, priority=100,in_port=1,ip actions=output:2
 cookie=0x0, duration=50.0s, table=0, n_packets=200, n_bytes=20480, priority=50,arp actions=FLOOD
"""
_MOCK_GET_CTRL = "tcp:127.0.0.1:6653\n"


async def _mock_ssh_exec(command: str, timeout: int = 15) -> CmdResult:
    """Return canned OVS output for test commands."""
    cmd = command.strip()
    if cmd == "ovs-vsctl list-br":
        return CmdResult(_MOCK_LIST_BR.strip(), "", 0)
    if "ovs-vsctl get bridge" in cmd and "protocols" in cmd:
        return CmdResult('[\"OpenFlow13\"]', "", 0)
    if "ovs-ofctl" in cmd and "show" in cmd:
        return CmdResult(_MOCK_OFCTL_SHOW.strip(), "", 0)
    if "ovs-ofctl" in cmd and "dump-flows" in cmd:
        return CmdResult(_MOCK_DUMP_FLOWS.strip(), "", 0)
    if "ovs-vsctl get-controller" in cmd:
        return CmdResult(_MOCK_GET_CTRL.strip(), "", 0)
    if "ovs-ofctl" in cmd and "add-flow" in cmd:
        return CmdResult("", "", 0)
    if "ovs-ofctl" in cmd and "del-flows" in cmd:
        return CmdResult("", "", 0)
    if cmd.startswith("ovs-vsctl show"):
        return CmdResult("b2dc6bcf", "", 0)
    return CmdResult("", "unknown command", 1)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    """Async HTTP client for testing FastAPI app (SSH mocked)."""
    transport = ASGITransport(app=app)
    with patch("app.services.ryu_service.ssh_exec", side_effect=_mock_ssh_exec):
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
