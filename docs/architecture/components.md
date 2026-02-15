# Component Design

## 1. Overview

This document provides detailed specifications for each component in the Hybrid SDN Orchestration Platform.

## 2. Frontend (React Application)

### 2.1 Technology Stack

| Technology | Purpose |
|------------|---------|
| React 18+ | UI Framework |
| TypeScript | Type Safety |
| Vite | Build Tool |
| React Router | Navigation |
| TanStack Query | Data Fetching/Caching |
| Zustand | State Management |
| Tailwind CSS | Styling |
| vis.js / D3.js | Topology Visualization |
| Axios | HTTP Client |

### 2.2 Application Structure

```
frontend/
├── public/
├── src/
│   ├── api/                 # API client modules
│   │   ├── client.ts        # Axios instance
│   │   ├── routing.ts       # Routing API calls
│   │   ├── sdn.ts           # SDN API calls
│   │   ├── topology.ts      # Topology API calls
│   │   └── types.ts         # API response types
│   │
│   ├── components/          # Reusable UI components
│   │   ├── common/          # Buttons, Forms, Modals
│   │   ├── layout/          # Header, Sidebar, Footer
│   │   ├── topology/        # Network topology components
│   │   └── tables/          # Data tables
│   │
│   ├── features/            # Feature-based modules
│   │   ├── dashboard/       # Dashboard feature
│   │   ├── routing/         # Routing management
│   │   ├── flows/           # SDN flow management
│   │   ├── topology/        # Topology view
│   │   └── monitoring/      # Monitoring & stats
│   │
│   ├── hooks/               # Custom React hooks
│   ├── stores/              # Zustand stores
│   ├── utils/               # Utility functions
│   ├── types/               # TypeScript types
│   │
│   ├── App.tsx              # Root component
│   ├── main.tsx             # Entry point
│   └── router.tsx           # Route definitions
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

### 2.3 Key Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Overview of system status, quick stats, alerts |
| **Topology View** | Interactive network topology visualization |
| **Routing Config** | BGP/OSPF neighbor management, route tables |
| **Flow Management** | SDN flow rules, policy configuration |
| **Monitoring** | Real-time metrics, traffic statistics |
| **Settings** | System configuration, user preferences |

### 2.4 UI Wireframes

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo]  Hybrid SDN Platform          [User] [Notifications] ⚙  │
├────────┬────────────────────────────────────────────────────────┤
│        │                                                         │
│ 📊     │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│ Dash   │  │   Nodes     │  │   Links     │  │   Flows     │    │
│        │  │     12      │  │     24      │  │    156      │    │
│ 🌐     │  └─────────────┘  └─────────────┘  └─────────────┘    │
│ Topo   │                                                         │
│        │  ┌───────────────────────────────────────────────────┐ │
│ 🛣️     │  │                                                   │ │
│ Routes │  │              Topology Visualization               │ │
│        │  │                                                   │ │
│ 📡     │  │         [Node]────[Link]────[Node]               │ │
│ Flows  │  │                                                   │ │
│        │  └───────────────────────────────────────────────────┘ │
│ 📈     │                                                         │
│ Monitor│  ┌─────────────────────┐  ┌──────────────────────────┐ │
│        │  │   Recent Events     │  │   Active Alerts          │ │
│ ⚙️     │  │   • Link up br0     │  │   ⚠️ High CPU on Ryu    │ │
│ Config │  │   • BGP peer up     │  │                          │ │
│        │  └─────────────────────┘  └──────────────────────────┘ │
└────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Backend (FastAPI Application)

### 3.1 Technology Stack

| Technology | Purpose |
|------------|---------|
| Python 3.11+ | Runtime |
| FastAPI | Web Framework |
| Uvicorn | ASGI Server |
| Pydantic | Data Validation |
| SQLAlchemy | ORM (optional) |
| Celery | Background Tasks (optional) |
| Python-jose | JWT Authentication |

### 3.2 Application Structure

```
backend/
├── app/
│   ├── api/                  # API routes
│   │   ├── __init__.py
│   │   ├── deps.py           # Dependencies
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── router.py     # Main router
│   │   │   ├── routing.py    # Routing endpoints
│   │   │   ├── sdn.py        # SDN endpoints
│   │   │   ├── topology.py   # Topology endpoints
│   │   │   └── monitoring.py # Monitoring endpoints
│   │   └── health.py         # Health check
│   │
│   ├── core/                 # Core configuration
│   │   ├── __init__.py
│   │   ├── config.py         # Settings
│   │   └── security.py       # Auth utilities
│   │
│   ├── services/             # Business logic
│   │   ├── __init__.py
│   │   ├── orchestrator.py   # Main orchestrator
│   │   ├── frr_service.py    # FRRouting interface
│   │   ├── ryu_service.py    # Ryu interface
│   │   ├── ovs_service.py    # OVS interface
│   │   └── topology_service.py
│   │
│   ├── models/               # Data models
│   │   ├── __init__.py
│   │   ├── routing.py
│   │   ├── sdn.py
│   │   └── topology.py
│   │
│   ├── schemas/              # Pydantic schemas
│   │   ├── __init__.py
│   │   ├── routing.py
│   │   ├── sdn.py
│   │   └── common.py
│   │
│   └── main.py               # Application entry
│
├── tests/                    # Unit tests
├── requirements.txt
├── Dockerfile
└── pyproject.toml
```

### 3.3 Service Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│                      OrchestratorService                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  • Coordinates actions across all sub-services         │ │
│  │  • Manages system state and configuration              │ │
│  │  • Handles transaction-like operations                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           │              │               │
           ▼              ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  FRRService  │  │  RyuService  │  │  OVSService  │
├──────────────┤  ├──────────────┤  ├──────────────┤
│• get_routes  │  │• get_flows   │  │• list_bridges│
│• add_neighbor│  │• add_flow    │  │• add_port    │
│• config_bgp  │  │• del_flow    │  │• del_bridge  │
│• get_status  │  │• get_stats   │  │• get_flows   │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 3.4 Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/routing/routes` | Get routing table |
| POST | `/api/v1/routing/neighbors` | Add BGP/OSPF neighbor |
| GET | `/api/v1/sdn/flows` | Get all flow rules |
| POST | `/api/v1/sdn/flows` | Add flow rule |
| GET | `/api/v1/topology` | Get network topology |
| GET | `/api/v1/monitoring/stats` | Get statistics |

