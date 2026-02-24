"""Phase 3 / Advanced feature stub endpoints.

These endpoints return placeholder responses to establish the API surface
for features that will be fully implemented in a future phase:

- Failure simulation (link down, node failure)
- Traffic engineering and policy-based path selection
- Metrics export (Prometheus / JSON)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user

router = APIRouter(tags=["Advanced (Phase 3)"])


# ── Failure Simulation ──────────────────────────────────────────


@router.post("/simulate/link-down")
async def simulate_link_down(
    link_id: str,
    _user: dict = Depends(get_current_user),
):
    """Simulate a link failure (Phase 3 stub).

    Will bring down a specific link to observe failover behavior.
    """
    raise HTTPException(
        status_code=501,
        detail="Link failure simulation is planned for Phase 3",
    )


@router.post("/simulate/node-failure")
async def simulate_node_failure(
    node_id: str,
    _user: dict = Depends(get_current_user),
):
    """Simulate a node failure (Phase 3 stub).

    Will isolate a node (router/switch) to test redundancy.
    """
    raise HTTPException(
        status_code=501,
        detail="Node failure simulation is planned for Phase 3",
    )


@router.post("/simulate/restore")
async def simulate_restore(
    _user: dict = Depends(get_current_user),
):
    """Restore all simulated failures (Phase 3 stub)."""
    raise HTTPException(
        status_code=501,
        detail="Failure restoration is planned for Phase 3",
    )


# ── Traffic Engineering ─────────────────────────────────────────


@router.get("/traffic/policies")
async def list_traffic_policies(
    _user: dict = Depends(get_current_user),
):
    """List traffic engineering policies (Phase 3 stub)."""
    return {"policies": [], "total": 0, "note": "Traffic engineering is planned for Phase 3"}


@router.post("/traffic/policies")
async def create_traffic_policy(
    _user: dict = Depends(get_current_user),
):
    """Create a traffic engineering policy (Phase 3 stub)."""
    raise HTTPException(
        status_code=501,
        detail="Traffic policy creation is planned for Phase 3",
    )


# ── Metrics Export ──────────────────────────────────────────────


@router.get("/metrics/export")
async def export_metrics():
    """Export platform metrics in JSON format (Phase 3 stub).

    Future: Support Prometheus exposition format and OTEL.
    """
    return {
        "format": "json",
        "metrics": {},
        "note": "Metrics export is planned for Phase 3",
    }
