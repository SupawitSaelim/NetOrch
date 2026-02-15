"""SDN flow and switch management schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


# --- Flows ---

class FlowAction(BaseModel):
    type: str
    port: int | None = None
    field: str | None = None
    value: str | None = None


class FlowMatch(BaseModel):
    in_port: int | None = None
    eth_type: int | None = None
    eth_src: str | None = None
    eth_dst: str | None = None
    ipv4_src: str | None = None
    ipv4_dst: str | None = None
    ip_proto: int | None = None
    tcp_src: int | None = None
    tcp_dst: int | None = None
    udp_src: int | None = None
    udp_dst: int | None = None


class FlowRule(BaseModel):
    id: str = ""
    dpid: str
    table_id: int = 0
    priority: int = 100
    match: dict[str, Any]
    actions: list[dict[str, Any]]
    packet_count: int = 0
    byte_count: int = 0
    idle_timeout: int = 0
    hard_timeout: int = 0


class FlowListResponse(BaseModel):
    flows: list[FlowRule]
    total: int


class FlowCreateRequest(BaseModel):
    dpid: str
    table_id: int = 0
    priority: int = 100
    match: dict[str, Any]
    actions: list[dict[str, Any]]
    idle_timeout: int = 0
    hard_timeout: int = 0


class FlowCreateResponse(BaseModel):
    success: bool
    flow_id: str = ""


class FlowStatsResponse(BaseModel):
    flow_id: str
    packet_count: int = 0
    byte_count: int = 0
    duration_sec: int = 0
    duration_nsec: int = 0


# --- Switches ---

class SwitchPort(BaseModel):
    port_no: int
    name: str
    hw_addr: str = ""
    state: str = "up"


class Switch(BaseModel):
    dpid: str
    name: str
    connected: bool = True
    controller: str = ""
    ports: list[SwitchPort] = []


class SwitchListResponse(BaseModel):
    switches: list[Switch]


class BridgeCreateRequest(BaseModel):
    name: str
    protocols: list[str] = ["OpenFlow13"]
    controller: str = "tcp:127.0.0.1:6633"
    datapath_type: str = "system"


class PortAddRequest(BaseModel):
    port_name: str
    type: str = "system"
    vlan_mode: str | None = None
    tag: int | None = None


class VxlanPortRequest(BaseModel):
    port_name: str
    remote_ip: str
    vni: int
    dst_port: int = 4789


# --- Policies ---

class Policy(BaseModel):
    id: str = ""
    name: str
    enabled: bool = True
    priority: int = 100
    match: dict[str, Any] = {}
    action: str = "drop"
    action_params: dict[str, Any] = {}
    created_at: str = ""


class PolicyListResponse(BaseModel):
    policies: list[Policy]


class PolicyCreateRequest(BaseModel):
    name: str
    priority: int = 100
    match: dict[str, Any] = {}
    action: str = "drop"
    action_params: dict[str, Any] = {}
