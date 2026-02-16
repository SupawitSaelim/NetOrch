# Architecture Overview

## 1. Introduction

NetOrch is a web-based hybrid network orchestration platform that unifies traditional IP routing (FRRouting) with Software-Defined Networking (Open vSwitch) flow control. The backend runs on the developer's machine (macOS/Linux) and connects to a **Red Hat Enterprise Linux (RHEL) VM** via SSH to manage all networking components.

## 2. System Architecture

### 2.1 Architectural Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                       User Interface Layer                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                 React 19 Web Application                       │  │
│  │  Dashboard │ Topology Builder │ Routing │ Flows │ Monitoring   │  │
│  │  Terminal  │ Router Terminal  │ VRF     │ Tools │ Learn/Labs   │  │
│  │  (Vite 7 + TypeScript + Tailwind CSS 4 + D3.js + xterm.js)   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                          │                    │
                          │ REST API (HTTP)    │ WebSocket (WS)
                          ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Orchestration Layer (Backend)                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    FastAPI Application (:8000)                  │  │
│  │  ┌──────────────┐ ┌─────────────┐ ┌────────────────────────┐  │  │
│  │  │ 45 REST API  │ │ Orchestrator│ │ 2 WebSocket Endpoints  │  │  │
│  │  │ Endpoints    │ │ Service     │ │ (broadcast + terminal) │  │  │
│  │  └──────────────┘ └─────────────┘ └────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
           │                    │                    │
           │ SSH (paramiko)     │ SSH (paramiko)     │ SSH (paramiko)
           ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                RHEL VM — Network Node (192.168.64.3)                 │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐    │
│  │  FRRouting 10.1  │ │  Open vSwitch    │ │  Network         │    │
│  │  ┌────────────┐  │ │  ┌────────────┐  │ │  Namespaces      │    │
│  │  │ BGP (bgpd) │  │ │  │ OVS Bridges│  │ │  ┌────────────┐  │    │
│  │  │ OSPF(ospfd)│  │ │  │ ovs-ofctl  │  │ │  │ Hosts      │  │    │
│  │  │ Zebra      │  │ │  │ ovs-vsctl  │  │ │  │ VRouters   │  │    │
│  │  │ vtysh      │  │ │  │ Flows/Ports│  │ │  │ veth pairs │  │    │
│  │  └────────────┘  │ │  └────────────┘  │ │  └────────────┘  │    │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘    │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  Linux Kernel Networking Stack                  │  │
│  │   Network Namespaces │ veth pairs │ VXLAN/GRE │ ip route      │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Layer Description

| Layer | Responsibility | Technologies |
|-------|----------------|--------------|
| **UI Layer** | User interaction, topology visualization, terminal access, configuration | React 19, TypeScript, D3.js, xterm.js, Chart.js, Zustand |
| **Orchestration Layer** | API gateway, business logic, SSH proxy, WebSocket broadcast | FastAPI, Python, Pydantic v2, python-jose |
| **Control Layer** | Routing protocols, flow management, switch management | FRRouting (vtysh via SSH), OVS (ovs-vsctl/ovs-ofctl via SSH) |
| **Data Plane** | Packet forwarding, tunneling, namespace isolation | Linux Kernel, OVS Datapath, veth pairs, VXLAN/GRE |

## 3. Component Interactions

### 3.1 Control Flow

All backend-to-VM communication uses SSH. The backend never runs networking commands locally — it always executes them on the remote RHEL VM.

```
User Action (GUI)
       │
       ▼
┌──────────────┐
│  REST API    │ ◄── Validates input, JWT auth for writes
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Orchestrator │ ◄── Coordinates across services
└──────┬───────┘
       │
       ├──────────────────┬──────────────────┐
       ▼                  ▼                  ▼
┌────────────┐     ┌────────────┐     ┌────────────┐
│ FRRService │     │ RyuService │     │ OVSService │
│ (SSH+vtysh)│     │(SSH+ofctl) │     │(SSH+vsctl) │
└────────────┘     └────────────┘     └────────────┘
       │                  │                  │
       └──────── SSH to RHEL VM ─────────────┘
```

### 3.2 Integration Points

| Source | Target | Protocol/Method |
|--------|--------|-----------------|
| Frontend | Backend | HTTP REST API + WebSocket |
| Backend | FRRouting (VM) | SSH → `vtysh -c "..."` |
| Backend | OVS flows (VM) | SSH → `ovs-ofctl dump-flows ...` |
| Backend | OVS config (VM) | SSH → `ovs-vsctl ...` |
| Backend | Network namespaces (VM) | SSH → `ip netns exec ...` |
| Backend → WS terminal | VM shell | SSH interactive session (with optional netns) |
| FRR | Linux Kernel | Netlink (Zebra daemon) |

### 3.3 WebSocket Channels

| Endpoint | Purpose |
|----------|---------|
| `/api/v1/ws` | Broadcast channel — pushes monitoring stats, topology, events every 5 seconds |
| `/api/v1/ws/terminal` | Interactive SSH terminal proxy — supports `?shell=bash` or `?shell=vtysh&netns=routerX` |

## 4. Network Modes

The platform supports two operational modes, configurable via `system_mode` setting:

### 4.1 Data Center (DC) Mode

```
┌─────────────────────────────────────────────────┐
│              Overlay Network (VXLAN)              │
│  ┌─────────┐    VNI: 100    ┌─────────┐        │
│  │ Tenant A│◄──────────────►│ Tenant A│        │
│  └─────────┘                └─────────┘        │
│                                                 │
│  ┌─────────┐    VNI: 200    ┌─────────┐        │
│  │ Tenant B│◄──────────────►│ Tenant B│        │
│  └─────────┘                └─────────┘        │
└─────────────────────────────────────────────────┘
                      │
          BGP EVPN Control Plane
                      │
┌─────────────────────────────────────────────────┐
│              Underlay Network (Physical)          │
│         IP Connectivity between VTEPs            │
└─────────────────────────────────────────────────┘
```

