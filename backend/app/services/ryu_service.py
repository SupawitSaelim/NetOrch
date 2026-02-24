"""SDN Flow management service — manages OVS flows via SSH.

Connects to the Red Hat VM over SSH to run ovs-vsctl / ovs-ofctl commands
directly, giving full integration with the Topology Builder's switches.
When ``ryu_enabled=True`` it can optionally proxy through a REST API.

Historical note: originally named RyuService after the Ryu SDN controller.
Renamed to SDNFlowService to reflect that SSH-based ovs-ofctl is the primary path.
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

import httpx

from app.core.config import settings
from app.services.ssh_utils import ssh_exec

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers — parse ovs-ofctl output
# ---------------------------------------------------------------------------

def _parse_actions_str(actions_str: str) -> list[dict]:
    """Parse an OVS actions string like ``output:2,FLOOD`` into structured list."""
    result: list[dict] = []
    for part in actions_str.split(","):
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            atype, val = part.split(":", 1)
            # Try to convert port number
            try:
                val_out: Any = int(val)
            except ValueError:
                val_out = val
            result.append({"type": atype.upper(), "port": val_out})
        elif part:
            result.append({"type": part.upper(), "port": ""})
    return result


def _parse_actions(actions_raw: Any) -> list[dict]:
    """Convert actions (string or list) into a list of {type, port} dicts."""
    if isinstance(actions_raw, list):
        return actions_raw
    if isinstance(actions_raw, str):
        return _parse_actions_str(actions_raw)
    return []


def _flow_id_from_parts(bridge: str, priority: int, match: dict) -> str:
    """Deterministic flow ID from bridge + priority + match fields."""
    key = f"{bridge}|{priority}|{sorted(match.items())}"
    h = hashlib.md5(key.encode()).hexdigest()[:8]
    return f"flow-{bridge}-{h}"


def _parse_dump_flows(output: str, bridge: str) -> list[dict]:
    """Parse ``ovs-ofctl dump-flows`` output into structured flow dicts."""
    flows: list[dict] = []
    for line in output.splitlines():
        line = line.strip()
        # Skip header / empty
        if not line or line.startswith("NXST_FLOW") or line.startswith("OFPST_FLOW"):
            continue

        # Extract priority
        pri_m = re.search(r'priority=(\d+)', line)
        priority = int(pri_m.group(1)) if pri_m else 0

        # Extract table
        tbl_m = re.search(r'table=(\d+)', line)
        table_id = int(tbl_m.group(1)) if tbl_m else 0

        # Extract match fields (between priority=N,... and actions=...)
        match: dict[str, Any] = {}
        m = re.search(r'priority=\d+[,\s]*(.*?)\s*actions=', line)
        if m:
            fields = m.group(1)
            for field in fields.split(","):
                field = field.strip()
                if not field:
                    continue
                if "=" in field:
                    k, v = field.split("=", 1)
                    k = k.strip()
                    v = v.strip()
                    # Convert numeric values
                    try:
                        match[k] = int(v)
                    except ValueError:
                        match[k] = v
                else:
                    # Shorthand like "ip", "arp", "tcp" etc.
                    match[field] = True

        # Extract actions
        act_m = re.search(r'actions=(.*)', line)
        actions = _parse_actions_str(act_m.group(1)) if act_m else []

        # Extract counters
        npkt_m = re.search(r'n_packets=(\d+)', line)
        nbyte_m = re.search(r'n_bytes=(\d+)', line)
        idle_m = re.search(r'idle_timeout=(\d+)', line)
        hard_m = re.search(r'hard_timeout=(\d+)', line)

        flow_id = _flow_id_from_parts(bridge, priority, match)
        flows.append({
            "id": flow_id,
            "dpid": bridge,
            "table_id": table_id,
            "priority": priority,
            "match": match,
            "actions": actions,
            "packet_count": int(npkt_m.group(1)) if npkt_m else 0,
            "byte_count": int(nbyte_m.group(1)) if nbyte_m else 0,
            "idle_timeout": int(idle_m.group(1)) if idle_m else 0,
            "hard_timeout": int(hard_m.group(1)) if hard_m else 0,
        })
    return flows


def _parse_ofctl_show(output: str) -> tuple[str, list[dict]]:
    """Parse ``ovs-ofctl show <bridge>`` to extract dpid & ports."""
    dpid = ""
    dp_m = re.search(r'dpid:([0-9a-fA-F]+)', output)
    if dp_m:
        dpid = dp_m.group(1)

    ports: list[dict] = []
    # Lines like:  1(pc1-veth): addr:...
    for pm in re.finditer(r'(\d+)\(([^)]+)\):\s*addr:([0-9a-f:]+)', output):
        ports.append({
            "port_no": int(pm.group(1)),
            "name": pm.group(2),
            "hw_addr": pm.group(3),
            "state": "up",
        })
    return dpid, ports


def _match_dict_to_ofctl(match: dict) -> str:
    """Convert match dict to ovs-ofctl match string."""
    parts: list[str] = []
    for k, v in match.items():
        if isinstance(v, bool) and v:
            parts.append(str(k))
        else:
            parts.append(f"{k}={v}")
    return ",".join(parts)


def _actions_list_to_ofctl(actions: list[dict]) -> str:
    """Convert actions list to ovs-ofctl actions string."""
    parts: list[str] = []
    for a in actions:
        atype = str(a.get("type", "")).upper()
        port = a.get("port", "")
        if atype == "OUTPUT" and port != "":
            parts.append(f"output:{port}")
        elif atype == "DROP":
            parts.append("drop")
        elif atype == "FLOOD":
            parts.append("flood")
        elif atype == "NORMAL":
            parts.append("normal")
        elif atype == "CONTROLLER":
            parts.append(f"controller:{port}" if port else "controller")
        elif port != "":
            parts.append(f"{atype.lower()}:{port}")
        else:
            parts.append(atype.lower())
    return ",".join(parts) if parts else "drop"


# ---------------------------------------------------------------------------
# Helpers — REST API (used when ryu_enabled=True)
# ---------------------------------------------------------------------------

def _normalize_flow(raw: dict, bridge: str = "br0", idx: int = 0) -> dict:
    """Convert a flow dict from the SDN REST API into our standard shape."""
    match = raw.get("match", {})
    if not match and "raw" in raw:
        m = re.search(r'priority=\d+[,\s]*(.*?)\s*actions=', raw["raw"])
        if m:
            for field in m.group(1).split(","):
                field = field.strip()
                if "=" in field:
                    k, v = field.split("=", 1)
                    match[k.strip()] = v.strip()
                elif field:
                    match[field] = "true"

    table_id = raw.get("table_id", raw.get("table", 0))
    if table_id == 0 and "raw" in raw:
        tm = re.search(r'table=(\d+)', raw["raw"])
        if tm:
            table_id = int(tm.group(1))

    return {
        "id": raw.get("id", f"flow-{bridge}-{idx}"),
        "dpid": raw.get("dpid", bridge),
        "table_id": table_id,
        "priority": raw.get("priority", 0),
        "match": match,
        "actions": _parse_actions(raw.get("actions", [])),
        "packet_count": raw.get("packet_count", raw.get("n_packets", 0)),
        "byte_count": raw.get("byte_count", raw.get("n_bytes", 0)),
        "idle_timeout": raw.get("idle_timeout", 0),
        "hard_timeout": raw.get("hard_timeout", 0),
    }


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------
class SDNFlowService:
    """SDN Flow management — interface to OVS on the VM (SSH + optional REST)."""

    def __init__(self) -> None:
        self._enabled = settings.ryu_enabled  # True = use REST API
        self._base_url = settings.ryu_url.rstrip("/")
        # Shared HTTP client for connection reuse (keep-alive)
        self._http: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create a shared httpx.AsyncClient for connection reuse."""
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=8.0,
            )
        return self._http

    # -- REST helpers (when ryu_enabled=True) ------------------------------

    async def _get(self, path: str, timeout: float = 8.0) -> Any:
        client = self._get_client()
        resp = await client.get(path, timeout=timeout)
        resp.raise_for_status()
        return resp.json()

    async def _post(self, path: str, body: dict | None = None, timeout: float = 8.0) -> Any:
        client = self._get_client()
        resp = await client.post(path, json=body or {}, timeout=timeout)
        resp.raise_for_status()
        return resp.json()

    async def _delete(self, path: str, body: dict | None = None, timeout: float = 8.0) -> Any:
        client = self._get_client()
        resp = await client.request("DELETE", path, json=body, timeout=timeout)
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        """Close the shared HTTP client on shutdown."""
        if self._http and not self._http.is_closed:
            await self._http.aclose()
            self._http = None

    # ======================================================================
    # SSH-based OVS operations (primary path)
    # ======================================================================

    # Cache bridge→OpenFlow protocol to avoid repeated lookups
    _bridge_proto: dict[str, str] = {}

    async def _ofctl(self, subcmd: str, bridge: str, args: str = "") -> 'CmdResult':
        """Run ovs-ofctl with the correct OpenFlow version for the bridge."""
        proto = await self._get_bridge_proto(bridge)
        of_flag = f"-O {proto}" if proto else ""
        cmd = f"ovs-ofctl {of_flag} {subcmd} {bridge} {args}".strip()
        return await ssh_exec(cmd)

    async def _get_bridge_proto(self, bridge: str) -> str:
        """Detect the OpenFlow protocol version configured on a bridge."""
        if bridge in self._bridge_proto:
            return self._bridge_proto[bridge]
        r = await ssh_exec(f"ovs-vsctl get bridge {bridge} protocols 2>/dev/null")
        proto = "OpenFlow13"  # safe default
        if r.returncode == 0 and r.stdout.strip():
            raw = r.stdout.strip().strip('[]').strip('"')
            # e.g. ["OpenFlow13"] or OpenFlow13
            if raw:
                # Take highest version
                proto = raw.split(',')[-1].strip().strip('"')
        self._bridge_proto[bridge] = proto
        return proto

    async def _ssh_list_bridges(self) -> list[str]:
        """List all OVS bridges on the VM."""
        r = await ssh_exec("ovs-vsctl list-br")
        if r.returncode != 0 or not r.stdout:
            return []
        return [b.strip() for b in r.stdout.splitlines() if b.strip()]

    async def _ssh_get_switch(self, bridge: str) -> dict:
        """Get switch info for one bridge via SSH."""
        # Get ports + DPID (with correct OF version)
        show_r = await self._ofctl("show", bridge)
        _hex_dpid, ports = _parse_ofctl_show(show_r.stdout) if show_r.returncode == 0 else ("", [])

        # Get controller
        ctrl_r = await ssh_exec(f"ovs-vsctl get-controller {bridge}")
        controller = ctrl_r.stdout.strip() if ctrl_r.returncode == 0 else ""

        # Use bridge name as dpid so ovs-ofctl commands work directly
        return {
            "dpid": bridge,
            "name": bridge,
            "connected": True,
            "controller": controller,
            "ports": ports,
        }

    # -- Switches ----------------------------------------------------------

    async def get_switches(self) -> list[dict]:
        """Get all OVS bridges as 'switches'."""
        if self._enabled:
            try:
                data = await self._get("/switches")
                raw_list = data if isinstance(data, list) else data.get("switches", [])
                switches = []
                for sw in raw_list:
                    name = sw.get("name", "")
                    switches.append({
                        "dpid": name,  # Always use bridge name as dpid
                        "name": name,
                        "connected": sw.get("connected", True),
                        "controller": sw.get("controller", ""),
                        "ports": [
                            {"port_no": i + 1, "name": p, "hw_addr": "", "state": "up"}
                            for i, p in enumerate(sw.get("ports", []))
                        ],
                    })
                return switches
            except Exception as exc:
                logger.warning("REST get_switches failed, falling back to SSH: %s", exc)

        # SSH fallback (or primary when ryu_enabled=False)
        try:
            bridges = await self._ssh_list_bridges()
            switches = []
            for br in bridges:
                sw = await self._ssh_get_switch(br)
                switches.append(sw)
            return switches
        except Exception as exc:
            logger.error("get_switches (SSH) failed: %s", exc)
            return []

    async def get_switch(self, dpid: str) -> dict | None:
        """Get switch details by dpid or name."""
        switches = await self.get_switches()
        return next((s for s in switches if s["dpid"] == dpid or s["name"] == dpid), None)

    # -- Flows -------------------------------------------------------------

    async def get_flows(self, dpid: str | None = None) -> list[dict]:
        """Get flow rules, optionally filtered by bridge/dpid."""
        if self._enabled:
            try:
                if dpid:
                    data = await self._get(f"/flows/{dpid}")
                    raw_flows = data.get("flows", [])
                    return [_normalize_flow(f, dpid, i) for i, f in enumerate(raw_flows)]
                else:
                    data = await self._get("/flows")
                    all_flows: list[dict] = []
                    if isinstance(data, dict):
                        for bridge, flist in data.items():
                            if isinstance(flist, list):
                                for i, f in enumerate(flist):
                                    all_flows.append(_normalize_flow(f, bridge, i))
                    return all_flows
            except Exception as exc:
                logger.warning("REST get_flows failed, falling back to SSH: %s", exc)

        # SSH fallback
        try:
            if dpid:
                r = await self._ofctl("dump-flows", dpid)
                if r.returncode != 0:
                    logger.error("ovs-ofctl dump-flows %s failed: %s", dpid, r.stderr)
                    return []
                return _parse_dump_flows(r.stdout, dpid)
            else:
                bridges = await self._ssh_list_bridges()
                all_flows_ssh: list[dict] = []
                for br in bridges:
                    r = await self._ofctl("dump-flows", br)
                    if r.returncode == 0:
                        all_flows_ssh.extend(_parse_dump_flows(r.stdout, br))
                return all_flows_ssh
        except Exception as exc:
            logger.error("get_flows (SSH) failed: %s", exc)
            return []

    async def get_flow(self, flow_id: str) -> dict | None:
        """Get a single flow by ID (searches all flows)."""
        flows = await self.get_flows()
        return next((f for f in flows if f["id"] == flow_id), None)

    async def add_flow(self, flow_data: dict) -> str:
        """Add a flow rule. Returns flow_id."""
        bridge = flow_data.get("dpid", "br0")
        priority = flow_data.get("priority", 100)
        match = flow_data.get("match", {})
        actions = flow_data.get("actions", [])

        flow_id = _flow_id_from_parts(bridge, priority, match)

        if self._enabled:
            try:
                body = {"priority": priority, "match": match, "actions": actions}
                await self._post(f"/flows/{bridge}", body)
                return flow_id
            except Exception as exc:
                logger.warning("REST add_flow failed, falling back to SSH: %s", exc)

        # SSH: ovs-ofctl add-flow bridge "priority=N,match,actions=..."
        try:
            match_str = _match_dict_to_ofctl(match)
            actions_str = _actions_list_to_ofctl(actions)
            flow_spec = f"priority={priority}"
            if match_str:
                flow_spec += f",{match_str}"
            flow_spec += f",actions={actions_str}"

            r = await self._ofctl("add-flow", bridge, f'"{flow_spec}"')
            if r.returncode != 0:
                logger.error("ovs-ofctl add-flow failed: %s", r.stderr)
                raise RuntimeError(r.stderr)
            return flow_id
        except Exception as exc:
            logger.error("add_flow (SSH) failed: %s", exc)
            raise

    async def delete_flow(self, flow_id: str) -> bool:
        """Delete a flow rule by its ID."""
        # Look up flow to get bridge + match
        flow = await self.get_flow(flow_id)
        if not flow:
            return False

        bridge = flow.get("dpid", "br0")
        priority = flow.get("priority", 0)
        match = flow.get("match", {})

        if self._enabled:
            try:
                body = {"priority": priority, "match": match}
                await self._delete(f"/flows/{bridge}", body)
                return True
            except Exception as exc:
                logger.warning("REST delete_flow failed, falling back to SSH: %s", exc)

        # SSH: ovs-ofctl del-flows --strict bridge "priority=N,match"
        try:
            match_str = _match_dict_to_ofctl(match)
            flow_spec = f"priority={priority}"
            if match_str:
                flow_spec += f",{match_str}"

            r = await self._ofctl("del-flows --strict", bridge, f'"{flow_spec}"')
            if r.returncode != 0:
                logger.error("ovs-ofctl del-flows failed: %s", r.stderr)
                return False
            return True
        except Exception as exc:
            logger.error("delete_flow (SSH) failed: %s", exc)
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
            "duration_sec": 0,
            "duration_nsec": 0,
        }

    # -- Status ------------------------------------------------------------

    async def get_status(self) -> str:
        """Check OVS connectivity."""
        if self._enabled:
            try:
                data = await self._get("/health", timeout=5.0)
                return "up" if data.get("status") in ("ok", "running") else "degraded"
            except Exception:
                pass
        # SSH health check
        try:
            r = await ssh_exec("ovs-vsctl show | head -1", timeout=5)
            return "up" if r.returncode == 0 and r.stdout else "down"
        except Exception:
            return "down"


# Backward-compatible alias (legacy name)
RyuService = SDNFlowService
