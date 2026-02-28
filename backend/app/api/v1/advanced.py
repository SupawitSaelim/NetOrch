"""Phase 3 Advanced feature endpoints — fully implemented.

Features:
- Failure simulation (link down, node failure, selective/full restore)
- Traffic engineering (policy CRUD, enable/disable)
- Metrics export (Prometheus exposition format + JSON)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Response

from app.api.deps import get_current_user, require_role
from app.services.advanced_service import failure_simulator, traffic_engineer, metrics_exporter
from app.services import audit

router = APIRouter(tags=["Advanced (Phase 3)"])


# ── Failure Simulation ──────────────────────────────────────────


@router.get("/simulate/failures")
async def list_active_failures(
    _user: dict = Depends(get_current_user),
):
    """List all currently active simulated failures."""
    return {
        "failures": failure_simulator.active_failures,
        "total": len(failure_simulator.active_failures),
    }


@router.post("/simulate/link-down")
async def simulate_link_down(
    body: dict[str, Any] = Body(..., examples=[{"link_id": "veth-sw1-h1"}]),
    user: dict = Depends(require_role("admin", "operator")),
):
    """Simulate a link failure by bringing an OVS port / veth interface down.

    This is useful for testing failover behavior (e.g. BGP reconvergence,
    OSPF re-routing) without physically disconnecting cables.
    """
    link_id = body.get("link_id", "").strip()
    if not link_id:
        raise HTTPException(status_code=400, detail="link_id is required")

    result = await failure_simulator.simulate_link_down(link_id)

    if result.get("success"):
        audit.record(
            user=user["username"],
            role=user["role"],
            action="simulate_link_down",
            resource=f"link/{link_id}",
            detail=f"Link '{link_id}' brought down for failure simulation",
        )

    return result


@router.post("/simulate/node-failure")
async def simulate_node_failure(
    body: dict[str, Any] = Body(..., examples=[{"node_id": "sw1"}]),
    user: dict = Depends(require_role("admin", "operator")),
):
    """Simulate a node failure by isolating a switch or network namespace.

    For OVS switches: disables all ports on the bridge.
    For hosts/routers (netns): brings down all non-loopback interfaces.
    """
    node_id = body.get("node_id", "").strip()
    if not node_id:
        raise HTTPException(status_code=400, detail="node_id is required")

    result = await failure_simulator.simulate_node_failure(node_id)

    if result.get("success"):
        audit.record(
            user=user["username"],
            role=user["role"],
            action="simulate_node_failure",
            resource=f"node/{node_id}",
            detail=f"Node '{node_id}' isolated for failure simulation",
        )

    return result


@router.post("/simulate/restore")
async def simulate_restore(
    user: dict = Depends(require_role("admin", "operator")),
):
    """Restore all simulated failures — re-enable all disabled links and nodes."""
    result = await failure_simulator.restore_all()

    audit.record(
        user=user["username"],
        role=user["role"],
        action="simulate_restore_all",
        resource="simulation",
        detail=f"Restored {result.get('restored', 0)} failure(s)",
    )

    return result


@router.post("/simulate/restore/{target_id}")
async def simulate_restore_one(
    target_id: str,
    user: dict = Depends(require_role("admin", "operator")),
):
    """Restore a single simulated failure by target ID."""
    result = await failure_simulator.restore_one(target_id)

    if result.get("success"):
        audit.record(
            user=user["username"],
            role=user["role"],
            action="simulate_restore",
            resource=f"simulation/{target_id}",
            detail=f"Restored failure for '{target_id}'",
        )

    return result


# ── Traffic Engineering ─────────────────────────────────────────


@router.get("/traffic/policies")
async def list_traffic_policies(
    _user: dict = Depends(get_current_user),
):
    """List all traffic engineering policies."""
    return await traffic_engineer.list_policies()


@router.get("/traffic/policies/{policy_id}")
async def get_traffic_policy(
    policy_id: str,
    _user: dict = Depends(get_current_user),
):
    """Get a specific traffic engineering policy by ID."""
    policy = await traffic_engineer.get_policy(policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail=f"Policy '{policy_id}' not found")
    return policy


@router.post("/traffic/policies")
async def create_traffic_policy(
    body: dict[str, Any] = Body(
        ...,
        examples=[
            {
                "name": "Route DC traffic",
                "description": "Route data center subnet via spine",
                "match": {"src_ip": "10.0.0.0/24", "dst_ip": "10.0.1.0/24", "protocol": "tcp"},
                "action": {"type": "forward", "output_port": 2},
                "priority": 200,
            }
        ],
    ),
    user: dict = Depends(require_role("admin", "operator")),
):
    """Create a traffic engineering policy.

    Match fields:
    - src_ip, dst_ip: CIDR notation
    - protocol: tcp / udp / icmp
    - in_port: OVS ingress port number
    - bridge: target OVS bridge (default: br0)

    Action types:
    - forward: send to output_port
    - drop: drop matching packets
    - qos: apply queue ID
    - mirror: copy to mirror_port
    """
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="'name' is required")

    result = await traffic_engineer.create_policy(
        name=name,
        description=body.get("description", ""),
        match=body.get("match", {}),
        action=body.get("action", {}),
        priority=body.get("priority", 100),
    )

    if result.get("success"):
        audit.record(
            user=user["username"],
            role=user["role"],
            action="create_traffic_policy",
            resource=f"policy/{result['policy']['id']}",
            detail=f"Created traffic policy '{name}'",
        )

    return result


@router.put("/traffic/policies/{policy_id}")
async def update_traffic_policy(
    policy_id: str,
    body: dict[str, Any] = Body(...),
    user: dict = Depends(require_role("admin", "operator")),
):
    """Update a traffic engineering policy."""
    result = await traffic_engineer.update_policy(policy_id, body)

    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Not found"))

    audit.record(
        user=user["username"],
        role=user["role"],
        action="update_traffic_policy",
        resource=f"policy/{policy_id}",
        detail=f"Updated traffic policy '{policy_id}'",
    )

    return result


@router.delete("/traffic/policies/{policy_id}")
async def delete_traffic_policy(
    policy_id: str,
    user: dict = Depends(require_role("admin", "operator")),
):
    """Delete a traffic engineering policy."""
    result = await traffic_engineer.delete_policy(policy_id)

    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Not found"))

    audit.record(
        user=user["username"],
        role=user["role"],
        action="delete_traffic_policy",
        resource=f"policy/{policy_id}",
        detail=f"Deleted traffic policy '{policy_id}'",
    )

    return result


@router.post("/traffic/policies/{policy_id}/toggle")
async def toggle_traffic_policy(
    policy_id: str,
    user: dict = Depends(require_role("admin", "operator")),
):
    """Enable or disable a traffic engineering policy."""
    result = await traffic_engineer.toggle_policy(policy_id)

    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Not found"))

    audit.record(
        user=user["username"],
        role=user["role"],
        action="toggle_traffic_policy",
        resource=f"policy/{policy_id}",
        detail=f"Toggled policy: now {'enabled' if result['policy']['enabled'] else 'disabled'}",
    )

    return result


# ── Metrics Export ──────────────────────────────────────────────


@router.get("/metrics/export")
async def export_metrics_json():
    """Export platform metrics in structured JSON format.

    Returns comprehensive metrics including system health, resource usage,
    and networking component statistics.
    """
    return await metrics_exporter.export_json()


@router.get("/metrics/prometheus")
async def export_metrics_prometheus():
    """Export platform metrics in Prometheus exposition text format.

    Can be scraped directly by a Prometheus server or compatible collectors.
    """
    text = await metrics_exporter.export_prometheus()
    return Response(
        content=text,
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )
