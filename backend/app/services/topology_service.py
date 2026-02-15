"""Topology discovery and management service."""

import logging
from datetime import datetime, timezone

from app.core.config import settings

logger = logging.getLogger(__name__)

MOCK_TOPOLOGY = {
    "nodes": [
        {
            "id": "switch-001",
            "type": "switch",
            "name": "br0",
            "dpid": "0000000000000001",
            "metadata": {"x": 100, "y": 200},
        },
        {
            "id": "switch-002",
            "type": "switch",
            "name": "br1",
            "dpid": "0000000000000002",
            "metadata": {"x": 400, "y": 200},
        },
        {
            "id": "router-001",
            "type": "router",
            "name": "frr-router",
            "dpid": None,
            "metadata": {"x": 250, "y": 50},
        },
        {
            "id": "host-001",
            "type": "host",
            "name": "host1",
            "dpid": None,
            "metadata": {"x": 50, "y": 350},
        },
        {
            "id": "host-002",
            "type": "host",
            "name": "host2",
            "dpid": None,
            "metadata": {"x": 450, "y": 350},
        },
    ],
    "links": [
        {
            "id": "link-001",
            "source": "router-001",
            "target": "switch-001",
            "source_port": "eth0",
            "target_port": "eth0",
            "bandwidth": 1000,
            "status": "up",
        },
        {
            "id": "link-002",
            "source": "router-001",
            "target": "switch-002",
            "source_port": "eth1",
            "target_port": "eth2",
            "bandwidth": 1000,
            "status": "up",
        },
        {
            "id": "link-003",
            "source": "switch-001",
            "target": "switch-002",
            "source_port": "vxlan0",
            "target_port": "vxlan0",
            "bandwidth": 10000,
            "status": "up",
        },
        {
            "id": "link-004",
            "source": "switch-001",
            "target": "host-001",
            "source_port": "eth1",
            "target_port": "eth0",
            "bandwidth": 1000,
            "status": "up",
        },
        {
            "id": "link-005",
            "source": "switch-002",
            "target": "host-002",
            "source_port": "eth3",
            "target_port": "eth0",
            "bandwidth": 1000,
            "status": "up",
        },
    ],
}


class TopologyService:
    """Manages network topology discovery and state."""

    def __init__(self):
        self._topology = MOCK_TOPOLOGY.copy()

    async def get_topology(self) -> dict:
        """Get current network topology."""
        return {
            **self._topology,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def refresh(self) -> dict:
        """Refresh topology from live sources."""
        logger.info("[Mock] Topology refresh requested")
        return await self.get_topology()

    async def update_node_position(self, node_id: str, metadata: dict) -> bool:
        """Update a node's position metadata."""
        for node in self._topology["nodes"]:
            if node["id"] == node_id:
                node["metadata"].update(metadata)
                return True
        return False
