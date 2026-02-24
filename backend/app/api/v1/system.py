"""System mode and configuration endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, get_orchestrator
from app.core.config import settings
from app.schemas.common import SystemModeRequest, SystemModeResponse
from app.services.orchestrator import Orchestrator
from app.services import audit

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/mode", response_model=SystemModeResponse)
async def get_mode():
    """Get current system mode (dc or wan)."""
    return SystemModeResponse(mode=settings.system_mode)


@router.put("/mode", response_model=SystemModeResponse)
async def set_mode(
    request: SystemModeRequest,
    _user: dict = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Set system mode (requires auth).

    DC mode: VXLAN overlays, BGP EVPN, multi-tenant VRF isolation.
    WAN mode: BGP/OSPF peering, GRE/VXLAN tunnels, policy routing.
    """
    if request.mode not in ("dc", "wan"):
        raise HTTPException(status_code=400, detail="Mode must be 'dc' or 'wan'")
    old_mode = settings.system_mode
    settings.system_mode = request.mode

    # Notify orchestrator of mode change so services can adjust
    orch.invalidate_caches()

    audit.record(
        user=_user["username"],
        role=_user.get("role", "unknown"),
        action="set_mode",
        resource="system",
        detail=f"{old_mode} -> {request.mode}",
    )
    return SystemModeResponse(mode=settings.system_mode)


@router.get("/details")
async def get_system_details(orch: Orchestrator = Depends(get_orchestrator)):
    """Get extended system information including mode description and feature flags."""
    return {
        "version": "0.1.0",
        "mode": settings.system_mode,
        "mode_description": "Data Center (VXLAN + BGP EVPN)" if settings.system_mode == "dc" else "WAN (BGP/OSPF + GRE/VXLAN tunnels)",
        "uptime": orch.uptime,
        "frr_enabled": settings.frr_enabled,
        "ovs_enabled": settings.ovs_enabled,
        "ryu_enabled": settings.ryu_enabled,
        "is_production": settings.is_production,
    }


@router.get("/nodes")
async def get_nodes(_user: dict = Depends(get_current_user)):
    """List managed VM nodes (requires auth)."""
    nodes = settings.node_list
    return {
        "nodes": [
            {
                "name": n.name,
                "host": n.host,
                "frr_enabled": n.frr_enabled,
                "ovs_enabled": n.ovs_enabled,
                "has_ryu": n.ryu_url is not None,
            }
            for n in nodes
        ],
        "total": len(nodes),
    }
