"""FRRouting service - interface to FRR daemon via SSH.

When FRR is disabled, returns mock data for macOS development.
When enabled, executes vtysh commands on the Red Hat VM via SSH.
"""

from __future__ import annotations

import copy
import logging
import re
from typing import Any

from app.core.config import settings
from app.services.ssh_utils import vtysh_exec, ssh_exec

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mock data (used when frr_enabled=False)
# ---------------------------------------------------------------------------
MOCK_ROUTES = [
    {"destination": "10.0.0.0/24", "next_hop": "192.168.1.1", "protocol": "bgp",
     "metric": 100, "interface": "eth0", "uptime": "01:30:45", "selected": True, "fib": True},
    {"destination": "10.0.1.0/24", "next_hop": "192.168.1.2", "protocol": "ospf",
     "metric": 20, "interface": "eth1", "uptime": "02:15:30", "selected": True, "fib": True},
    {"destination": "172.16.0.0/16", "next_hop": "192.168.1.1", "protocol": "static",
     "metric": 1, "interface": "eth0", "uptime": "1d00:00:00", "selected": True, "fib": True},
    {"destination": "192.168.1.0/24", "next_hop": "0.0.0.0", "protocol": "connected",
     "metric": 0, "interface": "eth0", "uptime": "5d12:30:00", "selected": True, "fib": True},
]

MOCK_BGP_NEIGHBORS: list[dict[str, Any]] = [
    {"neighbor": "10.0.0.2", "remote_as": 65002, "description": "Peer to Site B",
     "state": "Established", "uptime": "1d02h30m", "local_address": "10.0.0.1",
     "local_port": 179, "remote_port": 45678, "hold_time": 180, "keepalive": 60,
     "prefixes_received": 10, "prefixes_sent": 5},
    {"neighbor": "10.0.0.3", "remote_as": 65003, "description": "Peer to Site C",
     "state": "Established", "uptime": "0d08h15m", "local_address": "10.0.0.1",
     "local_port": 179, "remote_port": 51234, "hold_time": 180, "keepalive": 60,
     "prefixes_received": 8, "prefixes_sent": 5},
]

MOCK_OSPF_NEIGHBORS = [
    {"neighbor_id": "10.0.0.2", "priority": 1, "state": "Full/DR",
     "address": "192.168.1.2", "interface": "eth0", "dead_time": "00:00:35"},
]


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------
_PROTO_MAP = {
    "K": "kernel", "C": "connected", "L": "local", "S": "static",
    "R": "rip", "O": "ospf", "I": "isis", "B": "bgp",
}


def _parse_route_line(line: str) -> dict | None:
    """Parse one line of ``show ip route`` output."""
    # e.g.  K>* 0.0.0.0/0 [0/100] via 192.168.64.1, enp0s1, 00:06:15
    m = re.match(r'^([KCLSOIRB])([>*\s]{0,3})\s*(\S+)\s+\[(\d+)/(\d+)\]', line)
    if not m:
        return None
    proto_char, flags, dest, _admin, metric = m.groups()
    rest = line[m.end():]
    nh = re.search(r'via\s+(\S+)', rest)
    iface = re.search(r',\s+(\w[\w\d]+)', rest)
    uptime = re.search(r',\s+([\dd:hm]+)\s*$', rest)
    is_connected = "directly connected" in rest
    return {
        "destination": dest,
        "next_hop": "0.0.0.0" if is_connected else (nh.group(1).rstrip(",") if nh else "0.0.0.0"),
        "protocol": _PROTO_MAP.get(proto_char, proto_char.lower()),
        "metric": int(metric),
        "interface": iface.group(1) if iface else "",
        "uptime": uptime.group(1) if uptime else "",
        "selected": ">" in flags,
        "fib": "*" in flags,
    }


