"""Monitoring and statistics endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_orchestrator
from app.api.v1.ws import manager as ws_manager
from app.schemas.topology import (
    Event,
    EventListResponse,
    MonitoringStatsResponse,
    PortStats,
    PortStatsResponse,
)
from app.services.orchestrator import Orchestrator

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])

# Seed a few events into the WebSocket manager so the list isn't empty
_SEED_EVENTS = [
    ("info", "bgp", "BGP neighbor 10.0.0.2 state changed to Established"),
    ("info", "ovs", "Bridge br0 created"),
    ("warning", "ryu", "High CPU usage detected on Ryu controller"),
    ("info", "system", "Platform started in DC mode"),
]


def _ensure_seed_events():
    """Push seed events once (when fewer than 5 events exist)."""
    if len(ws_manager.events) < 5:
        for level, comp, msg in reversed(_SEED_EVENTS):
            ws_manager.push_event(level, comp, msg)


@router.get("/stats", response_model=MonitoringStatsResponse)
async def get_stats(orch: Orchestrator = Depends(get_orchestrator)):
    """Get aggregated system statistics."""
    data = await orch.get_monitoring_stats()
    return MonitoringStatsResponse(**data)


@router.get("/ports/{dpid}", response_model=PortStatsResponse)
async def get_port_stats(
    dpid: str,
    port_no: int | None = Query(None),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Get port statistics for a switch."""
    # Mock port stats
    ports = [
        PortStats(
            port_no=1, name="eth0",
            rx_packets=100000, tx_packets=95000,
            rx_bytes=10240000, tx_bytes=9728000,
        ),
        PortStats(
            port_no=2, name="eth1",
            rx_packets=80000, tx_packets=75000,
            rx_bytes=8192000, tx_bytes=7680000,
        ),
    ]
    if port_no is not None:
        ports = [p for p in ports if p.port_no == port_no]
    return PortStatsResponse(ports=ports)


@router.get("/events", response_model=EventListResponse)
async def get_events(
    level: str | None = Query(None, description="Filter by level"),
    limit: int = Query(100, ge=1, le=1000),
):
    """Get system events/logs (backed by real-time event store)."""
    _ensure_seed_events()
    raw = ws_manager.events
    events = [Event(**e) for e in raw]
    if level:
        events = [e for e in events if e.level == level]
    events = events[:limit]
    return EventListResponse(events=events, total=len(events))
