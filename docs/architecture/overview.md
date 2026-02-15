# Architecture Overview

## 1. Introduction

The Hybrid SDN Orchestration Platform is a web-based system that unifies traditional IP routing with Software-Defined Networking (SDN) flow control. This document describes the high-level architecture and design principles.

## 2. System Architecture

### 2.1 Architectural Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Interface Layer                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    React Web Application                       │  │
│  │  • Dashboard  • Topology View  • Config Panel  • Monitoring   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP/REST
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Orchestration Layer (Backend)                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      FastAPI Application                       │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐  │  │
│  │  │ REST API    │ │ Orchestrator│ │ State Manager           │  │  │
│  │  │ Endpoints   │ │ Service     │ │ (Config + Runtime)      │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
           │                    │                    │
           │                    │                    │
           ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Routing Engine  │  │  SDN Controller  │  │  Switch Manager  │
│  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌────────────┐  │
│  │ FRRouting  │  │  │  │    Ryu     │  │  │  │    OVS     │  │
│  │            │  │  │  │            │  │  │  │            │  │
│  │ • BGP      │  │  │  │ • Flow Mgr │  │  │  │ • Bridges  │  │
│  │ • OSPF     │  │  │  │ • Packet-In│  │  │  │ • Ports    │  │
│  │ • EVPN     │  │  │  │ • REST API │  │  │  │ • Flows    │  │
│  └────────────┘  │  │  └────────────┘  │  │  └────────────┘  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
           │                    │                    │
           └────────────────────┴────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Data Plane Layer                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  Linux Kernel Networking Stack                 │  │
│  │  • Netlink  • iptables  • Network Namespaces  • VXLAN/GRE    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Layer Description

| Layer | Responsibility | Technologies |
|-------|----------------|--------------|
| **UI Layer** | User interaction, visualization, configuration | React, TypeScript, D3.js/vis.js |
| **Orchestration Layer** | API gateway, business logic, state management | FastAPI, Python |
| **Control Layer** | Routing protocols, flow control, switch management | FRRouting, Ryu, OVS |
| **Data Plane** | Packet forwarding, tunneling, kernel networking | Linux Kernel, OVS Datapath |

## 3. Component Interactions

### 3.1 Control Flow

```
User Action (GUI)
       │
       ▼
┌──────────────┐
│  REST API    │ ◄─── Validates input, returns response
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Orchestrator │ ◄─── Translates to system commands
└──────┬───────┘
       │
       ├──────────────────┬──────────────────┐
       ▼                  ▼                  ▼
┌────────────┐     ┌────────────┐     ┌────────────┐
│    FRR     │     │    Ryu     │     │    OVS     │
│ (vtysh/API)│     │ (REST API) │     │ (ovs-vsctl)│
└────────────┘     └────────────┘     └────────────┘
```

### 3.2 Integration Points

| Source | Target | Protocol/Method |
|--------|--------|-----------------|
| Frontend | Backend | HTTP REST API |
| Backend | FRRouting | vtysh CLI / FRR Management API |
| Backend | Ryu | HTTP REST API |
| Backend | OVS | ovs-vsctl / OVSDB |
| Ryu | OVS | OpenFlow 1.3+ |
| FRR | Linux Kernel | Netlink (Zebra) |

## 4. Network Modes

### 4.1 Data Center (DC) Mode

```
┌─────────────────────────────────────────────────┐
│              Overlay Network (VXLAN)            │
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
│              Underlay Network (Physical)         │
│         IP Connectivity between VTEPs           │
└─────────────────────────────────────────────────┘
```

**Key Features:**
- VXLAN overlay with unique VNI per tenant
- BGP EVPN for MAC/IP advertisement
- Distributed L2/L3 gateway support

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

**Key Features:**
- BGP/OSPF for routing information exchange
- GRE or VXLAN tunnels for site interconnection
- Policy-based routing for traffic steering

## 5. Single-Node Deployment (Phase 1)

### 5.1 Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Linux VM / Host                      │
│  ┌─────────────────────────────────────────────────┐    │
│  │                 Application Stack                │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │    │
│  │  │  React   │  │  FastAPI │  │   Ryu    │      │    │
│  │  │  (nginx) │  │ (uvicorn)│  │ (python) │      │    │
│  │  │  :80     │  │  :8000   │  │  :6633   │      │    │
│  │  └──────────┘  └──────────┘  └──────────┘      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Network Infrastructure              │    │
│  │  ┌──────────┐  ┌──────────────────────────┐    │    │
│  │  │   FRR    │  │      Open vSwitch        │    │    │
│  │  │ (daemon) │  │  ┌─────┐ ┌─────┐ ┌─────┐│    │    │
│  │  │          │  │  │ br0 │ │ br1 │ │ br2 ││    │    │
│  │  └──────────┘  │  └─────┘ └─────┘ └─────┘│    │    │
│  │                └──────────────────────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Linux Network Stack                 │    │
│  │    veth pairs, namespaces, VXLAN/GRE tunnels    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Port Allocation

| Service | Port | Protocol |
|---------|------|----------|
| Web GUI (nginx) | 80, 443 | HTTP/HTTPS |
| Backend API | 8000 | HTTP |
| Ryu REST API | 8080 | HTTP |
| OpenFlow Controller | 6633, 6653 | TCP |
| FRR (BGP) | 179 | TCP |
| FRR Management | 2601-2609 | TCP |

## 6. Design Principles

### 6.1 Separation of Concerns
- Clear boundaries between UI, orchestration, and control layers
- Each component has a single responsibility
- Loose coupling through well-defined APIs

### 6.2 Modularity
- Components can be developed and tested independently
- Easy to replace or upgrade individual components
- Support for gradual feature rollout

### 6.3 Extensibility
- Plugin architecture for custom features
- Configurable network modes
- API-first design for integration

### 6.4 Observability
- Centralized logging
- Metrics collection and visualization
- Real-time topology and status updates

## 7. Security Considerations

### 7.1 Authentication & Authorization
- JWT-based authentication for API access
- Role-based access control (RBAC)
- Separate read-only and admin roles

### 7.2 Network Security
- API endpoints accessible only via HTTPS (production)
- OpenFlow channel encryption (TLS)
- Input validation on all user inputs

## 8. Next Steps

1. **Component Design** - Detailed specifications for each component
2. **API Specification** - Complete REST API documentation
3. **Development Setup** - Environment configuration guide
4. **Implementation** - Begin Phase 1 development
