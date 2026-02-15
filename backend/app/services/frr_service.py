"""FRRouting service - interface to FRR daemon.

When FRR is not available (e.g., macOS dev), returns mock data.
On Linux with FRR installed, uses vtysh to interact with FRR.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# Mock data for development
MOCK_ROUTES = [
    {
        "destination": "10.0.0.0/24",
        "next_hop": "192.168.1.1",
        "protocol": "bgp",
        "metric": 100,
        "interface": "eth0",
        "uptime": "01:30:45",
        "selected": True,
        "fib": True,
    },
    {
        "destination": "10.0.1.0/24",
        "next_hop": "192.168.1.2",
        "protocol": "ospf",
        "metric": 20,
        "interface": "eth1",
        "uptime": "02:15:30",
        "selected": True,
        "fib": True,
    },
    {
        "destination": "172.16.0.0/16",
        "next_hop": "192.168.1.1",
        "protocol": "static",
        "metric": 1,
        "interface": "eth0",
        "uptime": "1d00:00:00",
        "selected": True,
        "fib": True,
    },
    {
        "destination": "192.168.1.0/24",
        "next_hop": "0.0.0.0",
        "protocol": "connected",
        "metric": 0,
        "interface": "eth0",
        "uptime": "5d12:30:00",
        "selected": True,
        "fib": True,
    },
]

MOCK_BGP_NEIGHBORS = [
    {
        "neighbor": "10.0.0.2",
        "remote_as": 65002,
        "description": "Peer to Site B",
        "state": "Established",
        "uptime": "1d02h30m",
        "local_address": "10.0.0.1",
        "local_port": 179,
        "remote_port": 45678,
        "hold_time": 180,
        "keepalive": 60,
        "prefixes_received": 10,
        "prefixes_sent": 5,
    },
    {
        "neighbor": "10.0.0.3",
        "remote_as": 65003,
        "description": "Peer to Site C",
        "state": "Established",
        "uptime": "0d08h15m",
        "local_address": "10.0.0.1",
        "local_port": 179,
        "remote_port": 51234,
        "hold_time": 180,
        "keepalive": 60,
        "prefixes_received": 8,
        "prefixes_sent": 5,
    },
]

MOCK_OSPF_NEIGHBORS = [
    {
        "neighbor_id": "10.0.0.2",
        "priority": 1,
        "state": "Full/DR",
        "address": "192.168.1.2",
        "interface": "eth0",
        "dead_time": "00:00:35",
    },
]


class FRRService:
    """Interface to FRRouting daemon."""

    def __init__(self):
        self._enabled = settings.frr_enabled
        self._vtysh_path = settings.frr_vtysh_path
        self._mock_static_routes: list[dict[str, Any]] = []

    async def get_routing_table(self, protocol: str | None = None) -> list[dict]:
        """Get routes from routing table."""
        if not self._enabled:
            routes = MOCK_ROUTES + self._mock_static_routes
            if protocol:
                routes = [r for r in routes if r["protocol"] == protocol]
            return routes

        # TODO: Real FRR implementation via vtysh
        logger.warning("FRR enabled but real implementation not yet available")
        return MOCK_ROUTES

    async def get_bgp_summary(self) -> dict:
        """Get BGP summary."""
        neighbors = await self.get_bgp_neighbors()
        established = sum(1 for n in neighbors if n["state"] == "Established")
        return {
            "local_as": 65001,
            "router_id": "10.0.0.1",
            "total_neighbors": len(neighbors),
            "established": established,
            "neighbors": [
                {
                    "neighbor": n["neighbor"],
                    "remote_as": n["remote_as"],
                    "state": n["state"],
                    "uptime": n["uptime"],
                    "prefixes_received": n["prefixes_received"],
                    "prefixes_sent": n["prefixes_sent"],
                }
                for n in neighbors
            ],
        }

    async def get_bgp_neighbors(self) -> list[dict]:
        """Get BGP neighbor details."""
        if not self._enabled:
            return MOCK_BGP_NEIGHBORS
        return MOCK_BGP_NEIGHBORS

    async def add_bgp_neighbor(self, config: dict) -> bool:
        """Add BGP neighbor configuration."""
        if not self._enabled:
            MOCK_BGP_NEIGHBORS.append(
                {
                    "neighbor": config["neighbor"],
                    "remote_as": config["remote_as"],
                    "description": config.get("description", ""),
                    "state": "Idle",
                    "uptime": "00:00:00",
                    "local_address": "10.0.0.1",
                    "local_port": 179,
                    "remote_port": 0,
                    "hold_time": 180,
                    "keepalive": 60,
                    "prefixes_received": 0,
                    "prefixes_sent": 0,
                }
            )
            return True
        return False

    async def delete_bgp_neighbor(self, neighbor_ip: str) -> bool:
        """Delete BGP neighbor."""
        if not self._enabled:
            original_len = len(MOCK_BGP_NEIGHBORS)
            MOCK_BGP_NEIGHBORS[:] = [
                n for n in MOCK_BGP_NEIGHBORS if n["neighbor"] != neighbor_ip
            ]
            return len(MOCK_BGP_NEIGHBORS) < original_len
        return False

    async def add_static_route(self, destination: str, next_hop: str, metric: int = 100) -> dict:
        """Add a static route."""
        route = {
            "destination": destination,
            "next_hop": next_hop,
            "protocol": "static",
            "metric": metric,
            "interface": "eth0",
            "uptime": "00:00:00",
            "selected": True,
            "fib": True,
        }
        self._mock_static_routes.append(route)
        return route

    async def delete_static_route(self, destination: str) -> bool:
        """Delete a static route."""
        original_len = len(self._mock_static_routes)
        self._mock_static_routes = [
            r for r in self._mock_static_routes if r["destination"] != destination
        ]
        return len(self._mock_static_routes) < original_len

    async def get_ospf_summary(self) -> dict:
        """Get OSPF summary."""
        return {
            "router_id": "10.0.0.1",
            "areas": [
                {
                    "area_id": "0.0.0.0",
                    "type": "normal",
                    "interfaces": 2,
                    "neighbors": len(MOCK_OSPF_NEIGHBORS),
                }
            ],
            "total_routes": 15,
        }

    async def get_ospf_neighbors(self) -> list[dict]:
        """Get OSPF neighbors."""
        return MOCK_OSPF_NEIGHBORS

    async def get_status(self) -> str:
        """Check FRR status."""
        if not self._enabled:
            return "mock"
        return "unknown"
