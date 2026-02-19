"""Routing management endpoints - BGP, OSPF, static routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_user, get_orchestrator
from app.schemas.common import SuccessResponse
from app.schemas.routing import (
    BGPNeighborListResponse,
    BGPNeighborRequest,
    BGPSummaryResponse,
    OSPFNeighborListResponse,
    OSPFSummaryResponse,
    RouteListResponse,
    StaticRouteRequest,
    StaticRouteResponse,
)
from app.services.orchestrator import Orchestrator

router = APIRouter(prefix="/routing", tags=["Routing"])


# --- Routes ---


@router.get("/routes", response_model=RouteListResponse)
async def get_routes(
    protocol: str | None = Query(None, description="Filter by protocol"),
    destination: str | None = Query(None, description="Filter by destination"),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Get the routing table."""
    routes = await orch.frr.get_routing_table(protocol=protocol)
    if destination:
        routes = [r for r in routes if r["destination"] == destination]
    return RouteListResponse(routes=routes, total=len(routes))


@router.post("/routes/static", status_code=status.HTTP_201_CREATED)
async def add_static_route(
    request: StaticRouteRequest,
    _user: dict = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Add a static route (requires auth)."""
    route = await orch.frr.add_static_route(
        destination=request.destination,
        next_hop=request.next_hop,
        metric=request.metric,
    )
    return StaticRouteResponse(success=True, route=route)


@router.delete("/routes/static/{destination:path}")
async def delete_static_route(
    destination: str,
    _user: dict = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Delete a static route (requires auth)."""
    deleted = await orch.frr.delete_static_route(destination)
    if not deleted:
        raise HTTPException(status_code=404, detail="Route not found")
    return SuccessResponse(message="Route deleted")


# --- BGP ---


@router.get("/bgp/summary", response_model=BGPSummaryResponse)
async def get_bgp_summary(orch: Orchestrator = Depends(get_orchestrator)):
    """Get BGP summary."""
    data = await orch.frr.get_bgp_summary()
    return BGPSummaryResponse(**data)


@router.get("/bgp/neighbors", response_model=BGPNeighborListResponse)
async def get_bgp_neighbors(orch: Orchestrator = Depends(get_orchestrator)):
    """Get all BGP neighbors."""
    neighbors = await orch.frr.get_bgp_neighbors()
    return BGPNeighborListResponse(neighbors=neighbors)


@router.get("/bgp/neighbors/{neighbor_ip}")
async def get_bgp_neighbor(
    neighbor_ip: str,
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Get a specific BGP neighbor."""
    neighbors = await orch.frr.get_bgp_neighbors()
    neighbor = next((n for n in neighbors if n["neighbor"] == neighbor_ip), None)
    if not neighbor:
        raise HTTPException(status_code=404, detail="Neighbor not found")
    return neighbor


@router.post("/bgp/neighbors", status_code=status.HTTP_201_CREATED)
async def add_bgp_neighbor(
    request: BGPNeighborRequest,
    _user: dict = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Add a BGP neighbor (requires auth)."""
    success = await orch.frr.add_bgp_neighbor(request.model_dump())
    if not success:
        raise HTTPException(status_code=500, detail="Failed to add neighbor")
    return {
        "success": True,
        "neighbor": {
            "neighbor": request.neighbor,
            "remote_as": request.remote_as,
            "state": "Idle",
        },
    }


@router.delete("/bgp/neighbors/{neighbor_ip}")
async def delete_bgp_neighbor(
    neighbor_ip: str,
    _user: dict = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Delete a BGP neighbor (requires auth)."""
    deleted = await orch.frr.delete_bgp_neighbor(neighbor_ip)
    if not deleted:
        raise HTTPException(status_code=404, detail="Neighbor not found")
    return SuccessResponse(message="Neighbor deleted")


# --- OSPF ---


@router.get("/ospf/summary", response_model=OSPFSummaryResponse)
async def get_ospf_summary(orch: Orchestrator = Depends(get_orchestrator)):
    """Get OSPF summary."""
    data = await orch.frr.get_ospf_summary()
    return OSPFSummaryResponse(**data)


@router.get("/ospf/neighbors", response_model=OSPFNeighborListResponse)
async def get_ospf_neighbors(orch: Orchestrator = Depends(get_orchestrator)):
    """Get OSPF neighbors."""
    neighbors = await orch.frr.get_ospf_neighbors()
    return OSPFNeighborListResponse(neighbors=neighbors)
