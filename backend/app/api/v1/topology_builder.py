"""Topology Builder endpoints — EVE-NG style node & link CRUD.

Create / delete switches (OVS bridges), hosts (veth pairs), and
links between them — all executed live on the VM via SSH.
"""

from __future__ import annotations

import logging
import random
import string
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_current_user, get_orchestrator
from app.services.orchestrator import Orchestrator
from app.services.ssh_utils import ssh_exec, ovs_exec

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/topology/builder", tags=["Topology Builder"])

# ── Protected (default) devices — cannot be deleted ─────────────
PROTECTED_SWITCHES: set[str] = {"br0", "br1"}
PROTECTED_NODE_IDS: set[str] = {"router-001"}  # FRR router

def _is_protected_switch(name: str) -> bool:
    return name in PROTECTED_SWITCHES

def _is_protected_node(node_id: str) -> bool:
    return node_id in PROTECTED_NODE_IDS or node_id.startswith("router-")


# ── Schemas ──────────────────────────────────────────────────────

class CreateSwitchRequest(BaseModel):
    name: str
    x: float | None = None
    y: float | None = None
    protocols: str = "OpenFlow13"
    controller: str | None = None


class CreateHostRequest(BaseModel):
    name: str
    ip: str | None = None  # e.g. "10.10.1.2/24"
    x: float | None = None
    y: float | None = None
    gateway: str | None = None


class CreateLinkRequest(BaseModel):
    source_id: str  # topology node id (e.g. "switch-001")
    target_id: str  # topology node id
    source_name: str  # actual OVS bridge / host name
    target_name: str


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


# ── Switch (OVS Bridge) CRUD ────────────────────────────────────

@router.post("/switches", status_code=status.HTTP_201_CREATED)
async def create_switch(
    req: CreateSwitchRequest,
    _user: str = Depends(get_current_user),
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
    _user: str = Depends(get_current_user),
):
    """Delete an OVS bridge (switch) from the VM."""
    # Protected device guard
    if _is_protected_switch(name):
        raise HTTPException(
            403,
            detail=f"Bridge '{name}' is a protected default device and cannot be deleted",
        )

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
    _user: str = Depends(get_current_user),
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
    _user: str = Depends(get_current_user),
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


# ── Link CRUD ────────────────────────────────────────────────────

@router.post("/links", status_code=status.HTTP_201_CREATED)
async def create_link(
    req: CreateLinkRequest,
    _user: str = Depends(get_current_user),
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

    raise HTTPException(400, detail=f"Unsupported link: {src_type} ↔ {tgt_type}")


@router.delete("/links")
async def delete_link(
    source_name: str,
    target_name: str,
    _user: str = Depends(get_current_user),
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
    _user: str = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Batch update node positions (save layout)."""
    updated = 0
    for node_id, pos in req.positions.items():
        ok = await orch.topology.update_node_position(node_id, pos)
        if ok:
            updated += 1
    return {"success": True, "updated": updated}


# ── Protected devices info ────────────────────────────────────────

@router.get("/protected")
async def get_protected_devices():
    """Return the list of protected default devices that cannot be deleted."""
    return {
        "protected_switches": sorted(PROTECTED_SWITCHES),
        "protected_node_ids": sorted(PROTECTED_NODE_IDS),
        "description": "These devices are part of the base infrastructure and cannot be deleted.",
    }


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
                    import re
                    m = re.search(r'inet (\S+)', ip_r.stdout)
                    if m:
                        ip_addr = m.group(1)
                hosts.append({"name": name, "ip": ip_addr})
    return {"hosts": hosts, "total": len(hosts)}