def _parse_bgp_summary(output: str) -> dict:
    """Parse ``show ip bgp summary`` text output."""
    result: dict[str, Any] = {
        "local_as": 0, "router_id": "", "total_neighbors": 0,
        "established": 0, "neighbors": [],
    }
    id_m = re.search(r'BGP router identifier (\S+), local AS number (\d+)', output)
    if id_m:
        result["router_id"] = id_m.group(1)
        result["local_as"] = int(id_m.group(2))

    in_table = False
    for line in output.splitlines():
        if re.match(r'^Neighbor\s+V\s+AS', line):
            in_table = True
            continue
        if in_table and line.strip() and not line.startswith("Total"):
            parts = line.split()
            if len(parts) >= 10:
                state_pfx = parts[9]
                is_established = state_pfx.isdigit()
                result["neighbors"].append({
                    "neighbor": parts[0],
                    "remote_as": int(parts[2]) if parts[2].isdigit() else 0,
                    "state": "Established" if is_established else state_pfx,
                    "uptime": parts[8],
                    "prefixes_received": int(state_pfx) if is_established else 0,
                    "prefixes_sent": 0,
                })
    result["total_neighbors"] = len(result["neighbors"])
    result["established"] = sum(1 for n in result["neighbors"] if n["state"] == "Established")
    return result


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------
class FRRService:
    """Interface to FRRouting daemon."""

    def __init__(self) -> None:
        self._enabled = settings.frr_enabled
        self._vtysh_path = settings.frr_vtysh_path
        self._mock_static_routes: list[dict[str, Any]] = []
        # Instance-level copies of mock data to prevent cross-request leaks
        self._mock_bgp_neighbors: list[dict[str, Any]] = copy.deepcopy(MOCK_BGP_NEIGHBORS)
        self._mock_ospf_neighbors: list[dict[str, Any]] = copy.deepcopy(MOCK_OSPF_NEIGHBORS)

    # -- Routing table -----------------------------------------------------

    async def get_routing_table(self, protocol: str | None = None) -> list[dict]:
        """Get routes from the routing table."""
        if not self._enabled:
            routes = MOCK_ROUTES + self._mock_static_routes
            if protocol:
                routes = [r for r in routes if r["protocol"] == protocol]
            return routes

        try:
            result = await vtysh_exec("show ip route")
            if result.returncode != 0:
                logger.error("vtysh show ip route failed: %s", result.stderr)
                return []
            routes: list[dict] = []
            for line in result.stdout.splitlines():
                r = _parse_route_line(line.strip())
                if r:
                    routes.append(r)
            if protocol:
                routes = [r for r in routes if r["protocol"] == protocol]
            return routes
        except Exception as exc:
            logger.error("get_routing_table error: %s", exc)
            return []

    # -- BGP ---------------------------------------------------------------

    async def get_bgp_summary(self) -> dict:
        """Get BGP summary."""
        if not self._enabled:
            neighbors = await self.get_bgp_neighbors()
            established = sum(1 for n in neighbors if n["state"] == "Established")
            return {
                "local_as": settings.frr_default_asn, "router_id": "10.0.0.1",
                "total_neighbors": len(neighbors), "established": established,
                "neighbors": [
                    {"neighbor": n["neighbor"], "remote_as": n["remote_as"],
                     "state": n["state"], "uptime": n["uptime"],
                     "prefixes_received": n["prefixes_received"],
                     "prefixes_sent": n["prefixes_sent"]}
                    for n in neighbors
                ],
            }

        try:
            result = await vtysh_exec("show ip bgp summary")
            if result.returncode != 0:
                logger.error("vtysh bgp summary failed: %s", result.stderr)
                return {"local_as": 0, "router_id": "", "total_neighbors": 0,
                        "established": 0, "neighbors": []}
            return _parse_bgp_summary(result.stdout)
        except Exception as exc:
            logger.error("get_bgp_summary error: %s", exc)
            return {"local_as": 0, "router_id": "", "total_neighbors": 0,
                    "established": 0, "neighbors": []}

    async def get_bgp_neighbors(self) -> list[dict]:
        """Get BGP neighbor details."""
        if not self._enabled:
            return copy.deepcopy(self._mock_bgp_neighbors)

        summary = await self.get_bgp_summary()
        return [
            {**n, "description": "", "local_address": "", "local_port": 179,
             "remote_port": 0, "hold_time": 180, "keepalive": 60}
            for n in summary.get("neighbors", [])
        ]

    async def add_bgp_neighbor(self, config: dict) -> bool:
        """Add BGP neighbor."""
        if not self._enabled:
            self._mock_bgp_neighbors.append({
                "neighbor": config["neighbor"], "remote_as": config["remote_as"],
                "description": config.get("description", ""), "state": "Idle",
                "uptime": "00:00:00", "local_address": "10.0.0.1", "local_port": 179,
                "remote_port": 0, "hold_time": 180, "keepalive": 60,
                "prefixes_received": 0, "prefixes_sent": 0,
            })
            return True

        try:
            cmds = (
                f'vtysh -c "configure terminal" '
                f'-c "router bgp {settings.frr_default_asn}" '
                f'-c "neighbor {config["neighbor"]} remote-as {config["remote_as"]}" '
            )
            desc = config.get("description")
            if desc:
                cmds += f'-c "neighbor {config["neighbor"]} description {desc}" '
            cmds += '-c "exit" -c "exit"'
            result = await ssh_exec(cmds)
            if result.returncode != 0:
                logger.error("add_bgp_neighbor failed: %s", result.stderr)
                return False
            return True
        except Exception as exc:
            logger.error("add_bgp_neighbor error: %s", exc)
            return False

    async def delete_bgp_neighbor(self, neighbor_ip: str) -> bool:
        """Delete BGP neighbor."""
        if not self._enabled:
            orig = len(self._mock_bgp_neighbors)
            self._mock_bgp_neighbors[:] = [n for n in self._mock_bgp_neighbors if n["neighbor"] != neighbor_ip]
            return len(self._mock_bgp_neighbors) < orig

        try:
            result = await ssh_exec(
                f'vtysh -c "configure terminal" -c "router bgp {settings.frr_default_asn}" '
                f'-c "no neighbor {neighbor_ip}" -c "exit" -c "exit"'
            )
            return result.returncode == 0
        except Exception as exc:
            logger.error("delete_bgp_neighbor error: %s", exc)
            return False

    # -- Static routes -----------------------------------------------------

    async def add_static_route(self, destination: str, next_hop: str, metric: int = 100) -> dict:
        """Add a static route."""
        route = {"destination": destination, "next_hop": next_hop, "protocol": "static",
                 "metric": metric, "interface": "", "uptime": "00:00:00",
                 "selected": True, "fib": True}

        if not self._enabled:
            self._mock_static_routes.append(route)
            return route

        try:
            await ssh_exec(
                f'vtysh -c "configure terminal" -c "ip route {destination} {next_hop}" -c "exit"'
            )
        except Exception as exc:
            logger.error("add_static_route error: %s", exc)
        return route

    async def delete_static_route(self, destination: str) -> bool:
        """Delete a static route."""
        if not self._enabled:
            orig = len(self._mock_static_routes)
            self._mock_static_routes = [r for r in self._mock_static_routes if r["destination"] != destination]
            return len(self._mock_static_routes) < orig

        try:
            result = await ssh_exec(
                f'vtysh -c "configure terminal" -c "no ip route {destination}" -c "exit"'
            )
            return result.returncode == 0
        except Exception as exc:
            logger.error("delete_static_route error: %s", exc)
            return False

    # -- OSPF --------------------------------------------------------------

    async def get_ospf_summary(self) -> dict:
        """Get OSPF summary."""
        if not self._enabled:
            return {"router_id": "10.0.0.1",
                    "areas": [{"area_id": "0.0.0.0", "type": "normal",
                               "interfaces": 2, "neighbors": len(MOCK_OSPF_NEIGHBORS)}],
                    "total_routes": 15}

        try:
            result = await vtysh_exec("show ip ospf")
            router_id = ""
            m = re.search(r'OSPF Router with ID \((\S+)\)', result.stdout)
            if m:
                router_id = m.group(1)
            areas = [{"area_id": a, "type": "normal", "interfaces": 0, "neighbors": 0}
                     for a in re.findall(r'Area ID:\s+(\S+)', result.stdout)]
            if not areas:
                areas = [{"area_id": "0.0.0.0", "type": "normal", "interfaces": 1, "neighbors": 0}]
            return {"router_id": router_id or "0.0.0.0", "areas": areas, "total_routes": 0}
        except Exception as exc:
            logger.error("get_ospf_summary error: %s", exc)
            return {"router_id": "0.0.0.0", "areas": [], "total_routes": 0}

    async def get_ospf_neighbors(self) -> list[dict]:
        """Get OSPF neighbors."""
        if not self._enabled:
            return copy.deepcopy(self._mock_ospf_neighbors)

        try:
            result = await vtysh_exec("show ip ospf neighbor")
            neighbors: list[dict] = []
            in_table = False
            for line in result.stdout.splitlines():
                if re.match(r'^Neighbor\s+ID', line):
                    in_table = True
                    continue
                if in_table and line.strip():
                    parts = line.split()
                    if len(parts) >= 5:
                        neighbors.append({
                            "neighbor_id": parts[0],
                            "priority": int(parts[1]) if parts[1].isdigit() else 0,
                            "state": parts[2],
                            "dead_time": parts[3] if len(parts) > 3 else "",
                            "address": parts[4] if len(parts) > 4 else "",
                            "interface": parts[5] if len(parts) > 5 else "",
                        })
            return neighbors
        except Exception as exc:
            logger.error("get_ospf_neighbors error: %s", exc)
            return []

    # -- Status ------------------------------------------------------------

    async def get_status(self) -> str:
        """Check FRR daemon status."""
        if not self._enabled:
            return "mock"
        try:
            result = await ssh_exec("systemctl is-active frr")
            return "up" if result.stdout.strip() == "active" else "down"
        except Exception:
            return "down"
