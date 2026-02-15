"""Routing-related schemas."""

from __future__ import annotations

from pydantic import BaseModel


class Route(BaseModel):
    destination: str
    next_hop: str
    protocol: str
    metric: int = 0
    interface: str = ""
    uptime: str = ""
    selected: bool = True
    fib: bool = True


class RouteListResponse(BaseModel):
    routes: list[Route]
    total: int


class StaticRouteRequest(BaseModel):
    destination: str
    next_hop: str
    metric: int = 100
    description: str = ""


class StaticRouteResponse(BaseModel):
    success: bool
    route: Route | None = None


# --- BGP ---

class BGPNeighborSummary(BaseModel):
    neighbor: str
    remote_as: int
    state: str
    uptime: str = ""
    prefixes_received: int = 0
    prefixes_sent: int = 0


class BGPSummaryResponse(BaseModel):
    local_as: int
    router_id: str
    total_neighbors: int
    established: int
    neighbors: list[BGPNeighborSummary]


class BGPNeighborDetail(BaseModel):
    neighbor: str
    remote_as: int
    description: str = ""
    state: str = "Idle"
    uptime: str = ""
    local_address: str = ""
    local_port: int = 179
    remote_port: int = 0
    hold_time: int = 180
    keepalive: int = 60
    prefixes_received: int = 0
    prefixes_sent: int = 0


class BGPNeighborRequest(BaseModel):
    neighbor: str
    remote_as: int
    description: str = ""
    update_source: str = ""
    ebgp_multihop: int = 0
    password: str = ""
    address_families: list[str] = ["ipv4_unicast"]


class BGPNeighborListResponse(BaseModel):
    neighbors: list[BGPNeighborDetail]


# --- OSPF ---

class OSPFArea(BaseModel):
    area_id: str
    type: str = "normal"
    interfaces: int = 0
    neighbors: int = 0


class OSPFSummaryResponse(BaseModel):
    router_id: str
    areas: list[OSPFArea]
    total_routes: int = 0


class OSPFNeighbor(BaseModel):
    neighbor_id: str
    priority: int = 1
    state: str
    address: str
    interface: str
    dead_time: str = ""


class OSPFNeighborListResponse(BaseModel):
    neighbors: list[OSPFNeighbor]


class OSPFInterfaceRequest(BaseModel):
    interface: str
    area: str = "0.0.0.0"
    cost: int = 10
    priority: int = 1
    network_type: str = "broadcast"
