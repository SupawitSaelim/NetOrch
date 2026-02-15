"""Main orchestrator service - coordinates all sub-services."""

import logging
import time

from app.core.config import settings
from app.services.frr_service import FRRService
from app.services.ovs_service import OVSService
from app.services.ryu_service import RyuService
from app.services.topology_service import TopologyService

logger = logging.getLogger(__name__)


class Orchestrator:
    """Central orchestrator that coordinates all platform services."""

    def __init__(self):
        self.frr = FRRService()
        self.ryu = RyuService()
        self.ovs = OVSService()
        self.topology = TopologyService()
        self._start_time = time.time()
        self._request_count = 0

    @property
    def uptime(self) -> int:
        return int(time.time() - self._start_time)

    def increment_requests(self):
        self._request_count += 1

    @property
    def request_count(self) -> int:
        return self._request_count

    async def get_health(self) -> dict:
        """Check health of all components."""
        return {
            "api": "up",
            "frr": await self.frr.get_status(),
            "ryu": await self.ryu.get_status(),
            "ovs": await self.ovs.get_status(),
        }

    async def get_system_info(self) -> dict:
        """Get system information."""
        import socket

        return {
            "version": "0.1.0",
            "mode": settings.system_mode,
            "uptime": self.uptime,
            "hostname": socket.gethostname(),
        }

    async def get_monitoring_stats(self) -> dict:
        """Aggregate monitoring statistics from all services."""
        routes = await self.frr.get_routing_table()
        bgp_neighbors = await self.frr.get_bgp_neighbors()
        ospf_neighbors = await self.frr.get_ospf_neighbors()
        flows = await self.ryu.get_flows()
        switches = await self.ryu.get_switches()
        bridges = await self.ovs.list_bridges()

        return {
            "cpu_usage": 12.5,  # Mock
            "memory_usage": 35.0,  # Mock
            "uptime": self.uptime,
            "api_requests_total": self._request_count,
            "components": {
                "frr": {
                    "bgp_neighbors": len(bgp_neighbors),
                    "ospf_neighbors": len(ospf_neighbors),
                    "total_routes": len(routes),
                },
                "ovs": {
                    "bridges": len(bridges),
                    "flows": len(flows),
                },
                "ryu": {
                    "switches": len(switches),
                    "controllers": 1,
                },
            },
        }


# Singleton instance
orchestrator = Orchestrator()