---

## 4. FRRouting Integration

### 4.1 Overview

FRRouting (FRR) provides the routing protocol implementation (BGP, OSPF, etc.).

### 4.2 Interface Methods

| Method | Description | Implementation |
|--------|-------------|----------------|
| vtysh CLI | Command-line interface | subprocess + parsing |
| Management Protocol | FRR API (experimental) | HTTP/gRPC |
| Configuration Files | Direct config modification | Jinja2 templates |

### 4.3 FRR Service Interface

```python
class FRRService:
    """Interface to FRRouting daemon."""
    
    async def get_routing_table(self, protocol: str = "all") -> List[Route]:
        """Get routes from routing table."""
        
    async def get_bgp_neighbors(self) -> List[BGPNeighbor]:
        """Get BGP neighbor status."""
        
    async def add_bgp_neighbor(self, neighbor: BGPNeighborConfig) -> bool:
        """Add BGP neighbor configuration."""
        
    async def get_ospf_neighbors(self) -> List[OSPFNeighbor]:
        """Get OSPF neighbor status."""
        
    async def reload_config(self) -> bool:
        """Reload FRR configuration."""
```

### 4.4 Configuration Template Example

```jinja2
! BGP Configuration
router bgp {{ asn }}
 bgp router-id {{ router_id }}
 {% for neighbor in neighbors %}
 neighbor {{ neighbor.ip }} remote-as {{ neighbor.remote_as }}
 neighbor {{ neighbor.ip }} description {{ neighbor.description }}
 {% endfor %}
 !
 address-family ipv4 unicast
  {% for network in networks %}
  network {{ network }}
  {% endfor %}
 exit-address-family
!
```

---

## 5. Ryu SDN Controller

### 5.1 Overview

Ryu is the SDN controller that manages OpenFlow flow rules on switches.

### 5.2 Custom Ryu Application

```
ryu_app/
├── __init__.py
├── orchestration_app.py    # Main Ryu application
├── flow_manager.py         # Flow rule management
├── packet_handler.py       # Packet-in handling
├── rest_api.py             # Custom REST endpoints
└── topology_discovery.py   # LLDP-based discovery
```

### 5.3 Ryu Service Interface

```python
class RyuService:
    """Interface to Ryu SDN Controller."""
    
    def __init__(self, ryu_url: str = "http://localhost:8080"):
        self.base_url = ryu_url
        
    async def get_switches(self) -> List[Switch]:
        """Get all connected OpenFlow switches."""
        
    async def get_flows(self, dpid: str) -> List[FlowRule]:
        """Get flow rules for a switch."""
        
    async def add_flow(self, dpid: str, flow: FlowRule) -> bool:
        """Add flow rule to switch."""
        
    async def delete_flow(self, dpid: str, flow_id: str) -> bool:
        """Delete flow rule from switch."""
        
    async def get_stats(self, dpid: str) -> SwitchStats:
        """Get port and flow statistics."""
```

### 5.4 Flow Rule Schema

```python
class FlowRule(BaseModel):
    dpid: str                    # Switch datapath ID
    priority: int = 100          # Rule priority
    match: Dict[str, Any]        # Match conditions
    actions: List[Dict]          # Actions to perform
    idle_timeout: int = 0        # Idle timeout
    hard_timeout: int = 0        # Hard timeout
    
    # Example:
    # match: {"in_port": 1, "eth_type": 0x0800, "ipv4_dst": "10.0.0.0/24"}
    # actions: [{"type": "OUTPUT", "port": 2}]
```

