"""Topology Builder endpoints — EVE-NG style node & link CRUD.

Create / delete switches (OVS bridges), hosts (veth pairs), and
links between them — all executed live on the VM via SSH.
"""

from __future__ import annotations

import logging
import random
import re as _re
import string
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_orchestrator
from app.services.orchestrator import Orchestrator
from app.services.ssh_utils import ssh_exec, ovs_exec

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/topology/builder", tags=["Topology Builder"])


# ── Schemas ──────────────────────────────────────────────────────

class CreateSwitchRequest(BaseModel):
    name: str
    x: float | None = None
    y: float | None = None
    protocols: str = "OpenFlow13"
    controller: str | None = None
    fail_mode: str | None = None  # "secure" or "standalone"


class CreateHostRequest(BaseModel):
    name: str
    ip: str | None = None  # e.g. "10.10.1.2/24"
    x: float | None = None
    y: float | None = None
    gateway: str | None = None


class CreateRouterRequest(BaseModel):
    name: str
    x: float | None = None
    y: float | None = None


class CreateCloudRequest(BaseModel):
    name: str
    x: float | None = None
    y: float | None = None


class CreateLinkRequest(BaseModel):
    source_id: str  # topology node id (e.g. "switch-001")
    target_id: str  # topology node id
    source_name: str  # actual OVS bridge / host name
    target_name: str
    ip: str | None = None  # IP for source router interface (e.g. "10.0.0.1/24")
    target_ip: str | None = None  # IP for target router interface (router↔router)


class NodePositionBatch(BaseModel):
    positions: dict[str, dict[str, float]]  # node_id -> {x, y}


# ── Helpers ──────────────────────────────────────────────────────

def _rand_suffix(n: int = 4) -> str:
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=n))


async def _resolve_bridge_name(node_id: str, orch: Orchestrator) -> str | None:
    """Given a topology node ID, find its actual bridge name on the VM."""
    topo = await orch.topology.get_topology()
    for n in topo["nodes"]:
        if n["id"] == node_id and n["type"] == "switch":
            return n["name"]
    return None


async def _resolve_host_name(node_id: str, orch: Orchestrator) -> str | None:
    """Given a topology node ID, find its host netns name."""
    topo = await orch.topology.get_topology()
    for n in topo["nodes"]:
        if n["id"] == node_id and n["type"] == "host":
            return n["name"]
    return None


async def _host_exists(name: str) -> bool:
    """Check if a host network namespace exists."""
    r = await ssh_exec(f"ip netns list | grep -w {name}")
    return r.returncode == 0 and name in r.stdout


_FRR_BIN = "/usr/libexec/frr"  # FRR binary dir on RHEL
_FRR_DAEMONS = ["zebra", "staticd", "bgpd", "ospfd"]


async def _start_frr_in_netns(name: str) -> str:
    """Start FRR daemons (zebra, staticd, bgpd, ospfd) inside a netns."""
    conf_dir = f"/etc/frr/{name}"
    run_dir = f"/var/run/frr/{name}"

    # Create dirs
    await ssh_exec(f"mkdir -p {conf_dir} {run_dir}")

    # Write integrated config
    frr_conf = (
        f"frr defaults traditional\n"
        f"hostname {name}\n"
        f"log syslog informational\n"
        f"!\n"
    )
    await ssh_exec(f"cat > {conf_dir}/frr.conf << 'FRREOF'\n{frr_conf}FRREOF")

    # Write vtysh.conf
    await ssh_exec(f"cat > {conf_dir}/vtysh.conf << 'FRREOF'\nhostname {name}\nFRREOF")

    # Start each daemon in the netns
    started = []
    for daemon in _FRR_DAEMONS:
        r = await ssh_exec(
            f"ip netns exec {name} {_FRR_BIN}/{daemon} -d -N {name} -A 127.0.0.1 2>&1"
        )
        if r.returncode == 0:
            started.append(daemon)
        else:
            logger.warning("Failed to start %s in %s: %s", daemon, name, r.stderr or r.stdout)

    logger.info("Started FRR in netns %s: %s", name, started)
    return ", ".join(started)


