"""SDN Controller / Ryu service - interface to SDN REST API on the VM.

The VM runs a custom SDN REST API (sdn_rest_api.py) on port 8080 that wraps
ovs-vsctl and ovs-ofctl commands.  When disabled, returns mock data.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mock data (used when ryu_enabled=False)
# ---------------------------------------------------------------------------
MOCK_FLOWS: list[dict[str, Any]] = [
    {"id": "flow-001", "dpid": "0000000000000001", "table_id": 0, "priority": 100,
     "match": {"in_port": 1, "eth_type": 2048, "ipv4_dst": "10.0.0.0/24"},
     "actions": [{"type": "OUTPUT", "port": 2}],
     "packet_count": 1000, "byte_count": 102400, "idle_timeout": 0, "hard_timeout": 0},
    {"id": "flow-002", "dpid": "0000000000000001", "table_id": 0, "priority": 200,
     "match": {"in_port": 2, "eth_type": 2048, "ipv4_dst": "10.0.1.0/24"},
     "actions": [{"type": "OUTPUT", "port": 1}],
     "packet_count": 850, "byte_count": 86400, "idle_timeout": 0, "hard_timeout": 0},
    {"id": "flow-003", "dpid": "0000000000000002", "table_id": 0, "priority": 50,
     "match": {"eth_type": 2054},
     "actions": [{"type": "OUTPUT", "port": "FLOOD"}],
     "packet_count": 500, "byte_count": 25600, "idle_timeout": 0, "hard_timeout": 0},
]

MOCK_SWITCHES = [
    {"dpid": "0000000000000001", "name": "br0", "connected": True,
     "controller": "tcp:127.0.0.1:6633",
     "ports": [
         {"port_no": 1, "name": "eth0", "hw_addr": "aa:bb:cc:dd:ee:01", "state": "up"},
         {"port_no": 2, "name": "eth1", "hw_addr": "aa:bb:cc:dd:ee:02", "state": "up"},
         {"port_no": 3, "name": "vxlan0", "hw_addr": "aa:bb:cc:dd:ee:03", "state": "up"},
     ]},
    {"dpid": "0000000000000002", "name": "br1", "connected": True,
     "controller": "tcp:127.0.0.1:6633",
     "ports": [
         {"port_no": 1, "name": "eth2", "hw_addr": "aa:bb:cc:dd:ee:04", "state": "up"},
         {"port_no": 2, "name": "eth3", "hw_addr": "aa:bb:cc:dd:ee:05", "state": "up"},
     ]},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _normalize_flow(raw: dict, bridge: str = "br0", idx: int = 0) -> dict:
    """Convert a flow dict from the SDN REST API into our standard shape."""
    return {
        "id": raw.get("id", f"flow-{bridge}-{idx}"),
        "dpid": raw.get("dpid", bridge),
        "table_id": raw.get("table_id", raw.get("table", 0)),
        "priority": raw.get("priority", 0),
        "match": raw.get("match", {}),
        "actions": raw.get("actions", []),
        "packet_count": raw.get("packet_count", raw.get("n_packets", 0)),
        "byte_count": raw.get("byte_count", raw.get("n_bytes", 0)),
        "idle_timeout": raw.get("idle_timeout", 0),
        "hard_timeout": raw.get("hard_timeout", 0),
    }


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------
class RyuService:
    """Interface to the SDN REST API (or Ryu controller)."""

    def __init__(self) -> None:
        self._enabled = settings.ryu_enabled
        self._base_url = settings.ryu_url.rstrip("/")

    # -- helpers -----------------------------------------------------------

    async def _get(self, path: str, timeout: float = 8.0) -> Any:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(f"{self._base_url}{path}")
            resp.raise_for_status()
            return resp.json()

    async def _post(self, path: str, body: dict | None = None, timeout: float = 8.0) -> Any:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(f"{self._base_url}{path}", json=body or {})
            resp.raise_for_status()
            return resp.json()

    async def _delete(self, path: str, body: dict | None = None, timeout: float = 8.0) -> Any:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request("DELETE", f"{self._base_url}{path}", json=body)
            resp.raise_for_status()
            return resp.json()

    # -- Switches ----------------------------------------------------------

    async def get_switches(self) -> list[dict]:
        """Get all OVS bridges as 'switches'."""
        if not self._enabled:
            return MOCK_SWITCHES

        try:
            data = await self._get("/switches")
            # SDN REST API may return a list directly or {"switches": [...]}
            raw_list = data if isinstance(data, list) else data.get("switches", [])
            switches = []
            for sw in raw_list:
                switches.append({
                    "dpid": sw.get("dpid", sw.get("name", "")),
                    "name": sw.get("name", ""),
                    "connected": sw.get("connected", True),
                    "controller": sw.get("controller", ""),
                    "ports": [
                        {"port_no": i + 1, "name": p, "hw_addr": "", "state": "up"}
                        for i, p in enumerate(sw.get("ports", []))
                    ],
                })
            return switches
        except Exception as exc:
            logger.error("get_switches failed: %s", exc)
            return []

    async def get_switch(self, dpid: str) -> dict | None:
        """Get switch details by dpid or name."""
        switches = await self.get_switches()
        return next((s for s in switches if s["dpid"] == dpid or s["name"] == dpid), None)

    # -- Flows -------------------------------------------------------------

    async def get_flows(self, dpid: str | None = None) -> list[dict]:
        """Get flow rules, optionally filtered by bridge/dpid."""
        if not self._enabled:
            if dpid:
                return [f for f in MOCK_FLOWS if f["dpid"] == dpid]
            return list(MOCK_FLOWS)

        try:
            if dpid:
                data = await self._get(f"/flows/{dpid}")
                raw_flows = data.get("flows", [])
                return [_normalize_flow(f, dpid, i) for i, f in enumerate(raw_flows)]
            else:
                data = await self._get("/flows")
                # /flows returns {"bridge_name": [flows,...], ...}
                all_flows: list[dict] = []
                if isinstance(data, dict):
                    for bridge, flist in data.items():
                        if isinstance(flist, list):
                            for i, f in enumerate(flist):
                                all_flows.append(_normalize_flow(f, bridge, i))
                return all_flows
        except Exception as exc:
            logger.error("get_flows failed: %s", exc)
            return []

    async def get_flow(self, flow_id: str) -> dict | None:
        """Get a single flow by ID (searches all flows)."""
        flows = await self.get_flows()
        return next((f for f in flows if f["id"] == flow_id), None)

    async def add_flow(self, flow_data: dict) -> str:
        """Add a flow rule. Returns flow_id."""
        flow_id = f"flow-{uuid.uuid4().hex[:6]}"

        if not self._enabled:
            flow = {
                "id": flow_id,
                "dpid": flow_data["dpid"],
                "table_id": flow_data.get("table_id", 0),
                "priority": flow_data.get("priority", 100),
                "match": flow_data.get("match", {}),
                "actions": flow_data.get("actions", []),
                "packet_count": 0, "byte_count": 0,
                "idle_timeout": flow_data.get("idle_timeout", 0),
                "hard_timeout": flow_data.get("hard_timeout", 0),
            }
            MOCK_FLOWS.append(flow)
            return flow_id

        try:
            bridge = flow_data.get("dpid", "br0")
            body = {
                "priority": flow_data.get("priority", 100),
                "match": flow_data.get("match", {}),
                "actions": flow_data.get("actions", []),
            }
            await self._post(f"/flows/{bridge}", body)
            return flow_id
        except Exception as exc:
            logger.error("add_flow failed: %s", exc)
            return flow_id

    async def delete_flow(self, flow_id: str) -> bool:
        """Delete a flow rule."""
        if not self._enabled:
            orig = len(MOCK_FLOWS)
            MOCK_FLOWS[:] = [f for f in MOCK_FLOWS if f["id"] != flow_id]
            return len(MOCK_FLOWS) < orig

        # For real flows we need the bridge — try to extract from flow_id
        flow = await self.get_flow(flow_id)
        if not flow:
            return False
        try:
            bridge = flow.get("dpid", "br0")
            body = {"priority": flow.get("priority"), "match": flow.get("match", {})}
            await self._delete(f"/flows/{bridge}", body)
            return True
        except Exception as exc:
            logger.error("delete_flow failed: %s", exc)
            return False

    # -- Stats -------------------------------------------------------------

    async def get_flow_stats(self, flow_id: str) -> dict | None:
        """Get statistics for a specific flow."""
        flow = await self.get_flow(flow_id)
        if not flow:
            return None
        return {
            "flow_id": flow_id,
            "packet_count": flow.get("packet_count", 0),
            "byte_count": flow.get("byte_count", 0),
            "duration_sec": 3600,
            "duration_nsec": 0,
        }

    # -- Status ------------------------------------------------------------

    async def get_status(self) -> str:
        """Check SDN REST API health."""
        if not self._enabled:
            return "mock"
        try:
            data = await self._get("/health", timeout=5.0)
            return "up" if data.get("status") in ("ok", "running") else "degraded"
        except Exception:
            return "down"
