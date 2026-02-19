"""Topology endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, get_orchestrator
from app.schemas.topology import NodePositionUpdate, TopologyResponse
from app.services.orchestrator import Orchestrator

router = APIRouter(prefix="/topology", tags=["Topology"])


@router.get("", response_model=TopologyResponse)
async def get_topology(orch: Orchestrator = Depends(get_orchestrator)):
    """Get the current network topology."""
    data = await orch.topology.get_topology()
    return TopologyResponse(**data)


@router.post("/refresh", response_model=TopologyResponse)
async def refresh_topology(
    _user: dict = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Refresh topology from live sources (requires auth)."""
    data = await orch.topology.refresh()
    return TopologyResponse(**data)


@router.patch("/nodes/{node_id}")
async def update_node_position(
    node_id: str,
    update: NodePositionUpdate,
    _user: dict = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Update a node's position on the topology view (requires auth)."""
    success = await orch.topology.update_node_position(node_id, update.metadata)
    if not success:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"success": True, "node_id": node_id}