async def _stop_frr_in_netns(name: str) -> None:
    """Stop FRR daemons for a given netns and clean up configs."""
    for daemon in _FRR_DAEMONS:
        await ssh_exec(f"pkill -f '{daemon}.*-N {name}' 2>/dev/null")
    # Clean up config and runtime dirs
    await ssh_exec(f"rm -rf /etc/frr/{name} /var/run/frr/{name} 2>/dev/null")
    logger.info("Stopped FRR in netns %s", name)


# ── Switch (OVS Bridge) CRUD ────────────────────────────────────

@router.post("/switches", status_code=status.HTTP_201_CREATED)
async def create_switch(
    req: CreateSwitchRequest,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Create a new OVS bridge (switch) on the VM."""
    name = req.name.strip().replace(" ", "-")
    if not name:
        raise HTTPException(400, detail="Name is required")

    # Check if bridge already exists
    r = await ovs_exec(f"ovs-vsctl br-exists {name}")
    if r.returncode == 0:
        raise HTTPException(409, detail=f"Bridge '{name}' already exists")

    # Create bridge
    cmd = f"ovs-vsctl add-br {name}"
    r = await ovs_exec(cmd)
    if r.returncode != 0:
        raise HTTPException(500, detail=f"Failed to create bridge: {r.stderr}")

    # Set OpenFlow protocol version
    await ovs_exec(f"ovs-vsctl set bridge {name} protocols={req.protocols}")

    # Bring up
    await ssh_exec(f"ip link set {name} up")

    # Optional controller
    if req.controller:
        await ovs_exec(f"ovs-vsctl set-controller {name} tcp:{req.controller}")
        # Set fail-mode (default to secure when controller is set)
        fm = req.fail_mode or "secure"
        await ovs_exec(f"ovs-vsctl set-fail-mode {name} {fm}")
    elif req.fail_mode:
        await ovs_exec(f"ovs-vsctl set-fail-mode {name} {req.fail_mode}")

    # Save position override
    if req.x is not None and req.y is not None:
        # Find the new node ID by re-discovering topology
        topo = await orch.topology.get_topology()
        for node in topo["nodes"]:
            if node["name"] == name and node["type"] == "switch":
                await orch.topology.update_node_position(
                    node["id"], {"x": req.x, "y": req.y}
                )
                break

    logger.info("Created switch: %s", name)
    return {"success": True, "message": f"Switch '{name}' created", "name": name}


@router.delete("/switches/{name}")
async def delete_switch(
    name: str,
):
    """Delete an OVS bridge (switch) from the VM."""
    # Check exists
    r = await ovs_exec(f"ovs-vsctl br-exists {name}")
    if r.returncode != 0:
        raise HTTPException(404, detail=f"Bridge '{name}' not found")

    # Delete all ports first, then bridge
    r = await ovs_exec(f"ovs-vsctl --if-exists del-br {name}")
    if r.returncode != 0:
        raise HTTPException(500, detail=f"Failed to delete bridge: {r.stderr}")

    logger.info("Deleted switch: %s", name)
    return {"success": True, "message": f"Switch '{name}' deleted"}


# ── Host (veth + netns) CRUD ────────────────────────────────────

@router.post("/hosts", status_code=status.HTTP_201_CREATED)
async def create_host(
    req: CreateHostRequest,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Create a virtual host (network namespace + veth pair).

    The host is created as a Linux network namespace with a veth pair.
    One end stays in the namespace, the other is free for linking.
    """
    name = req.name.strip().replace(" ", "-")
    if not name:
        raise HTTPException(400, detail="Name is required")

    # Check if netns already exists
    if await _host_exists(name):
        raise HTTPException(409, detail=f"Host '{name}' already exists")

    # Create network namespace
    r = await ssh_exec(f"ip netns add {name}")
    if r.returncode != 0:
        raise HTTPException(500, detail=f"Failed to create namespace: {r.stderr}")

    # Bring up loopback in namespace
    await ssh_exec(f"ip netns exec {name} ip link set lo up")

    # Explicitly disable IP forwarding (hosts must NOT forward)
    # RHEL inherits ip_forward=1 from the host — this prevents
    # the discovery pre-scan from classifying hosts as routers.
    await ssh_exec(f"ip netns exec {name} sysctl -w net.ipv4.ip_forward=0")

    # Create veth pair: {name}-eth0 (in namespace) ↔ {name}-veth (host side)
    veth_host = f"{name}-veth"
    veth_ns = f"{name}-eth0"
    r = await ssh_exec(f"ip link add {veth_host} type veth peer name {veth_ns}")
    if r.returncode != 0:
        # Cleanup namespace
        await ssh_exec(f"ip netns del {name}")
        raise HTTPException(500, detail=f"Failed to create veth pair: {r.stderr}")

    # Move one end into namespace
    await ssh_exec(f"ip link set {veth_ns} netns {name}")
    await ssh_exec(f"ip netns exec {name} ip link set {veth_ns} up")
    await ssh_exec(f"ip link set {veth_host} up")

    # Assign IP if provided
    if req.ip:
        await ssh_exec(f"ip netns exec {name} ip addr add {req.ip} dev {veth_ns}")

    # Set default gateway if provided
    if req.gateway:
        await ssh_exec(f"ip netns exec {name} ip route add default via {req.gateway}")

    # Save position
    if req.x is not None and req.y is not None:
        topo = await orch.topology.get_topology()
        for node in topo["nodes"]:
            if node["name"] == veth_host and node["type"] == "host":
                await orch.topology.update_node_position(
                    node["id"], {"x": req.x, "y": req.y}
                )
                break

    logger.info("Created host: %s (IP: %s)", name, req.ip or "none")
    return {
        "success": True,
        "message": f"Host '{name}' created",
        "name": name,
        "veth_host": veth_host,
        "veth_ns": veth_ns,
    }


@router.delete("/hosts/{name}")
async def delete_host(
    name: str,
):
    """Delete a virtual host (namespace + veth pair)."""
    # Deleting the namespace also removes the veth peer inside it
    # But we also need to clean up the host-side veth
    veth_host = f"{name}-veth"

    # Delete the veth (this also removes the peer)
    await ssh_exec(f"ip link del {veth_host} 2>/dev/null")

    # Delete namespace
    r = await ssh_exec(f"ip netns del {name} 2>/dev/null")

    logger.info("Deleted host: %s", name)
    return {"success": True, "message": f"Host '{name}' deleted"}


# ── Router (VRouter) CRUD ────────────────────────────────────────

@router.post("/routers", status_code=status.HTTP_201_CREATED)
async def create_router(
    req: CreateRouterRequest,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Create a virtual router (netns with IP forwarding enabled)."""
    name = req.name.strip().replace(" ", "-")
    if not name:
        raise HTTPException(400, detail="Name is required")

    if await _host_exists(name):
        raise HTTPException(409, detail=f"Namespace '{name}' already exists")

    # Create network namespace
    r = await ssh_exec(f"ip netns add {name}")
    if r.returncode != 0:
        raise HTTPException(500, detail=f"Failed to create namespace: {r.stderr}")

    # Enable IP forwarding
    await ssh_exec(f"ip netns exec {name} sysctl -w net.ipv4.ip_forward=1")

    # Bring up loopback
    await ssh_exec(f"ip netns exec {name} ip link set lo up")

    # Start FRR daemons inside the namespace
    frr_started = await _start_frr_in_netns(name)

    # Save position
    if req.x is not None and req.y is not None:
        topo = await orch.topology.get_topology()
        for node in topo["nodes"]:
            if node["name"] == name and node["type"] == "router":
                await orch.topology.update_node_position(
                    node["id"], {"x": req.x, "y": req.y}
                )
                break

    logger.info("Created virtual router: %s (FRR: %s)", name, frr_started)
    return {
        "success": True,
        "message": f"Router '{name}' created with FRR ({frr_started})",
        "name": name,
        "frr_daemons": frr_started,
    }


@router.delete("/routers/{name}")
async def delete_router(name: str):
    """Delete a virtual router (netns), stop FRR, and clean up."""
    if not await _host_exists(name):
        raise HTTPException(404, detail=f"Router '{name}' not found")

    # Stop FRR daemons first
    await _stop_frr_in_netns(name)

    # Find and remove all veth interfaces on the host side
    list_r = await ssh_exec(
        f"ip -o link show 2>/dev/null | grep -oP '{name}-veth\\d+'"
    )
    if list_r.returncode == 0 and list_r.stdout.strip():
        for veth in list_r.stdout.strip().splitlines():
            veth = veth.strip()
            if veth:
                await ovs_exec(f"ovs-vsctl --if-exists del-port {veth}")
                await ssh_exec(f"ip link del {veth} 2>/dev/null")

    # Delete the namespace
    r = await ssh_exec(f"ip netns del {name}")
    if r.returncode != 0:
        raise HTTPException(500, detail=f"Failed to delete router: {r.stderr}")

    logger.info("Deleted virtual router: %s", name)
    return {"success": True, "message": f"Router '{name}' deleted"}


# ── Cloud (Internet gateway) CRUD ────────────────────────────────

# In-memory set of cloud nodes (they're purely visual + link targets)
_cloud_nodes: dict[str, dict] = {}


@router.post("/clouds", status_code=status.HTTP_201_CREATED)
async def create_cloud(
    req: CreateCloudRequest,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Create an Internet/cloud node (visual + link target for WAN access)."""
    name = req.name.strip().replace(" ", "-")
    if not name:
        raise HTTPException(400, detail="Name is required")
    if name in _cloud_nodes:
        raise HTTPException(409, detail=f"Cloud '{name}' already exists")

    _cloud_nodes[name] = {"x": req.x, "y": req.y}

    # Save position
    cloud_id = f"cloud-{name}"
    if req.x is not None and req.y is not None:
        await orch.topology.update_node_position(cloud_id, {"x": req.x, "y": req.y})

    logger.info("Created cloud node: %s", name)
    return {
        "success": True,
        "message": f"Internet node '{name}' created",
        "name": name,
    }


@router.delete("/clouds/{name}")
async def delete_cloud(
    name: str,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Delete an Internet/cloud node and clean up any macvlan interfaces."""
    if name not in _cloud_nodes:
        # Allow deleting even if not in memory (topology might have been refreshed)
        pass
    _cloud_nodes.pop(name, None)

    # Clean up any macvlan interfaces (wan-*) in any router namespaces
    ns_r = await ssh_exec("ip netns list 2>/dev/null")
    if ns_r.returncode == 0:
        for line in ns_r.stdout.splitlines():
            ns_name = line.split()[0].strip() if line.strip() else ""
            if not ns_name:
                continue
            # Find macvlan interfaces
            mv_r = await ssh_exec(
                f"ip netns exec {ns_name} ip -o link show type macvlan 2>/dev/null"
            )
            if mv_r.returncode == 0 and mv_r.stdout.strip():
                for mline in mv_r.stdout.splitlines():
                    if "wan-" in mline:
                        parts = mline.split(":")
                        if len(parts) >= 2:
                            iface = parts[1].strip().split("@")[0]
                            await ssh_exec(
                                f"ip netns exec {ns_name} ip link del {iface} 2>/dev/null"
                            )

    logger.info("Deleted cloud node: %s", name)
    return {"success": True, "message": f"Internet node '{name}' deleted"}


# ── Link CRUD ────────────────────────────────────────────────────

@router.post("/links", status_code=status.HTTP_201_CREATED)
async def create_link(
    req: CreateLinkRequest,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Create a link between two nodes.

    Supported connections:
    - switch ↔ host: add host's veth to the bridge
    - switch ↔ switch: create patch port pair between bridges
    """
    src_name = req.source_name.strip()
    tgt_name = req.target_name.strip()
    src_id = req.source_id
    tgt_id = req.target_id

    # Detect node types from IDs
    src_type = src_id.split("-")[0] if "-" in src_id else "unknown"
    tgt_type = tgt_id.split("-")[0] if "-" in tgt_id else "unknown"

    # ── switch ↔ host ──
    if (src_type == "switch" and tgt_type == "host") or \
       (src_type == "host" and tgt_type == "switch"):
        bridge = src_name if src_type == "switch" else tgt_name
        host_name = tgt_name if tgt_type == "host" else src_name

        # The host's veth endpoint name
        # If host_name already has -veth suffix it's the veth, otherwise construct it
        if host_name.endswith("-veth"):
            veth_host = host_name
        else:
            veth_host = f"{host_name}-veth"

        # Check if port is already on a bridge
        r = await ovs_exec(f"ovs-vsctl port-to-br {veth_host} 2>/dev/null")
        if r.returncode == 0 and r.stdout.strip():
            existing_br = r.stdout.strip()
            if existing_br == bridge:
                raise HTTPException(409, detail=f"'{veth_host}' is already on bridge '{bridge}'")
            # Remove from old bridge first
            await ovs_exec(f"ovs-vsctl del-port {existing_br} {veth_host}")

        # Add veth to bridge
        r = await ovs_exec(f"ovs-vsctl add-port {bridge} {veth_host}")
        if r.returncode != 0:
            raise HTTPException(500, detail=f"Failed to add port: {r.stderr}")

        logger.info("Linked host %s to switch %s", host_name, bridge)
        return {
            "success": True,
            "message": f"Linked {host_name} ↔ {bridge}",
            "link_type": "host-switch",
        }

    # ── switch ↔ switch (patch ports) ──
    if src_type == "switch" and tgt_type == "switch":
        suffix = _rand_suffix(4)
        patch_a = f"patch-{src_name[:6]}-{suffix}"
        patch_b = f"patch-{tgt_name[:6]}-{suffix}"

        # Create patch port on source bridge
        r1 = await ovs_exec(
            f"ovs-vsctl add-port {src_name} {patch_a} "
            f"-- set interface {patch_a} type=patch options:peer={patch_b}"
        )
        # Create patch port on target bridge
        r2 = await ovs_exec(
            f"ovs-vsctl add-port {tgt_name} {patch_b} "
            f"-- set interface {patch_b} type=patch options:peer={patch_a}"
        )

        if r1.returncode != 0 or r2.returncode != 0:
            # Cleanup on failure
            await ovs_exec(f"ovs-vsctl --if-exists del-port {src_name} {patch_a}")
            await ovs_exec(f"ovs-vsctl --if-exists del-port {tgt_name} {patch_b}")
            raise HTTPException(500, detail=f"Failed to create patch ports: {r1.stderr} {r2.stderr}")

        logger.info("Linked switch %s ↔ %s via patch", src_name, tgt_name)
        return {
            "success": True,
            "message": f"Linked {src_name} ↔ {tgt_name}",
            "link_type": "patch",
            "patch_ports": [patch_a, patch_b],
        }

    # ── vrouter ↔ switch (veth pair with IP on router side) ──
    if (src_type == "vrouter" and tgt_type == "switch") or \
       (src_type == "switch" and tgt_type == "vrouter"):
        bridge = src_name if src_type == "switch" else tgt_name
        router_name = tgt_name if tgt_type == "vrouter" else src_name

        # Find next available interface index
        next_r = await ssh_exec(
            f"ip -o link show 2>/dev/null | grep -oP '{router_name}-veth\\d+' | "
            f"sed 's/{router_name}-veth//' | sort -n | tail -1"
        )
        idx_str = next_r.stdout.strip() if next_r.returncode == 0 else ""
        next_idx = int(idx_str) + 1 if idx_str.isdigit() else 0

        eth_name = f"{router_name}-eth{next_idx}"
        veth_name = f"{router_name}-veth{next_idx}"

        # Create veth pair
        r = await ssh_exec(f"ip link add {veth_name} type veth peer name {eth_name}")
        if r.returncode != 0:
            raise HTTPException(500, detail=f"Failed to create veth pair: {r.stderr}")

        # Move eth end to router namespace
        r = await ssh_exec(f"ip link set {eth_name} netns {router_name}")
        if r.returncode != 0:
            await ssh_exec(f"ip link del {veth_name} 2>/dev/null")
            raise HTTPException(500, detail=f"Failed to move interface to namespace: {r.stderr}")

        # Add veth end to OVS bridge
        r = await ovs_exec(f"ovs-vsctl add-port {bridge} {veth_name}")
        if r.returncode != 0:
            await ssh_exec(f"ip link del {veth_name} 2>/dev/null")
            raise HTTPException(500, detail=f"Failed to add port to bridge: {r.stderr}")

        # Bring both interfaces up
        await ssh_exec(f"ip link set {veth_name} up")
        await ssh_exec(f"ip netns exec {router_name} ip link set {eth_name} up")

        # Assign IP if provided
        if req.ip:
            await ssh_exec(
                f"ip netns exec {router_name} ip addr add {req.ip} dev {eth_name}"
            )

        logger.info("Linked router %s (eth%d) to switch %s", router_name, next_idx, bridge)
        return {
            "success": True,
            "message": f"Linked {router_name} ↔ {bridge}"
                       + (f" (IP: {req.ip})" if req.ip else ""),
            "link_type": "router-switch",
            "interface": eth_name,
            "veth": veth_name,
        }

    # ── vrouter ↔ vrouter (direct veth pair between namespaces) ──
    if src_type == "vrouter" and tgt_type == "vrouter":
        suffix = _rand_suffix(4)
        # Use short names (Linux 15-char limit): vr-XXXX-a / vr-XXXX-b
        veth_a = f"vr-{suffix}-a"
        veth_b = f"vr-{suffix}-b"

        # Create veth pair on host
        r = await ssh_exec(f"ip link add {veth_a} type veth peer name {veth_b}")
        if r.returncode != 0:
            raise HTTPException(500, detail=f"Failed to create veth pair: {r.stderr}")

        # Move each end to its router namespace
        r1 = await ssh_exec(f"ip link set {veth_a} netns {src_name}")
        r2 = await ssh_exec(f"ip link set {veth_b} netns {tgt_name}")
        if r1.returncode != 0 or r2.returncode != 0:
            await ssh_exec(f"ip link del {veth_a} 2>/dev/null")
            await ssh_exec(f"ip link del {veth_b} 2>/dev/null")
            raise HTTPException(500, detail=f"Failed to move interfaces to namespaces")

        # Bring up (names stay as vr-XXXX-a/b inside namespace)
        await ssh_exec(f"ip netns exec {src_name} ip link set {veth_a} up")
        await ssh_exec(f"ip netns exec {tgt_name} ip link set {veth_b} up")

        # Assign IPs if provided
        if req.ip:
            await ssh_exec(f"ip netns exec {src_name} ip addr add {req.ip} dev {veth_a}")
        if req.target_ip:
            await ssh_exec(f"ip netns exec {tgt_name} ip addr add {req.target_ip} dev {veth_b}")

        logger.info("Linked router %s ↔ %s (direct veth: %s, %s)", src_name, tgt_name, veth_a, veth_b)
        return {
            "success": True,
            "message": f"Linked {src_name} ↔ {tgt_name}"
                       + (f" (IPs: {req.ip}, {req.target_ip})" if req.ip else ""),
            "link_type": "router-router",
            "interfaces": {src_name: veth_a, tgt_name: veth_b},
        }

    # ── vrouter ↔ cloud (macvlan to physical interface for Internet) ──
    if (src_type == "vrouter" and tgt_type == "cloud") or \
       (src_type == "cloud" and tgt_type == "vrouter"):
        router_name = src_name if src_type == "vrouter" else tgt_name

        suffix = _rand_suffix(4)
        macvlan_name = f"wan-{suffix}"

        # Create macvlan on host physical interface
        r = await ssh_exec(
            f"ip link add {macvlan_name} link enp0s1 type macvlan mode bridge"
        )
        if r.returncode != 0:
            raise HTTPException(500, detail=f"Failed to create macvlan: {r.stderr}")

        # Move macvlan to router namespace
        r = await ssh_exec(f"ip link set {macvlan_name} netns {router_name}")
        if r.returncode != 0:
            await ssh_exec(f"ip link del {macvlan_name} 2>/dev/null")
            raise HTTPException(500, detail=f"Failed to move macvlan: {r.stderr}")

        # Bring up
        await ssh_exec(f"ip netns exec {router_name} ip link set {macvlan_name} up")

        # Find an available IP on the 192.168.64.0/24 network (DHCP-like)
        # Try .100–.199 range to avoid clashing with DHCP pool
        assigned_ip = None
        for octet in range(100, 200):
            test_ip = f"192.168.64.{octet}"
            ping_r = await ssh_exec(f"ping -c 1 -W 1 {test_ip} 2>/dev/null")
            if ping_r.returncode != 0:  # not in use
                assigned_ip = test_ip
                break

        if not assigned_ip:
            # fallback: just use the provided IP or a random one
            assigned_ip = req.ip.split('/')[0] if req.ip else f"192.168.64.{random.randint(100, 199)}"

        # Assign IP and default route
        await ssh_exec(
            f"ip netns exec {router_name} ip addr add {assigned_ip}/24 dev {macvlan_name}"
        )
        await ssh_exec(
            f"ip netns exec {router_name} ip route add default via 192.168.64.1 dev {macvlan_name}"
        )

        logger.info(
            "Linked router %s to Internet via macvlan %s (IP: %s)",
            router_name, macvlan_name, assigned_ip,
        )
        return {
            "success": True,
            "message": f"Linked {router_name} → Internet (IP: {assigned_ip}/24, gw: 192.168.64.1)",
            "link_type": "router-cloud",
            "interface": macvlan_name,
            "ip": f"{assigned_ip}/24",
        }

    raise HTTPException(400, detail=f"Unsupported link: {src_type} ↔ {tgt_type}")


@router.delete("/links")
async def delete_link(
    source_name: str,
    target_name: str,
):
    """Delete a link between two nodes by removing the port(s)."""
    # Try to find which bridge has the port
    # Case 1: target is a veth on source bridge
    r = await ovs_exec(f"ovs-vsctl port-to-br {target_name} 2>/dev/null")
    if r.returncode == 0 and r.stdout.strip() == source_name:
        await ovs_exec(f"ovs-vsctl del-port {source_name} {target_name}")
        return {"success": True, "message": f"Removed {target_name} from {source_name}"}

    # Case 2: source is a veth on target bridge
    r = await ovs_exec(f"ovs-vsctl port-to-br {source_name} 2>/dev/null")
    if r.returncode == 0 and r.stdout.strip() == target_name:
        await ovs_exec(f"ovs-vsctl del-port {target_name} {source_name}")
        return {"success": True, "message": f"Removed {source_name} from {target_name}"}

    # Case 3: patch ports between two bridges — find and remove them
    for br_name in [source_name, target_name]:
        ports_r = await ovs_exec(f"ovs-vsctl list-ports {br_name} 2>/dev/null")
        if ports_r.returncode == 0:
            for port in ports_r.stdout.splitlines():
                port = port.strip()
                if port.startswith("patch-"):
                    type_r = await ovs_exec(f"ovs-vsctl get interface {port} type 2>/dev/null")
                    if type_r.stdout.strip().replace('"', '') == "patch":
                        peer_r = await ovs_exec(f"ovs-vsctl get interface {port} options:peer 2>/dev/null")
                        peer = peer_r.stdout.strip().replace('"', '')
                        # Remove both ends
                        await ovs_exec(f"ovs-vsctl --if-exists del-port {br_name} {port}")
                        other_br = target_name if br_name == source_name else source_name
                        await ovs_exec(f"ovs-vsctl --if-exists del-port {other_br} {peer}")
                        return {"success": True, "message": f"Removed patch ports {port} ↔ {peer}"}

    raise HTTPException(404, detail="Link not found")


# ── Batch position update ────────────────────────────────────────

@router.put("/positions")
async def update_positions(
    req: NodePositionBatch,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Batch update node positions (save layout)."""
    updated = 0
    for node_id, pos in req.positions.items():
        ok = await orch.topology.update_node_position(node_id, pos)
        if ok:
            updated += 1
    return {"success": True, "updated": updated}


# ── List available hosts (netns) ─────────────────────────────────

@router.get("/hosts")
async def list_hosts():
    """List all network namespaces (virtual hosts) on the VM."""
    r = await ssh_exec("ip netns list 2>/dev/null")
    hosts = []
    if r.returncode == 0:
        for line in r.stdout.splitlines():
            name = line.split()[0].strip() if line.strip() else ""
            if name:
                # Get IPs in namespace
                ip_r = await ssh_exec(f"ip netns exec {name} ip -4 addr show 2>/dev/null | grep inet | grep -v 127.0.0.1")
                ip_addr = ""
                if ip_r.returncode == 0 and ip_r.stdout.strip():
                    m = _re.search(r'inet (\\S+)', ip_r.stdout)
                    if m:
                        ip_addr = m.group(1)
                hosts.append({"name": name, "ip": ip_addr})
    return {"hosts": hosts, "total": len(hosts)}


# ── Clear All Topology ───────────────────────────────────────────

@router.delete("/all")
async def clear_all_topology():
    """Delete ALL builder-created items: OVS bridges, netns, veths.

    Leaves main FRR router and physical interfaces untouched.
    """
    removed_bridges: list[str] = []
    removed_namespaces: list[str] = []
    errors: list[str] = []

    # 1) Stop FRR instances for all netns
    ns_r = await ssh_exec("ip netns list 2>/dev/null")
    if ns_r.returncode == 0:
        for line in ns_r.stdout.splitlines():
            ns_name = line.split()[0].strip() if line.strip() else ""
            if not ns_name:
                continue
            # Stop FRR and clean configs
            await _stop_frr_in_netns(ns_name)
            # Remove any veths beloning to this namespace
            veth_r = await ssh_exec(
                f"ip -o link show 2>/dev/null | grep -oP '{ns_name}-veth\\S*'"
            )
            if veth_r.returncode == 0 and veth_r.stdout.strip():
                for veth in veth_r.stdout.strip().splitlines():
                    veth = veth.strip()
                    if veth:
                        await ovs_exec(f"ovs-vsctl --if-exists del-port {veth}")
                        await ssh_exec(f"ip link del {veth} 2>/dev/null")
            # Delete namespace
            r = await ssh_exec(f"ip netns del {ns_name} 2>/dev/null")
            if r.returncode == 0:
                removed_namespaces.append(ns_name)
            else:
                errors.append(f"netns {ns_name}: {r.stderr}")

    # 2) Delete all OVS bridges
    br_r = await ovs_exec("ovs-vsctl list-br 2>/dev/null")
    if br_r.returncode == 0:
        for br_name in br_r.stdout.splitlines():
            br_name = br_name.strip()
            if not br_name:
                continue
            r = await ovs_exec(f"ovs-vsctl --if-exists del-br {br_name}")
            if r.returncode == 0:
                removed_bridges.append(br_name)
            else:
                errors.append(f"bridge {br_name}: {r.stderr}")

    # 3) Clean up any orphaned veths
    await ssh_exec(
        "ip -o link show type veth 2>/dev/null | awk -F': ' '{print $2}' "
        "| while read v; do ip link del \"$v\" 2>/dev/null; done"
    )

    total = len(removed_bridges) + len(removed_namespaces)
    logger.info(
        "Clear all topology: %d bridges, %d namespaces removed",
        len(removed_bridges), len(removed_namespaces),
    )
    return {
        "success": True,
        "message": f"Cleared {total} items"
                   f" ({len(removed_bridges)} bridges,"
                   f" {len(removed_namespaces)} namespaces)",
        "removed_bridges": removed_bridges,
        "removed_namespaces": removed_namespaces,
        "errors": errors,
    }
