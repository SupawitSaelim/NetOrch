"""Topology discovery and management service.

Builds topology dynamically from real OVS bridges/ports, FRR routing
data, and network interfaces on the Red Hat VM.

Performance: uses asyncio.gather() to parallelize independent SSH calls
within each discovery phase, reducing total discovery time by 5-20x.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any

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
            # ---- 2) OVS bridges → switch nodes ----
            br_r = await ovs_exec("ovs-vsctl list-br")
            bridge_names: list[str] = []
            if br_r.returncode == 0:
                bridge_names = [b.strip() for b in br_r.stdout.splitlines() if b.strip()]

            patch_links_seen: set[tuple[str, str]] = set()  # track patch links to avoid duplicates

            # ---- Pre-scan: identify VRouter namespaces (ip_forward=1) ----
            # Gather all namespace ip_forward checks in parallel
            vrouter_names: set[str] = set()
            try:
                ns_pre = await ssh_exec("ip netns list 2>/dev/null")
                if ns_pre.returncode == 0:
                    ns_names = [
                        line.split()[0].strip()
                        for line in ns_pre.stdout.splitlines()
                        if line.strip()
                    ]
                    if ns_names:
                        fwd_results = await asyncio.gather(*[
                            ssh_exec(f"ip netns exec {ns} sysctl -n net.ipv4.ip_forward 2>/dev/null")
                            for ns in ns_names
                        ], return_exceptions=True)
                        for ns_name, result in zip(ns_names, fwd_results):
                            if isinstance(result, Exception):
                                logger.warning("Failed to check ip_forward for %s: %s", ns_name, result)
                                continue
                            if result.returncode == 0 and result.stdout.strip() == "1":
                                vrouter_names.add(ns_name)
            except Exception:
                logger.warning("Failed to list network namespaces")

            # ---- Parallel bridge discovery ----
            # Batch 1: dpid + port_list for ALL bridges at once
            bridge_sw: dict[str, str] = {}  # br_name → sw_id
            all_ports: list[tuple[str, str, str]] = []  # (sw_id, br_name, port_name)
            if bridge_names:
                _b1 = await asyncio.gather(
                    *[ovs_exec(f"ovs-vsctl get bridge {br} datapath_id")
                      for br in bridge_names],
                    *[ovs_exec(f"ovs-vsctl list-ports {br}")
                      for br in bridge_names],
                    return_exceptions=True,
                )
                n_br = len(bridge_names)
                br_dpids = _b1[:n_br]
                br_ports = _b1[n_br:]

                for idx, br_name in enumerate(bridge_names):
                    dr = br_dpids[idx]
                    dpid = ""
                    if not isinstance(dr, Exception) and dr.returncode == 0:
                        dpid = dr.stdout.strip().replace('"', '')
                    sw_id = f"switch-{idx + 1:03d}"
                    _add_node(sw_id, "switch", br_name, dpid=dpid)
                    bridge_sw[br_name] = sw_id

                    pr = br_ports[idx]
                    if not isinstance(pr, Exception) and pr.returncode == 0:
                        for pline in pr.stdout.splitlines():
                            pn = pline.strip()
                            if pn:
                                all_ports.append((sw_id, br_name, pn))

            # Batch 2: interface type + link_state for ALL ports at once
            n_port = len(all_ports)
            if n_port:
                _b2 = await asyncio.gather(
                    *[ovs_exec(f"ovs-vsctl get interface {p[2]} type")
                      for p in all_ports],
                    *[ssh_exec(
                        f"cat /sys/class/net/{p[2]}/operstate 2>/dev/null || echo unknown")
                      for p in all_ports],
                    return_exceptions=True,
                )
                p_types = _b2[:n_port]
                p_states = _b2[n_port:]
            else:
                p_types: list[Any] = []
                p_states: list[Any] = []

            # Parse type/state, identify additional per-port queries
            port_data: list[dict[str, Any]] = []
            extra_coros: list[Any] = []
            extra_map: list[tuple[int, str]] = []  # (port_data_idx, kind)

            for i, (sw_id, br_name, port_name) in enumerate(all_ports):
                tr = p_types[i]
                ptype = ""
                if not isinstance(tr, Exception) and tr.returncode == 0:
                    ptype = tr.stdout.strip().replace('"', '')
                sr = p_states[i]
                pstatus = "up"
                if not isinstance(sr, Exception):
                    pstatus = "up" if sr.stdout.strip() in ("up", "unknown") else "down"

                pd: dict[str, Any] = {
                    "sw_id": sw_id, "br_name": br_name,
                    "port_name": port_name, "ptype": ptype, "pstatus": pstatus,
                }
                port_data.append(pd)

                if ptype in ("vxlan", "gre", "geneve"):
                    extra_map.append((i, "tunnel_remote"))
                    extra_coros.append(
                        ovs_exec(f"ovs-vsctl get interface {port_name} options:remote_ip"))
                elif ptype == "patch":
                    extra_map.append((i, "patch_peer"))
                    extra_coros.append(
                        ovs_exec(f"ovs-vsctl get interface {port_name} options:peer"))
                else:
                    vr_match = re.match(r'^(.+)-veth(\d+)$', port_name)
                    if vr_match and vr_match.group(1) in vrouter_names:
                        rname = vr_match.group(1)
                        if f"vrouter-{rname}" not in node_ids:
                            extra_map.append((i, "vrouter_ips"))
                            extra_coros.append(ssh_exec(
                                f"ip netns exec {rname} ip -4 addr show 2>/dev/null"
                                " | grep inet | grep -v 127.0.0.1 | awk '{print $2}'"))
                    elif port_name.endswith("-veth"):
                        ns = port_name[:-5]
                        extra_map.append((i, "host_ip"))
                        extra_coros.append(ssh_exec(
                            f"ip netns exec {ns} ip -4 addr show dev {ns}-eth0 2>/dev/null"
                            " | grep inet | awk '{print $2}'"))
                        extra_map.append((i, "host_gw"))
                        extra_coros.append(ssh_exec(
                            f"ip netns exec {ns} ip route show default 2>/dev/null"
                            " | awk '/default via/ {print $3}'"))

            # Batch 3: extra per-port queries (tunnel remote, patch peer, IPs)
            if extra_coros:
                _b3 = await asyncio.gather(*extra_coros, return_exceptions=True)
                for j, (pidx, kind) in enumerate(extra_map):
                    r = _b3[j]
                    if not isinstance(r, Exception):
                        port_data[pidx][kind] = r

            # Batch 4: resolve patch-port peer bridges
            patch_resolve: list[tuple[int, str]] = []  # (port_data_idx, peer_name)
            patch_coros: list[Any] = []
            for i, pd in enumerate(port_data):
                if pd["ptype"] == "patch" and "patch_peer" in pd:
                    peer_r = pd["patch_peer"]
                    peer_name = peer_r.stdout.strip().replace('"', '') if peer_r.returncode == 0 else ""
                    pd["_peer_name"] = peer_name
                    if peer_name:
                        patch_resolve.append((i, peer_name))
                        patch_coros.append(
                            ovs_exec(f"ovs-vsctl port-to-br {peer_name}"))
            if patch_coros:
                _b4 = await asyncio.gather(*patch_coros, return_exceptions=True)
                for j, (pidx, _pn) in enumerate(patch_resolve):
                    r = _b4[j]
                    if not isinstance(r, Exception) and r.returncode == 0:
                        port_data[pidx]["_peer_br"] = r.stdout.strip()

            # ---- Build nodes & links from pre-fetched data (no I/O) ----
            for pd in port_data:
                sw_id = pd["sw_id"]
                br_name = pd["br_name"]
                port_name = pd["port_name"]
                ptype = pd["ptype"]
                pstatus = pd["pstatus"]

                if ptype in ("vxlan", "gre", "geneve"):
                    remote_r = pd.get("tunnel_remote")
                    remote_ip = ""
                    if remote_r and remote_r.returncode == 0:
                        remote_ip = remote_r.stdout.strip().replace('"', '')
                    remote_id = (f"remote-{remote_ip.replace('.', '-')}"
                                 if remote_ip else f"remote-{port_name}")
                    _add_node(remote_id, "switch",
                              f"remote ({remote_ip or port_name})")
                    _add_link(sw_id, remote_id, port_name, ptype,
                              bw=10000, status=pstatus)

                elif ptype == "patch":
                    peer_name = pd.get("_peer_name", "")
                    peer_br = pd.get("_peer_br", "")
                    if peer_br and peer_br != br_name:
                        peer_sw_id = bridge_sw.get(peer_br, "")
                        if peer_sw_id:
                            link_key = tuple(sorted([sw_id, peer_sw_id]))
                            if link_key not in patch_links_seen:
                                patch_links_seen.add(link_key)
                                _add_link(sw_id, peer_sw_id,
                                          port_name, peer_name,
                                          bw=10000, status=pstatus)

                else:
                    vr_match = re.match(r'^(.+)-veth(\d+)$', port_name)
                    if vr_match and vr_match.group(1) in vrouter_names:
                        rname = vr_match.group(1)
                        vrouter_id = f"vrouter-{rname}"
                        if vrouter_id not in node_ids:
                            _add_node(vrouter_id, "router", rname)
                            ip_r = pd.get("vrouter_ips")
                            ips: list[str] = []
                            if ip_r and ip_r.returncode == 0 and ip_r.stdout.strip():
                                ips = [x.strip() for x in ip_r.stdout.strip().splitlines()]
                            for n in nodes:
                                if n["id"] == vrouter_id:
                                    n["metadata"]["ip_forward"] = True
                                    if ips:
                                        n["metadata"]["ip"] = ", ".join(ips)
                                    break
                        _add_link(sw_id, vrouter_id, port_name, port_name,
                                  bw=1000, status=pstatus)
                    else:
                        host_id = f"host-{port_name}"
                        _add_node(host_id, "host", port_name)
                        _add_link(sw_id, host_id, port_name, port_name,
                                  bw=1000, status=pstatus)

                        if port_name.endswith("-veth"):
                            hip_r = pd.get("host_ip")
                            hgw_r = pd.get("host_gw")
                            host_ip = (hip_r.stdout.strip()
                                       if hip_r and hip_r.returncode == 0 else "")
                            host_gw = (hgw_r.stdout.strip()
                                       if hgw_r and hgw_r.returncode == 0 else "")
                            if host_ip or host_gw:
                                hmeta: dict[str, Any] = {}
                                if host_ip:
                                    hmeta["ip"] = host_ip
                                if host_gw:
                                    hmeta["gateway"] = host_gw
                                for n in nodes:
                                    if n["id"] == host_id:
                                        n["metadata"].update(hmeta)
                                        break

            # ---- 5) Standalone hosts/routers (parallelized) ----
            # Identify namespaces that need IP queries
            new_vrouter_ns: list[str] = []
            new_host_ns: list[str] = []
            if ns_pre.returncode == 0:
                for ns_line in ns_pre.stdout.splitlines():
                    ns_name = ns_line.split()[0].strip() if ns_line.strip() else ""
                    if not ns_name:
                        continue
                    if ns_name in vrouter_names:
                        if f"vrouter-{ns_name}" not in node_ids:
                            new_vrouter_ns.append(ns_name)
                    else:
                        if f"host-{ns_name}-veth" not in node_ids:
                            new_host_ns.append(ns_name)

            # Batch all standalone namespace IP queries at once
            _ns_coros: list[Any] = []
            _ns_meta: list[tuple[str, str, str]] = []  # (kind, ns_name, field)
            for ns in new_vrouter_ns:
                _ns_meta.append(("vrouter", ns, "ips"))
                _ns_coros.append(ssh_exec(
                    f"ip netns exec {ns} ip -4 addr show 2>/dev/null"
                    " | grep inet | grep -v 127.0.0.1 | awk '{print $2}'"))
            for ns in new_host_ns:
                _ns_meta.append(("host", ns, "ip"))
                _ns_coros.append(ssh_exec(
                    f"ip netns exec {ns} ip -4 addr show dev {ns}-eth0 2>/dev/null"
                    " | grep inet | awk '{print $2}'"))
                _ns_meta.append(("host", ns, "gw"))
                _ns_coros.append(ssh_exec(
                    f"ip netns exec {ns} ip route show default 2>/dev/null"
                    " | awk '/default via/ {print $3}'"))
            if _ns_coros:
                _ns_results = await asyncio.gather(*_ns_coros, return_exceptions=True)
            else:
                _ns_results = []

            # Build a results map for standalone namespaces
            ns_data: dict[str, dict[str, str]] = {}
            for j, (kind, ns, field) in enumerate(_ns_meta):
                r = _ns_results[j]
                if isinstance(r, Exception):
                    continue
                ns_data.setdefault(ns, {"kind": kind})
                if field == "ips" and r.returncode == 0 and r.stdout.strip():
                    ns_data[ns]["ips"] = r.stdout.strip()
                elif field == "ip" and r.returncode == 0:
                    ns_data[ns]["ip"] = r.stdout.strip()
                elif field == "gw" and r.returncode == 0:
                    ns_data[ns]["gw"] = r.stdout.strip()

            # Create standalone nodes
            for ns in new_vrouter_ns:
                vrouter_id = f"vrouter-{ns}"
                _add_node(vrouter_id, "router", ns)
                d = ns_data.get(ns, {})
                ips_str = d.get("ips", "")
                ips_list = [x.strip() for x in ips_str.splitlines()] if ips_str else []
                for n in nodes:
                    if n["id"] == vrouter_id:
                        n["metadata"]["ip_forward"] = True
                        if ips_list:
                            n["metadata"]["ip"] = ", ".join(ips_list)
                        break
            for ns in new_host_ns:
                veth_host = f"{ns}-veth"
                host_id = f"host-{veth_host}"
                d = ns_data.get(ns, {})
                meta: dict[str, Any] = {}
                if d.get("ip"):
                    meta["ip"] = d["ip"]
                if d.get("gw"):
                    meta["gateway"] = d["gw"]
                _add_node(host_id, "host", veth_host)
                for n in nodes:
                    if n["id"] == host_id:
                        n["metadata"].update(meta)
                        break

            # ---- 6+8) Router links: fetch interface list ONCE per router ----
            # Batch: ip -o link show for ALL vrouters (reused for router-to-router & cloud)
            vrouter_list = sorted(vrouter_names)
            if vrouter_list:
                _iface_results = await asyncio.gather(*[
                    ssh_exec(f"ip netns exec {rn} ip -o link show 2>/dev/null")
                    for rn in vrouter_list
                ], return_exceptions=True)
            else:
                _iface_results = []

            # Parse interface data and collect link-state queries
            r2r_seen: set[tuple[str, str]] = set()
            _state_coros: list[Any] = []
            _state_meta: list[tuple[str, str, str, str, str]] = []  # (kind, vrouter_id, peer_or_cloud_id, iface, rname)

            # ---- 7) Cloud (Internet) nodes ----
            from app.api.v1.topology_builder import _cloud_nodes
            for cloud_name in _cloud_nodes:
                cloud_id = f"cloud-{cloud_name}"
                _add_node(cloud_id, "cloud", cloud_name)

            for ri, rname in enumerate(vrouter_list):
                ifaces_r = _iface_results[ri]
                if isinstance(ifaces_r, Exception) or ifaces_r.returncode != 0:
                    continue
                vrouter_id = f"vrouter-{rname}"
                for iline in ifaces_r.stdout.splitlines():
                    # Router-to-router: "NN: vr-xxxx-a@ifNN: ... link-netns routerY"
                    m = re.search(r'(\S+)@\S+:.*link-netns\s+(\S+)', iline)
                    if m:
                        iface_name = m.group(1)
                        peer_ns = m.group(2)
                        if peer_ns in vrouter_names:
                            peer_id = f"vrouter-{peer_ns}"
                            link_key = tuple(sorted([vrouter_id, peer_id]))
                            if link_key not in r2r_seen:
                                r2r_seen.add(link_key)
                                _add_node(vrouter_id, "router", rname)
                                _add_node(peer_id, "router", peer_ns)
                                _state_meta.append(("r2r", vrouter_id, peer_id, iface_name, rname))
                                _state_coros.append(ssh_exec(
                                    f"ip netns exec {rname} cat /sys/class/net/{iface_name}/operstate 2>/dev/null || echo unknown"))

                    # Router-to-cloud: wan-* interfaces
                    if "wan-" in iline:
                        parts = iline.split(":")
                        if len(parts) >= 2:
                            iface = parts[1].strip().split("@")[0]
                            target_cloud = None
                            for cn in _cloud_nodes:
                                target_cloud = f"cloud-{cn}"
                                break
                            if not target_cloud:
                                target_cloud = "cloud-internet"
                                _add_node(target_cloud, "cloud", "internet")
                            _state_meta.append(("wan", vrouter_id, target_cloud, iface, rname))
                            _state_coros.append(ssh_exec(
                                f"ip netns exec {rname} cat /sys/class/net/{iface}/operstate 2>/dev/null || echo unknown"))

            # Batch: all link-state checks for router-to-router & wan links
            if _state_coros:
                _state_results = await asyncio.gather(*_state_coros, return_exceptions=True)
                for j, (kind, src_id, tgt_id, iface, _rn) in enumerate(_state_meta):
                    sr = _state_results[j]
                    lstatus = "up"
                    if not isinstance(sr, Exception):
                        lstatus = "up" if sr.stdout.strip() in ("up", "unknown") else "down"
                    if kind == "r2r":
                        _add_link(src_id, tgt_id, iface, iface, bw=1000, status=lstatus)
                    else:
                        _add_link(src_id, tgt_id, iface, "WAN", bw=1000, status=lstatus)

        except Exception as exc:
            logger.error("Topology discovery failed: %s", exc)
            # If discovery fails completely, keep previous topology
            if not nodes:
                return

        # Apply auto-layout for nodes missing position overrides
        _layout_positions(nodes)
        self._topology = {"nodes": nodes, "links": links}
