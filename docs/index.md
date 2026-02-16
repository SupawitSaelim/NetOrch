# NetOrch — Hybrid SDN Orchestration Platform Documentation

## Overview

NetOrch is a web-based hybrid network orchestration platform that unifies traditional IP routing (FRRouting) with Software-Defined Networking (Open vSwitch) through a modern React dashboard and FastAPI backend. It provides an EVE-NG style topology builder, interactive terminals, educational labs, and comprehensive network management tools — all controlled through a single web interface.

The platform connects to a **Red Hat Enterprise Linux (RHEL) VM** via SSH, managing FRRouting daemons, OVS bridges, network namespaces, virtual routers, and virtual hosts on the remote node.

---

## Documentation Index

### Architecture
- [Architecture Overview](./architecture/overview.md) — High-level system architecture, layer descriptions, network modes
- [Component Design](./architecture/components.md) — Detailed specifications for all backend services, frontend pages, and integrations

### API Reference
- [API Specification](./api/specification.md) — All 45 REST + 2 WebSocket endpoints with request/response schemas

### Guides
- [Development Setup](./guides/development-setup.md) — Setting up the development environment (macOS + RHEL VM)

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | React (TypeScript) | 19.2.x |
| Build Tool | Vite | 7.3.x |
| Styling | Tailwind CSS | 4.1.x |
| Data Fetching | @tanstack/react-query | 5.90.x |
| State Management | Zustand | 5.0.x |
| Topology Visualization | D3.js | 7.9.x |
| Charts | Chart.js + react-chartjs-2 | 4.5.x |
| Terminal | @xterm/xterm | 6.0.x |
| Routing | react-router-dom | 7.13.x |
| HTTP Client | Axios | 1.13.x |
| Backend API | FastAPI (Python) | 0.128.x |
| Validation | Pydantic v2 | 2.12.x |
| Auth | python-jose (JWT) | 3.5.x |
| ASGI Server | Uvicorn | 0.39.x |
| Routing Engine | FRRouting | 10.1 |
| Data Plane | Open vSwitch | 3.4.x |
| VM OS | Red Hat Enterprise Linux | 10.1 |
| Containers | Docker Compose | — |
| CI/CD | GitHub Actions | — |

## Feature Summary

| Feature | Description |
|---------|-------------|
| **Dashboard** | System health, component status, recent events, uptime |
| **Topology Builder** | EVE-NG style — create/delete switches, hosts, routers, links via GUI. D3.js interactive canvas with drag, context menu, auto-layout |
| **Topology Discovery** | Auto-discovered topology from live OVS bridges, FRR routers, network namespaces, veth pairs, VXLAN tunnels |
| **Routing Management** | BGP summary, OSPF neighbors, route table with protocol filtering, static route CRUD |
| **SDN Flow Management** | Full CRUD for OpenFlow rules — view, add, delete with auth-protected mutations |
| **VRF Management** | Create/delete VRFs, configure BGP per-VRF, view VRF-specific routes |
| **Monitoring** | Real-time CPU/Memory charts (Chart.js), event log, component health cards |
| **Web Terminal** | xterm.js SSH terminal to the VM, with reconnect support |
| **Router Terminal** | Fullscreen vtysh terminal per virtual router (network namespace isolation) |
| **Router Management** | List, create, delete virtual routers (FRR in network namespaces) |
| **Network Tools** | Ping, traceroute, ARP table — all executed from any network namespace |
| **Learning Hub** | Educational content covering SDN, BGP, OSPF, VXLAN, OVS concepts |
| **Labs** | Guided lab scenarios with step-by-step instructions |
| **WebSocket** | Real-time updates pushed every 5s — stats, topology, events auto-refresh |
| **Authentication** | JWT-based auth for write operations (login: admin / admin123) |

## API Summary

- **45 REST endpoints** + **2 WebSocket endpoints**
- Categories: Health, Auth, System, Routing (10), SDN (11), Topology (3), Topology Builder (11), Monitoring (3), VRF (5), Network Tools (4)
- See [API Specification](./api/specification.md) for complete details

## Testing

- **47 test functions** across 8 test files (pytest)
- All tests run in mock mode (no VM required): `FRR_ENABLED=false RYU_ENABLED=false OVS_ENABLED=false`
- CI/CD pipeline: backend tests → frontend build + type check → Docker build

---

## Project Status

Single-node deployment on RHEL VM with full-featured web management interface. All core features implemented and operational.
