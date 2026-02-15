"""Topology and monitoring schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


# --- Topology ---

class TopologyNode(BaseModel):
    id: str
    type: str  # "switch", "router", "host"
    name: str
    dpid: str | None = None
    metadata: dict[str, Any] = {}


class TopologyLink(BaseModel):
    id: str
    source: str
    target: str
    source_port: str = ""
    target_port: str = ""
    bandwidth: int | None = None
    status: str = "up"


class TopologyResponse(BaseModel):
    nodes: list[TopologyNode]
    links: list[TopologyLink]
    timestamp: str = ""


class NodePositionUpdate(BaseModel):
    metadata: dict[str, Any]


# --- Monitoring ---

class ComponentStats(BaseModel):
    bgp_neighbors: int = 0
    ospf_neighbors: int = 0
    total_routes: int = 0


class OVSStats(BaseModel):
    bridges: int = 0
    flows: int = 0


class RyuStats(BaseModel):
    switches: int = 0
    controllers: int = 0


class MonitoringStatsResponse(BaseModel):
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    uptime: int = 0
    api_requests_total: int = 0
    components: dict[str, Any] = {}


class PortStats(BaseModel):
    port_no: int
    name: str
    rx_packets: int = 0
    tx_packets: int = 0
    rx_bytes: int = 0
    tx_bytes: int = 0
    rx_dropped: int = 0
    tx_dropped: int = 0
    rx_errors: int = 0
    tx_errors: int = 0


class PortStatsResponse(BaseModel):
    ports: list[PortStats]


class Event(BaseModel):
    id: str
    timestamp: str
    level: str
    component: str
    message: str


class EventListResponse(BaseModel):
    events: list[Event]
    total: int