- VXLAN overlay with unique VNI per tenant
- BGP EVPN for MAC/IP advertisement
- VRF support for tenant isolation

### 4.2 WAN Mode

```
┌──────────────┐                    ┌──────────────┐
│   Site A     │                    │   Site B     │
│  ┌────────┐  │   GRE/VXLAN       │  ┌────────┐  │
│  │ Router │◄─┼────────────────────┼─►│ Router │  │
│  └────────┘  │     Tunnel         │  └────────┘  │
│      │       │                    │      │       │
│  ┌────────┐  │                    │  ┌────────┐  │
│  │  LAN   │  │                    │  │  LAN   │  │
│  └────────┘  │                    │  └────────┘  │
└──────────────┘                    └──────────────┘
         │                                  │
         └────────── BGP/OSPF ──────────────┘
              (Routing Protocol Peering)
```

- BGP/OSPF for routing information exchange
- GRE or VXLAN tunnels for site interconnection
- Policy-based routing for traffic steering

## 5. Deployment Architecture

### 5.1 Development Setup

```
┌──────────────────────────────────────────┐
│        macOS Development Machine          │
│                                          │
│  ┌──────────┐      ┌──────────┐         │
│  │ React    │      │ FastAPI  │         │
│  │ (Vite)   │─────►│(uvicorn) │         │
│  │ :5173    │ API  │ :8000    │         │
│  └──────────┘      └────┬─────┘         │
│                          │ SSH           │
└──────────────────────────┼──────────────┘
                           │
                           ▼
┌──────────────────────────────────────────┐
│  RHEL VM (UTM) — 192.168.64.3           │
│                                          │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │   FRR    │  │    Open vSwitch      │ │
│  │ (daemon) │  │  ┌─────┐ ┌─────┐    │ │
│  │          │  │  │ br0 │ │ br1 │    │ │
│  └──────────┘  │  └─────┘ └─────┘    │ │
│                └──────────────────────┘ │
│                                          │
│  Network Namespaces (hosts + vrouters)   │
│  veth pairs, VXLAN/GRE tunnels          │
└──────────────────────────────────────────┘
```

### 5.2 Docker Production Setup

```
┌──────────────────────────────────────────┐
│           Docker Compose Host             │
│                                          │
│  ┌──────────────┐  ┌──────────────┐     │
│  │  frontend    │  │   backend    │     │
│  │  nginx:alpine│  │ python:3.11  │     │
│  │  :80 → dist  │  │ :8000        │     │
│  │  /api proxy  │  │ SSH key mount│     │
│  └──────────────┘  └──────┬───────┘     │
│                            │ SSH         │
└────────────────────────────┼────────────┘
                             ▼
                        RHEL VM
```

### 5.3 Port Allocation

| Service | Port | Protocol |
|---------|------|----------|
| Frontend (Vite dev) | 5173 | HTTP |
| Frontend (nginx prod) | 80 | HTTP |
| Backend API | 8000 | HTTP + WS |
| SDN REST API (optional) | 8080 | HTTP |
| OpenFlow Controller | 6633, 6653 | TCP |
| FRR (BGP) | 179 | TCP |

## 6. Topology Builder Architecture

The topology builder provides an EVE-NG style interactive canvas for creating and managing virtual network topologies:

```
┌────────────────────────────────────────────────────────────────┐
│                    Topology Builder (D3.js Canvas)              │
│                                                                │
│  User Actions:                   Backend Actions (on VM):      │
│  • Drag to create link          • ovs-vsctl add-br             │
│  • Right-click context menu     • ip netns add                 │
│  • Click to select/properties   • ip link add veth             │
│  • Auto-layout (D3 force)       • ovs-vsctl add-port           │
│  • Delete nodes/links           • FRR config in netns           │
│                                                                │
│  Node Types:                                                   │
│  🔷 Switch  → OVS bridge                                      │
│  🟢 Host    → network namespace + veth                         │
│  🔴 Router  → network namespace + FRR (bgpd, ospfd, zebra)    │
└────────────────────────────────────────────────────────────────┘
```

The builder has 11 dedicated API endpoints for CRUD operations on switches, hosts, routers, and links.

## 7. Design Principles

### 7.1 SSH-First Communication
All backend-to-VM communication uses SSH key authentication. No agents or daemons are installed on the VM beyond FRR and OVS. This simplifies deployment and security.

### 7.2 Mock Mode Support
Every service can operate in mock mode when its `_ENABLED` flag is `false`. This allows:
- Full frontend/backend development without a VM
- All 47 tests to pass without network access
- CI/CD pipeline to run on standard GitHub runners

### 7.3 Separation of Concerns
- Clear boundaries between UI, orchestration, and control layers
- Each service handles one concern (FRR, OVS, Topology)
- Loose coupling through well-defined REST API

### 7.4 Real-Time Observability
- WebSocket broadcast every 5 seconds with stats, topology, events
- Frontend auto-subscribes and updates via custom `useWebSocket` hook
- Monitoring page with Chart.js for CPU/memory/traffic visualization

## 8. Security

### 8.1 Authentication
- JWT-based authentication via python-jose
- Login endpoint: POST `/api/v1/auth/login` (default: admin / admin123)
- All write operations (POST/PUT/DELETE on protected endpoints) require `Authorization: Bearer <token>`
- Read operations are public (no token required)

### 8.2 Network Security
- SSH key authentication to VM (Ed25519)
- JWT secret key configurable via `SECRET_KEY` environment variable
- CORS enabled for development (configurable origins)
