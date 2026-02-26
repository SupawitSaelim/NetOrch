"""Main orchestrator service - coordinates all sub-services.

Includes time-based caching for expensive operations to reduce
redundant SSH calls, especially from WebSocket broadcast loops.
"""

import asyncio
import logging
import time
from typing import Any

from app.core.config import settings
from app.services.frr_service import FRRService
from app.services.ovs_service import OVSService
from app.services.ryu_service import RyuService
from app.services.topology_service import TopologyService

logger = logging.getLogger(__name__)


class _CachedResult:
    """Simple TTL cache for a single async result."""

    __slots__ = ("_data", "_timestamp", "_ttl", "_lock")

    def __init__(self, ttl: float):
        self._data: Any = None
        self._timestamp: float = 0.0
        self._ttl = ttl
        self._lock = asyncio.Lock()

    @property
    def is_valid(self) -> bool:
        return self._data is not None and (time.time() - self._timestamp) < self._ttl

    @property
    def data(self) -> Any:
        return self._data

    async def get_or_fetch(self, fetch_fn) -> Any:
        """Return cached result if still valid, otherwise call fetch_fn."""
        if self.is_valid:
            return self._data
        async with self._lock:
            # Double-check after acquiring lock
            if self.is_valid:
                return self._data
            self._data = await fetch_fn()
            self._timestamp = time.time()
            return self._data

    def invalidate(self) -> None:
        """Force cache invalidation."""
        self._data = None
        self._timestamp = 0.0


class Orchestrator:
    """Central orchestrator that coordinates all platform services."""

    def __init__(self):
        self.frr = FRRService()
        self.ryu = RyuService()
        self.ovs = OVSService()
        self.topology = TopologyService()
        self._start_time = time.time()
        self._request_count = 0

        # ── TTL caches (configurable via env) ──
        from app.core.config import settings
        self._stats_cache = _CachedResult(ttl=settings.cache_stats_ttl)
        self._topo_cache = _CachedResult(ttl=settings.cache_topology_ttl)
        self._health_cache = _CachedResult(ttl=settings.cache_health_ttl)

    @property
    def uptime(self) -> int:
        return int(time.time() - self._start_time)

    def increment_requests(self):
        self._request_count += 1

    @property
    def request_count(self) -> int:
        return self._request_count

    def invalidate_caches(self) -> None:
        """Force invalidation of all caches (after topology mutations, etc.)."""
        self._stats_cache.invalidate()
        self._topo_cache.invalidate()
        self._health_cache.invalidate()

    async def get_health(self) -> dict:
        """Check health of all components (cached)."""
        return await self._health_cache.get_or_fetch(self._fetch_health)

    async def _fetch_health(self) -> dict:
        """Fetch health from all services in parallel."""
        frr_status, ryu_status, ovs_status = await asyncio.gather(
            self.frr.get_status(),
            self.ryu.get_status(),
            self.ovs.get_status(),
        )
        return {
            "api": "up",
            "frr": frr_status,
            "ryu": ryu_status,
            "ovs": ovs_status,
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
        """Aggregate monitoring statistics from all services (cached)."""
        return await self._stats_cache.get_or_fetch(self._fetch_monitoring_stats)

    async def _fetch_monitoring_stats(self) -> dict:
        """Fetch stats from all services using asyncio.gather for parallelism."""
        from app.services.ssh_utils import ssh_exec

        # Run all 8 independent calls in parallel (including CPU/mem)
        routes, bgp_neighbors, ospf_neighbors, flows, switches, bridges, cpu_r, mem_r = (
            await asyncio.gather(
                self.frr.get_routing_table(),
                self.frr.get_bgp_neighbors(),
                self.frr.get_ospf_neighbors(),
                self.ryu.get_flows(),
                self.ryu.get_switches(),
                self.ovs.list_bridges(),
                ssh_exec("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
                ssh_exec("free | awk '/Mem:/{printf \"%.1f\", $3/$2*100}'"),
                return_exceptions=True,
            )
        )

        # Parse CPU/memory results (fall back to defaults on error)
        cpu_usage = 12.5
        memory_usage = 35.0
        try:
            if not isinstance(cpu_r, Exception) and cpu_r.returncode == 0 and cpu_r.stdout.strip():
                cpu_usage = float(cpu_r.stdout.strip())
            if not isinstance(mem_r, Exception) and mem_r.returncode == 0 and mem_r.stdout.strip():
                memory_usage = float(mem_r.stdout.strip())
        except (ValueError, AttributeError):
            pass
        # Ensure service results have defaults on exception
        if isinstance(routes, Exception):
            routes = []
        if isinstance(bgp_neighbors, Exception):
            bgp_neighbors = []
        if isinstance(ospf_neighbors, Exception):
            ospf_neighbors = []
        if isinstance(flows, Exception):
            flows = []
        if isinstance(switches, Exception):
            switches = []
        if isinstance(bridges, Exception):
            bridges = []

        return {
            "cpu_usage": cpu_usage,
            "memory_usage": memory_usage,
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

    async def get_topology_cached(self) -> dict:
        """Get topology with caching (for WS broadcast)."""
        return await self._topo_cache.get_or_fetch(self.topology.get_topology)

    async def shutdown(self) -> None:
        """Cleanup resources on application shutdown."""
        await self.ryu.close()


# Singleton instance
orchestrator = Orchestrator()
