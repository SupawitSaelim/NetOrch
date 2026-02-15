"""VRF (Virtual Router) management endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_current_user, get_orchestrator
from app.services.orchestrator import Orchestrator
from app.services.ssh_utils import ssh_exec, vtysh_exec
from app.core.config import settings

router = APIRouter(prefix="/vrf", tags=["VRF"])


# ── Schemas ──────────────────────────────────────────────────────

class VRFInfo(BaseModel):
    name: str
    table_id: int | None = None
    interfaces: list[str] = []
    routes: int = 0
    state: str = "active"


class VRFListResponse(BaseModel):
    vrfs: list[VRFInfo]
    total: int


class VRFCreateRequest(BaseModel):
    name: str
    table_id: int | None = None  # auto-assign if None


class VRFBGPRequest(BaseModel):
    asn: int
    router_id: str | None = None
    networks: list[str] = []


# ── Mock data ────────────────────────────────────────────────────

MOCK_VRFS = [
    VRFInfo(name="default", table_id=254, interfaces=["eth0", "enp0s1"], routes=5, state="active"),
]


# ── Helpers ──────────────────────────────────────────────────────

async def _parse_vrfs_from_vtysh() -> list[VRFInfo]:
    """Parse VRF list from vtysh 'show vrf'."""
    result = await vtysh_exec("show vrf")
    vrfs: list[VRFInfo] = []

    # Always include default VRF
    rt_result = await vtysh_exec("show ip route summary")
    default_routes = 0
    for line in rt_result.stdout.splitlines():
        if "Total" in line or "routes" in line.lower():
            parts = line.split()
            for p in parts:
                if p.isdigit():
                    default_routes = int(p)
                    break

    # Get default interfaces
    iface_result = await ssh_exec("ip -br link show | awk '{print $1}' | grep -v lo")
    ifaces = [i.strip() for i in iface_result.stdout.splitlines() if i.strip()]

    vrfs.append(VRFInfo(
        name="default",
        table_id=254,
        interfaces=ifaces[:5],
        routes=default_routes or 5,
        state="active",
    ))

    # Parse additional VRFs from 'show vrf'
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line or line.startswith("vrf") or line.startswith("---") or "default" in line.lower():
            continue
        parts = line.split()
        if len(parts) >= 2:
            vrf_name = parts[0]
            tid = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
            # Get interfaces for this VRF
            vrf_iface_r = await ssh_exec(f"ip -br link show vrf {vrf_name} 2>/dev/null | awk '{{print $1}}'")
            vrf_ifaces = [i.strip() for i in vrf_iface_r.stdout.splitlines() if i.strip()]
            vrfs.append(VRFInfo(
                name=vrf_name,
                table_id=tid,
                interfaces=vrf_ifaces,
                routes=0,
                state="active",
            ))

    return vrfs


# ── Endpoints ────────────────────────────────────────────────────

@router.get("", response_model=VRFListResponse)
async def list_vrfs(orch: Orchestrator = Depends(get_orchestrator)):
    """List all VRFs (virtual routers)."""
    if not settings.frr_enabled:
        return VRFListResponse(vrfs=MOCK_VRFS, total=len(MOCK_VRFS))

    vrfs = await _parse_vrfs_from_vtysh()
    return VRFListResponse(vrfs=vrfs, total=len(vrfs))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_vrf(
    request: VRFCreateRequest,
    _user: str = Depends(get_current_user),
):
    """Create a new VRF (virtual router). Requires auth."""
    if not settings.frr_enabled:
        return {"success": True, "message": f"VRF {request.name} created (mock)"}

    name = request.name
    tid = request.table_id

    # 1. Create Linux VRF device
    if tid:
        r = await ssh_exec(f"ip link add {name} type vrf table {tid}")
    else:
        # Auto-assign table ID
        r = await ssh_exec(f"ip link add {name} type vrf table $(( RANDOM % 900 + 100 ))")
    if r.returncode != 0 and "exists" not in r.stderr:
        raise HTTPException(500, detail=f"Failed to create VRF device: {r.stderr}")

    # 2. Bring it up
    await ssh_exec(f"ip link set {name} up")

    # 3. Add VRF to FRR config
    vrf_config = f"""
vtysh -c 'configure terminal' \
      -c 'vrf {name}' \
      -c 'exit-vrf' \
      -c 'end' \
      -c 'write memory'
"""
    r2 = await ssh_exec(vrf_config.strip())

    return {"success": True, "message": f"VRF {name} created", "stderr": r2.stderr}


@router.delete("/{name}")
async def delete_vrf(
    name: str,
    _user: str = Depends(get_current_user),
):
    """Delete a VRF (virtual router). Requires auth."""
    if name == "default":
        raise HTTPException(400, detail="Cannot delete the default VRF")

    if not settings.frr_enabled:
        return {"success": True, "message": f"VRF {name} deleted (mock)"}

    # 1. Remove from FRR
    r = await ssh_exec(
        f"vtysh -c 'configure terminal' -c 'no vrf {name}' -c 'end' -c 'write memory'"
    )

    # 2. Remove Linux VRF device
    await ssh_exec(f"ip link set {name} down 2>/dev/null")
    await ssh_exec(f"ip link delete {name} 2>/dev/null")

    return {"success": True, "message": f"VRF {name} deleted"}


@router.post("/{name}/bgp")
async def configure_vrf_bgp(
    name: str,
    request: VRFBGPRequest,
    _user: str = Depends(get_current_user),
):
    """Configure BGP inside a VRF. Requires auth."""
    if not settings.frr_enabled:
        return {"success": True, "message": f"BGP AS{request.asn} configured in VRF {name} (mock)"}

    cmds = [f"configure terminal", f"router bgp {request.asn} vrf {name}"]
    if request.router_id:
        cmds.append(f"bgp router-id {request.router_id}")
    cmds.append("address-family ipv4 unicast")
    for net in request.networks:
        cmds.append(f"network {net}")
    cmds.append("exit-address-family")
    cmds.append("end")
    cmds.append("write memory")

    vtysh_cmd = " -c '".join(cmds)
    vtysh_cmd = f"vtysh -c '{vtysh_cmd}'"
    r = await ssh_exec(vtysh_cmd)

    if r.returncode != 0:
        raise HTTPException(500, detail=f"Failed to configure BGP: {r.stderr}")

    return {"success": True, "message": f"BGP AS{request.asn} configured in VRF {name}"}


@router.get("/{name}/routes")
async def get_vrf_routes(
    name: str,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Get routes for a specific VRF."""
    if not settings.frr_enabled:
        return {"routes": [], "total": 0}

    if name == "default":
        cmd = "show ip route json"
    else:
        cmd = f"show ip route vrf {name} json"

    r = await vtysh_exec(cmd)
    # Return raw JSON from FRR
    import json
    try:
        data = json.loads(r.stdout)
        return {"routes": data, "total": len(data)}
    except json.JSONDecodeError:
        return {"routes_raw": r.stdout, "total": 0}