---

## 6. Open vSwitch (OVS)

### 6.1 Overview

OVS provides the data plane for packet forwarding and flow-based switching.

### 6.2 OVS Service Interface

```python
class OVSService:
    """Interface to Open vSwitch."""
    
    async def list_bridges(self) -> List[Bridge]:
        """List all OVS bridges."""
        
    async def create_bridge(self, name: str, protocols: List[str] = None) -> bool:
        """Create OVS bridge."""
        
    async def delete_bridge(self, name: str) -> bool:
        """Delete OVS bridge."""
        
    async def add_port(self, bridge: str, port: str, **options) -> bool:
        """Add port to bridge."""
        
    async def set_controller(self, bridge: str, controller_url: str) -> bool:
        """Set OpenFlow controller for bridge."""
        
    async def create_vxlan_port(
        self, 
        bridge: str, 
        port_name: str,
        remote_ip: str,
        vni: int
    ) -> bool:
        """Create VXLAN tunnel port."""
```

### 6.3 Command Mapping

| Operation | OVS Command |
|-----------|-------------|
| Create bridge | `ovs-vsctl add-br <name>` |
| Delete bridge | `ovs-vsctl del-br <name>` |
| Add port | `ovs-vsctl add-port <br> <port>` |
| Set controller | `ovs-vsctl set-controller <br> tcp:<ip>:<port>` |
| Get flows | `ovs-ofctl dump-flows <br>` |
| Add VXLAN | `ovs-vsctl add-port <br> <port> -- set interface <port> type=vxlan options:remote_ip=<ip> options:key=<vni>` |

---

## 7. Topology Discovery Service

### 7.1 Discovery Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| LLDP | Link Layer Discovery Protocol | Physical topology |
| OpenFlow | Switch/port discovery via controller | SDN topology |
| Config-based | Manual or file-based topology | Static topology |

### 7.2 Topology Data Model

```python
class Node(BaseModel):
    id: str
    type: Literal["switch", "router", "host"]
    name: str
    metadata: Dict[str, Any] = {}

class Link(BaseModel):
    id: str
    source: str           # Source node ID
    target: str           # Target node ID
    source_port: str
    target_port: str
    bandwidth: Optional[int] = None
    status: Literal["up", "down"] = "up"

class Topology(BaseModel):
    nodes: List[Node]
    links: List[Link]
    timestamp: datetime
```

---

## 8. State Management

### 8.1 State Store

```python
class StateManager:
    """Manages system configuration and runtime state."""
    
    def __init__(self, state_file: str = "state.json"):
        self.state_file = state_file
        self._state: Dict = {}
        
    async def load(self) -> None:
        """Load state from file."""
        
    async def save(self) -> None:
        """Persist state to file."""
        
    async def get(self, key: str, default: Any = None) -> Any:
        """Get state value."""
        
    async def set(self, key: str, value: Any) -> None:
        """Set state value."""
```

### 8.2 State Schema

```json
{
  "version": "1.0.0",
  "mode": "dc",
  "routing": {
    "frr_config_path": "/etc/frr/frr.conf",
    "bgp": {
      "asn": 65001,
      "router_id": "10.0.0.1"
    }
  },
  "sdn": {
    "controller_ip": "127.0.0.1",
    "controller_port": 6633
  },
  "switches": [
    {
      "name": "br0",
      "dpid": "0000000000000001",
      "ports": ["eth0", "eth1"]
    }
  ],
  "topology": {
    "nodes": [...],
    "links": [...]
  }
}
```

---

## 9. Error Handling

### 9.1 Error Categories

| Category | HTTP Code | Description |
|----------|-----------|-------------|
| Validation Error | 400 | Invalid input data |
| Authentication Error | 401 | Missing/invalid token |
| Authorization Error | 403 | Insufficient permissions |
| Not Found | 404 | Resource not found |
| Conflict | 409 | Resource conflict |
| Service Error | 500 | Internal service failure |
| External Service Error | 502 | FRR/Ryu/OVS failure |

### 9.2 Error Response Schema

```python
class ErrorResponse(BaseModel):
    error: str                    # Error code
    message: str                  # Human-readable message
    details: Optional[Dict] = None  # Additional details
    timestamp: datetime
```

---

## 10. Logging & Monitoring

### 10.1 Log Format

```
{timestamp} [{level}] {component}: {message} {context}
```

Example:
```
2026-02-15T10:30:00Z [INFO] orchestrator: BGP neighbor added {"neighbor": "10.0.0.2", "asn": 65002}
```

### 10.2 Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `api_requests_total` | Counter | Total API requests |
| `api_request_duration` | Histogram | Request latency |
| `frr_bgp_neighbors` | Gauge | Number of BGP neighbors |
| `ovs_flows_total` | Gauge | Total flow rules |
| `topology_links_up` | Gauge | Active link count |
