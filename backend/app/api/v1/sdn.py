"""SDN flow and switch management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_user, get_orchestrator
from app.schemas.common import SuccessResponse
from app.schemas.sdn import (
    BridgeCreateRequest,
    FlowCreateRequest,
    FlowCreateResponse,
    FlowListResponse,
    FlowStatsResponse,
    PolicyCreateRequest,
    PolicyListResponse,
    PortAddRequest,
    SwitchListResponse,
    VxlanPortRequest,
)
from app.services.orchestrator import Orchestrator

router = APIRouter(tags=["SDN"])


# --- Flows ---


@router.get("/sdn/flows", response_model=FlowListResponse)
async def get_flows(
    dpid: str | None = Query(None, description="Filter by switch DPID"),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Get all flow rules."""
    flows = await orch.ryu.get_flows(dpid=dpid)
    return FlowListResponse(flows=flows, total=len(flows))


@router.get("/sdn/flows/{flow_id}")
async def get_flow(
    flow_id: str,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Get a specific flow rule."""
    flow = await orch.ryu.get_flow(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow


@router.post("/sdn/flows", response_model=FlowCreateResponse, status_code=status.HTTP_201_CREATED)
async def add_flow(
    request: FlowCreateRequest,
    _user: str = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Add a flow rule (requires auth)."""
    flow_id = await orch.ryu.add_flow(request.model_dump())
    return FlowCreateResponse(success=True, flow_id=flow_id)


@router.delete("/sdn/flows/{flow_id}")
async def delete_flow(
    flow_id: str,
    _user: str = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Delete a flow rule (requires auth)."""
    deleted = await orch.ryu.delete_flow(flow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Flow not found")
    return SuccessResponse(message="Flow deleted")


@router.get("/sdn/flows/{flow_id}/stats", response_model=FlowStatsResponse)
async def get_flow_stats(
    flow_id: str,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Get flow statistics."""
    stats = await orch.ryu.get_flow_stats(flow_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Flow not found")
    return FlowStatsResponse(**stats)


# --- Switches ---


@router.get("/switches", response_model=SwitchListResponse)
async def get_switches(orch: Orchestrator = Depends(get_orchestrator)):
    """Get all switches."""
    switches = await orch.ryu.get_switches()
    return SwitchListResponse(switches=switches)


@router.get("/switches/{dpid}")
async def get_switch(
    dpid: str,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Get switch details."""
    switch = await orch.ryu.get_switch(dpid)
    if not switch:
        raise HTTPException(status_code=404, detail="Switch not found")
    return switch


@router.post("/switches", status_code=status.HTTP_201_CREATED)
async def create_bridge(
    request: BridgeCreateRequest,
    _user: str = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Create an OVS bridge (requires auth)."""
    success = await orch.ovs.create_bridge(
        name=request.name,
        protocols=request.protocols,
        controller=request.controller,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to create bridge")
    return SuccessResponse(message=f"Bridge {request.name} created")


@router.delete("/switches/{name}")
async def delete_bridge(
    name: str,
    _user: str = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Delete an OVS bridge (requires auth)."""
    success = await orch.ovs.delete_bridge(name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete bridge")
    return SuccessResponse(message=f"Bridge {name} deleted")


@router.post("/switches/{bridge_name}/ports", status_code=status.HTTP_201_CREATED)
async def add_port(
    bridge_name: str,
    request: PortAddRequest,
    _user: str = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Add a port to a bridge (requires auth)."""
    success = await orch.ovs.add_port(bridge_name, request.port_name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to add port")
    return SuccessResponse(message=f"Port {request.port_name} added to {bridge_name}")


@router.post("/switches/{bridge_name}/ports/vxlan", status_code=status.HTTP_201_CREATED)
async def create_vxlan_port(
    bridge_name: str,
    request: VxlanPortRequest,
    _user: str = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Create a VXLAN tunnel port (requires auth)."""
    success = await orch.ovs.create_vxlan_port(
        bridge=bridge_name,
        port_name=request.port_name,
        remote_ip=request.remote_ip,
        vni=request.vni,
        dst_port=request.dst_port,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to create VXLAN port")
    return SuccessResponse(message=f"VXLAN port {request.port_name} created")
