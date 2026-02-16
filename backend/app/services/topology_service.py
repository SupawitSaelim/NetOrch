"""Topology discovery and management service.

Builds topology dynamically from real OVS bridges/ports, FRR routing
data, and network interfaces on the Red Hat VM.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Auto-layout helper
# ---------------------------------------------------------------------------
def _layout_positions(nodes: list[dict]) -> None:
    """Assign x/y positions based on node type for SVG rendering.

    Layout: router row at top, switches in middle, networks/hosts at bottom.
    """
    by_type: dict[str, list[dict]] = {}
    for n in nodes:
        by_type.setdefault(n["type"], []).append(n)

    y_map = {"router": 50, "switch": 200, "network": 350, "host": 350}
    for ntype, group in by_type.items():
        y = y_map.get(ntype, 350)
        count = len(group)
        spacing = min(200, 500 // max(count, 1))
        start_x = max(50, 275 - (count - 1) * spacing // 2)
        for i, n in enumerate(group):
            if "x" not in n.get("metadata", {}):
                n.setdefault("metadata", {})["x"] = start_x + i * spacing
                n["metadata"]["y"] = y


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------
class TopologyService:
    """Discovers network topology from OVS and FRR on the VM."""

    def __init__(self) -> None:
        self._topology: dict[str, Any] = {"nodes": [], "links": []}
        self._position_overrides: dict[str, dict] = {}  # node_id -> {x,y}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_topology(self) -> dict:
        """Get current network topology (discovers on every call)."""
        await self._discover()
        return {
            **self._topology,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def refresh(self) -> dict:
        """Force refresh topology."""
        logger.info("Topology refresh requested")
        return await self.get_topology()

    async def update_node_position(self, node_id: str, metadata: dict) -> bool:
        """Update a node's position metadata."""
        self._position_overrides[node_id] = metadata
        for node in self._topology["nodes"]:
            if node["id"] == node_id:
                node["metadata"].update(metadata)
                return True
        return False

    # ------------------------------------------------------------------
    # Discovery engine
    # ------------------------------------------------------------------

    async def _discover(self) -> None:
        """Discover topology from the VM's OVS and FRR state."""
        from app.services.ssh_utils import ssh_exec, ovs_exec, vtysh_exec

        nodes: list[dict] = []
        links: list[dict] = []
        node_ids: set[str] = set()
        link_idx = 0

        def _add_node(nid: str, ntype: str, name: str, **extra: Any) -> None:
            if nid in node_ids:
                return
            node_ids.add(nid)
            meta = self._position_overrides.get(nid, {})
            nodes.append({"id": nid, "type": ntype, "name": name,
                          "dpid": extra.get("dpid"), "metadata": meta})

        def _add_link(src: str, tgt: str, sp: str, tp: str,
                      bw: int = 1000, status: str = "up") -> None:
            nonlocal link_idx
            link_idx += 1
            links.append({
                "id": f"link-{link_idx:03d}",
                "source": src, "target": tgt,
                "source_port": sp, "target_port": tp,
                "bandwidth": bw, "status": status,
            })

        try:
            # ---- 1) FRR router node ----
            bgp_r = await vtysh_exec("show ip bgp summary")
            router_id = ""
            local_as = ""
            if bgp_r.returncode == 0:
                m = re.search(r'BGP router identifier (\S+), local AS number (\d+)',
                              bgp_r.stdout)
                if m:
                    router_id = m.group(1)
                    local_as = m.group(2)

            hostname_r = await ssh_exec("hostname -s")
            rname = hostname_r.stdout.strip()
            if not rname or rname == "localhost":
                rname = f"frr-router"
            if router_id:
                rname += f" ({router_id})"
            _add_node("router-001", "router", rname)

            # ---- 2) OVS bridges → switch nodes ----
            br_r = await ovs_exec("ovs-vsctl list-br")
            bridge_names: list[str] = []
            if br_r.returncode == 0:
                bridge_names = [b.strip() for b in br_r.stdout.splitlines() if b.strip()]

            patch_links_seen: set[tuple[str, str]] = set()  # track patch links to avoid duplicates

            for idx, br_name in enumerate(bridge_names):
                dpid_r = await ovs_exec(f"ovs-vsctl get bridge {br_name} datapath_id")
                dpid = dpid_r.stdout.strip().replace('"', '') if dpid_r.returncode == 0 else ""
                sw_id = f"switch-{idx + 1:03d}"
                _add_node(sw_id, "switch", br_name, dpid=dpid)

                # Check bridge link state
                link_r = await ssh_exec(f"cat /sys/class/net/{br_name}/operstate 2>/dev/null || echo unknown")
                br_status = "up" if link_r.stdout.strip() in ("up", "unknown") else "down"

                # Link router→switch (bridges are on the same VM as FRR)
                _add_link("router-001", sw_id, "internal", br_name,
                          bw=10000, status=br_status)

                # ---- 3) Ports on this bridge → host / VXLAN nodes ----
                ports_r = await ovs_exec(f"ovs-vsctl list-ports {br_name}")
                if ports_r.returncode == 0:
                    for port_name in ports_r.stdout.splitlines():
                        port_name = port_name.strip()
                        if not port_name:
                            continue

                        # Determine port type
                        ptype_r = await ovs_exec(
                            f"ovs-vsctl get interface {port_name} type")
                        ptype = ptype_r.stdout.strip().replace('"', '') if ptype_r.returncode == 0 else ""

                        # Check link state
                        pstate_r = await ssh_exec(
                            f"cat /sys/class/net/{port_name}/operstate 2>/dev/null || echo unknown")
                        pstatus = "up" if pstate_r.stdout.strip() in ("up", "unknown") else "down"

                        if ptype in ("vxlan", "gre", "geneve"):
                            # Tunnel → create a remote switch placeholder
                            remote_r = await ovs_exec(
                                f"ovs-vsctl get interface {port_name} options:remote_ip")
                            remote_ip = remote_r.stdout.strip().replace('"', '') if remote_r.returncode == 0 else ""
                            remote_id = f"remote-{remote_ip.replace('.', '-')}" if remote_ip else f"remote-{port_name}"
                            _add_node(remote_id, "switch",
                                      f"remote ({remote_ip or port_name})")
                            _add_link(sw_id, remote_id, port_name, ptype,
                                      bw=10000, status=pstatus)
                        elif ptype == "patch":
                            # Patch port → switch-to-switch link
                            # Find the peer patch port to determine target bridge
                            peer_r = await ovs_exec(
                                f"ovs-vsctl get interface {port_name} options:peer")
                            peer_name = peer_r.stdout.strip().replace('"', '') if peer_r.returncode == 0 else ""
                            if peer_name:
                                # Find which bridge owns the peer port
                                peer_br_r = await ovs_exec(
                                    f"ovs-vsctl port-to-br {peer_name}")
                                peer_br = peer_br_r.stdout.strip() if peer_br_r.returncode == 0 else ""
                                if peer_br and peer_br != br_name:
                                    # Find the peer bridge's node ID
                                    peer_sw_id = ""
                                    for n in nodes:
                                        if n["type"] == "switch" and n["name"] == peer_br:
                                            peer_sw_id = n["id"]
                                            break
                                    if peer_sw_id:
                                        # Avoid duplicate link (only add from lower ID)
                                        link_key = tuple(sorted([sw_id, peer_sw_id]))
                                        if link_key not in patch_links_seen:
                                            patch_links_seen.add(link_key)
                                            _add_link(sw_id, peer_sw_id,
                                                      port_name, peer_name,
                                                      bw=10000, status=pstatus)
                        else:
                            # Regular port → host node
                            host_id = f"host-{port_name}"
                            _add_node(host_id, "host", port_name)
                            _add_link(sw_id, host_id, port_name, port_name,
                                      bw=1000, status=pstatus)

            # ---- 4) Network nodes from FRR static/connected routes ----
            route_r = await vtysh_exec("show ip route")
            if route_r.returncode == 0:
                seen_nets: set[str] = set()
                for line in route_r.stdout.splitlines():
                    # Connected and Static routes – require IP-like destination
                    m = re.match(r'^([CS])([>*\s]{0,3})\s*(\d+\.\d+\.\d+\.\d+/\d+)', line.strip())
                    if not m:
                        continue
                    proto_char, _, dest = m.groups()
                    if dest in seen_nets or dest == "0.0.0.0/0":
                        continue
                    seen_nets.add(dest)
                    net_id = f"net-{dest.replace('/', '_').replace('.', '-')}"
                    iface_m = re.search(r',\s+(\w[\w\d.]+)', line)
                    iface_name = iface_m.group(1) if iface_m else ""
                    _add_node(net_id, "network", dest)
                    status = "up"
                    _add_link("router-001", net_id, iface_name, "",
                              bw=1000, status=status)

            # ---- 5) Standalone hosts (network namespaces not yet linked) ----
            ns_r = await ssh_exec("ip netns list 2>/dev/null")
            if ns_r.returncode == 0:
                for ns_line in ns_r.stdout.splitlines():
                    # ip netns list outputs "name" or "name (id: N)"
                    ns_name = ns_line.split()[0].strip() if ns_line.strip() else ""
                    if not ns_name:
                        continue
                    veth_host = f"{ns_name}-veth"
                    host_id = f"host-{veth_host}"
                    if host_id not in node_ids:
                        # Get IP from inside the namespace
                        ip_r = await ssh_exec(
                            f"ip netns exec {ns_name} ip -4 addr show dev {ns_name}-eth0 2>/dev/null"
                            " | grep inet | awk '{print $2}'")
                        host_ip = ip_r.stdout.strip() if ip_r.returncode == 0 else ""
                        # Get default gateway
                        gw_r = await ssh_exec(
                            f"ip netns exec {ns_name} ip route show default 2>/dev/null"
                            " | awk '/default via/ {print $3}'")
                        host_gw = gw_r.stdout.strip() if gw_r.returncode == 0 else ""
                        meta: dict[str, Any] = {}
                        if host_ip:
                            meta["ip"] = host_ip
                        if host_gw:
                            meta["gateway"] = host_gw
                        # Check if veth exists on host side
                        vstate_r = await ssh_exec(
                            f"cat /sys/class/net/{veth_host}/operstate 2>/dev/null || echo down")
                        vstatus = "up" if vstate_r.stdout.strip() in ("up", "unknown") else "down"
                        _add_node(host_id, "host", veth_host)
                        # Store IP + gateway in metadata
                        for n in nodes:
                            if n["id"] == host_id:
                                n["metadata"].update(meta)
                                break

            # ---- 6) Physical uplink interface (enp0s*) ----
            iface_r = await ssh_exec("ip -br link | grep '^enp'")
            if iface_r.returncode == 0:
                for iline in iface_r.stdout.splitlines():
                    parts = iline.split()
                    if len(parts) >= 2:
                        ifname = parts[0]
                        ifstatus = "up" if parts[1] == "UP" else "down"
                        uplink_id = f"uplink-{ifname}"
                        _add_node(uplink_id, "network", f"WAN ({ifname})")
                        _add_link("router-001", uplink_id, ifname, "",
                                  bw=1000, status=ifstatus)

        except Exception as exc:
            logger.error("Topology discovery failed: %s", exc)
            # If discovery fails completely, keep previous topology
            if not nodes:
                return

        # Apply auto-layout for nodes missing position overrides
        _layout_positions(nodes)
        self._topology = {"nodes": nodes, "links": links}
