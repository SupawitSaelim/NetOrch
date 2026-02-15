"""Ryu SDN Controller service - interface to Ryu REST API.

When Ryu is not available, returns mock data for development.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

MOCK_FLOWS: list[dict[str, Any]] = [
    {
        "id": "flow-001",
        "dpid": "0000000000000001",
        "table_id": 0,
        "priority": 100,
        "match": {"in_port": 1, "eth_type": 2048, "ipv4_dst": "10.0.0.0/24"},
        "actions": [{"type": "OUTPUT", "port": 2}],
        "packet_count": 1000,
        "byte_count": 102400,
        "idle_timeout": 0,
        "hard_timeout": 0,
    },
    {
        "id": "flow-002",
        "dpid": "0000000000000001",
        "table_id": 0,
        "priority": 200,
        "match": {"in_port": 2, "eth_type": 2048, "ipv4_dst": "10.0.1.0/24"},
        "actions": [{"type": "OUTPUT", "port": 1}],
        "packet_count": 850,
        "byte_count": 86400,
        "idle_timeout": 0,
        "hard_timeout": 0,
    },
    {
        "id": "flow-003",
        "dpid": "0000000000000002",
        "table_id": 0,
        "priority": 50,
        "match": {"eth_type": 2054},
        "actions": [{"type": "OUTPUT", "port": "FLOOD"}],
        "packet_count": 500,
        "byte_count": 25600,
        "idle_timeout": 0,
        "hard_timeout": 0,
    },
]

MOCK_SWITCHES = [
    {
        "dpid": "0000000000000001",
        "name": "br0",
        "connected": True,
        "controller": "tcp:127.0.0.1:6633",
        "ports": [
            {"port_no": 1, "name": "eth0", "hw_addr": "aa:bb:cc:dd:ee:01", "state": "up"},
            {"port_no": 2, "name": "eth1", "hw_addr": "aa:bb:cc:dd:ee:02", "state": "up"},
            {"port_no": 3, "name": "vxlan0", "hw_addr": "aa:bb:cc:dd:ee:03", "state": "up"},
        ],
    },
    {
        "dpid": "0000000000000002",
        "name": "br1",
        "connected": True,
        "controller": "tcp:127.0.0.1:6633",
        "ports": [
            {"port_no": 1, "name": "eth2", "hw_addr": "aa:bb:cc:dd:ee:04", "state": "up"},
            {"port_no": 2, "name": "eth3", "hw_addr": "aa:bb:cc:dd:ee:05", "state": "up"},
        ],
    },
]


class RyuService:
    """Interface to Ryu SDN Controller."""

    def __init__(self):
        self._enabled = settings.ryu_enabled
        self._base_url = settings.ryu_url

    async def get_switches(self) -> list[dict]:
        """Get all connected OpenFlow switches."""
        if not self._enabled:
            return MOCK_SWITCHES
        # TODO: Real Ryu REST API call
        return MOCK_SWITCHES

    async def get_switch(self, dpid: str) -> dict | None:
        """Get switch details."""
        switches = await self.get_switches()
        return next((s for s in switches if s["dpid"] == dpid), None)

    async def get_flows(self, dpid: str | None = None) -> list[dict]:
        """Get flow rules, optionally filtered by switch."""
        if not self._enabled:
            if dpid:
                return [f for f in MOCK_FLOWS if f["dpid"] == dpid]
            return MOCK_FLOWS
        return MOCK_FLOWS

    async def get_flow(self, flow_id: str) -> dict | None:
        """Get a single flow by ID."""
        flows = await self.get_flows()
        return next((f for f in flows if f["id"] == flow_id), None)

    async def add_flow(self, flow_data: dict) -> str:
        """Add a flow rule. Returns flow_id."""
        flow_id = f"flow-{uuid.uuid4().hex[:6]}"
        flow = {
            "id": flow_id,
            "dpid": flow_data["dpid"],
            "table_id": flow_data.get("table_id", 0),
            "priority": flow_data.get("priority", 100),
            "match": flow_data.get("match", {}),
            "actions": flow_data.get("actions", []),
            "packet_count": 0,
            "byte_count": 0,
            "idle_timeout": flow_data.get("idle_timeout", 0),
            "hard_timeout": flow_data.get("hard_timeout", 0),
        }
        MOCK_FLOWS.append(flow)
        return flow_id

    async def delete_flow(self, flow_id: str) -> bool:
        """Delete a flow rule."""
        original_len = len(MOCK_FLOWS)
        MOCK_FLOWS[:] = [f for f in MOCK_FLOWS if f["id"] != flow_id]
        return len(MOCK_FLOWS) < original_len

    async def get_flow_stats(self, flow_id: str) -> dict | None:
        """Get statistics for a specific flow."""
        flow = await self.get_flow(flow_id)
        if not flow:
            return None
        return {
            "flow_id": flow_id,
            "packet_count": flow["packet_count"],
            "byte_count": flow["byte_count"],
            "duration_sec": 3600,
            "duration_nsec": 0,
        }

    async def get_status(self) -> str:
        """Check Ryu status."""
        if not self._enabled:
            return "mock"
        return "unknown"
