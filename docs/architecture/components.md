# Component Design

## 1. Overview

This document provides detailed specifications for each component in the NetOrch platform, matching the current codebase implementation.

## 2. Frontend (React Application)

### 2.1 Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.x | UI Framework |
| TypeScript | 5.9.x | Type Safety |
| Vite | 7.3.x | Build Tool |
| react-router-dom | 7.13.x | Client-side Routing |
| @tanstack/react-query | 5.90.x | Data Fetching/Caching |
| Zustand | 5.0.x | State Management |
| Tailwind CSS | 4.1.x | Styling |
| D3.js | 7.9.x | Topology Visualization |
| Chart.js + react-chartjs-2 | 4.5.x / 5.3.x | Monitoring Charts |
| @xterm/xterm | 6.0.x | Terminal Emulator |
| Axios | 1.13.x | HTTP Client |

### 2.2 Application Structure

```
frontend/src/
├── api/
│   ├── client.ts              # Axios instance with base URL + auth interceptor
│   └── endpoints.ts           # All API endpoint functions
│
├── components/
│   ├── Shared.tsx             # Reusable UI components (Skeleton, ErrorBanner, etc.)
│   └── layout/
│       ├── Layout.tsx         # Main layout with sidebar + content area
│       ├── Header.tsx         # Top header bar with auth status
│       └── Sidebar.tsx        # Navigation sidebar with route links
│
├── features/
│   ├── dashboard/
│   │   └── Dashboard.tsx      # System overview, health cards, recent events
│   ├── topology/
│   │   ├── TopologyPage.tsx   # D3.js interactive topology builder (1,288 lines)
│   │   └── TopologyDetailsPage.tsx  # Topology details table view
│   ├── routing/
│   │   └── RoutingPage.tsx    # Route table, BGP summary, OSPF neighbors
│   ├── flows/
│   │   └── FlowsPage.tsx     # SDN flow rules CRUD (456 lines)
│   ├── monitoring/
│   │   └── MonitoringPage.tsx # CPU/memory charts, event log, health cards
│   ├── terminal/
│   │   ├── TerminalPage.tsx   # xterm.js SSH terminal to VM
│   │   └── RouterTerminalPage.tsx  # Fullscreen router vtysh terminal
│   ├── routers/
│   │   └── RoutersPage.tsx    # Virtual router management (list/create/delete)
│   ├── learn/
│   │   └── LearnPage.tsx      # Educational content (SDN, BGP, OSPF, etc.)
│   ├── labs/
│   │   ├── LabsPage.tsx       # Lab scenario listing
│   │   ├── LabDetailPage.tsx  # Individual lab with steps
│   │   └── labData.ts        # Lab content data (800 lines)
│   └── tools/
│       └── NetworkToolsPage.tsx  # Ping, traceroute, ARP tools
│
├── hooks/
│   └── useWebSocket.ts       # WebSocket hook with auto-reconnect
│
├── stores/
│   ├── authStore.ts           # Zustand auth store (token, login/logout)
│   └── appStore.ts            # Zustand app store (sidebar state, etc.)
│
├── types/
│   └── index.ts               # TypeScript interfaces for all API types
│
├── App.tsx                    # Route definitions with lazy loading
├── main.tsx                   # Entry point (React root + StrictMode)
└── vite-env.d.ts              # Vite type declarations
```

### 2.3 Frontend Routes (13 total)

All routes use `React.lazy()` with `Suspense` for code splitting.

| Route | Component | Layout | Description |
|-------|-----------|--------|-------------|
| `/` | Dashboard | ✅ | System overview dashboard |
| `/topology` | TopologyPage | ✅ | D3.js topology builder + discovery view |
| `/topology/details` | TopologyDetailsPage | ✅ | Topology node/link details table |
| `/routing` | RoutingPage | ✅ | Routing table, BGP, OSPF management |
| `/flows` | FlowsPage | ✅ | SDN flow rules CRUD |
| `/monitoring` | MonitoringPage | ✅ | Real-time charts + event log |
| `/terminal` | TerminalPage | ✅ | SSH terminal to VM |
| `/routers` | RoutersPage | ✅ | Virtual router management |
| `/learn` | LearnPage | ✅ | Educational/learning content |
| `/labs` | LabsPage | ✅ | Lab scenarios listing |
| `/labs/:labId` | LabDetailPage | ✅ | Individual lab detail |
| `/tools` | NetworkToolsPage | ✅ | Network diagnostic tools |
| `/terminal/router/:routerName` | RouterTerminalPage | ❌ (fullscreen) | Router-specific vtysh terminal |

### 2.4 Key Frontend Features

**Topology Builder (TopologyPage.tsx — 1,288 lines):**
- D3.js force-directed graph with drag-and-drop
- Context menu (right-click) for node actions: delete, open terminal, properties
- Add switches, hosts, routers via toolbar buttons
- Create links by dragging between nodes
- Properties panel slides in/out on node selection
- Auto-layout on first load using D3 force simulation
- Node position persistence (PATCH to backend)
- Portal-based context menu rendering (z-index 9999)

**Terminal (xterm.js):**
- WebSocket-based SSH proxy to VM
- RouterTerminalPage: fullscreen, no sidebar, opens in new window
- Handles React StrictMode double-mount via `mountedRef` guard
- Auto-reconnect with disconnect overlay

**State Management:**
- `useAuthStore` (Zustand): JWT token, login/logout, persist to localStorage
- `useAppStore` (Zustand): sidebar collapse state
- `useWebSocket` hook: connects to `/api/v1/ws`, auto-reconnects, provides `lastMessage`

---

## 3. Backend (FastAPI Application)

### 3.1 Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.11+ (runtime) | Language |
| FastAPI | 0.128.x | Web Framework |
| Uvicorn | 0.39.x | ASGI Server |
| Pydantic | 2.12.x | Data Validation |
| pydantic-settings | 2.11.x | Settings from env vars |
| python-jose | 3.5.x | JWT Authentication |
| httpx | 0.28.x | HTTP Client (for SDN REST API) |
| Jinja2 | 3.1.x | Template rendering |
| passlib | 1.7.x | Password hashing |
| python-multipart | 0.0.20 | Form data parsing |

### 3.2 Application Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app creation, CORS, route registration
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── deps.py                # Dependency injection (get_current_user)
│   │   ├── health.py              # GET /health, GET /system/info
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── router.py          # Main v1 router (aggregates all sub-routers)
│   │       ├── auth.py            # POST /auth/login
│   │       ├── system.py          # GET/PUT /system/mode
│   │       ├── routing.py         # 10 routing endpoints (routes, BGP, OSPF)
│   │       ├── sdn.py             # 11 SDN endpoints (flows, switches, ports)
│   │       ├── topology.py        # 3 topology endpoints (get, refresh, patch)
│   │       ├── topology_builder.py # 11 builder endpoints (CRUD for nodes/links)
│   │       ├── monitoring.py      # 3 monitoring endpoints
│   │       ├── vrf.py             # 5 VRF endpoints
│   │       ├── network_tools.py   # 4 network tools endpoints
│   │       ├── ws.py              # WebSocket broadcast endpoint
│   │       └── terminal.py        # WebSocket terminal endpoint
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py              # Settings class (pydantic-settings, from .env)
│   │   └── security.py            # JWT token creation/verification
│   │
│   ├── models/
│   │   └── __init__.py
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── common.py              # Shared schemas
│   │   ├── routing.py             # Routing/BGP/OSPF schemas
│   │   ├── sdn.py                 # Flow/Switch schemas
│   │   └── topology.py            # Topology node/link schemas
│   │
│   └── services/
│       ├── __init__.py
│       ├── orchestrator.py        # Central coordinator for all services
│       ├── frr_service.py         # FRRouting interface (SSH → vtysh)
│       ├── ryu_service.py         # OVS flow management (SSH → ovs-ofctl)
│       ├── ovs_service.py         # OVS bridge/port management (SSH → ovs-vsctl)
│       ├── topology_service.py    # Topology discovery (408 lines)
│       └── ssh_utils.py           # SSH command execution utilities
│
├── tests/
│   ├── conftest.py                # Shared fixtures, async client, mock SSH
│   ├── test_auth.py               # 3 tests
│   ├── test_health.py             # 3 tests
│   ├── test_monitoring.py         # 2 tests
│   ├── test_parsers.py            # 9 tests
│   ├── test_routing.py            # 7 tests
│   ├── test_sdn.py                # 5 tests
│   ├── test_sdn_parsers.py        # 13 tests
│   └── test_topology.py           # 5 tests
│
├── requirements.txt
├── pyproject.toml
└── Dockerfile
```

### 3.3 Service Layer Design

```
┌─────────────────────────────────────────────────────────────────┐
│                      OrchestratorService                         │
│  • Coordinates actions across all sub-services                   │
│  • Provides get_health(), get_system_info(), get_monitoring_stats │
│  • Tracks uptime and request_count                               │
└──────┬──────────────────┬──────────────────┬────────────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  FRRService  │  │  RyuService  │  │  OVSService  │
│  (SSH+vtysh) │  │ (SSH+ofctl)  │  │ (SSH+vsctl)  │
├──────────────┤  ├──────────────┤  ├──────────────┤
│get_routing   │  │get_flows     │  │list_bridges  │
│add_static    │  │add_flow      │  │create_bridge │
│delete_static │  │delete_flow   │  │delete_bridge │
│get_bgp_*     │  │get_flow_stats│  │add_port      │
│add/del_bgp   │  │get_switches  │  │delete_port   │
│get_ospf_*    │  │get_switch    │  │set_controller│
│get_status    │  │get_status    │  │create_vxlan  │
└──────────────┘  └──────────────┘  │get_status    │
                                    └──────────────┘
       │                  │                  │
       └──────── All via ssh_utils.py  ──────┘
                         │
              ┌──────────▼──────────┐
              │   TopologyService    │
              │  (408 lines)         │
              │  • discover()        │
              │  • get_topology()    │
              │  • refresh()         │
              │  • update_position() │
              │                      │
              │  Discovery phases:   │
              │  1. FRR router       │
              │  2. OVS bridges      │
              │  3. Ports & hosts    │
              │  4. VRouters (netns) │
              │  5. Network nodes    │
              │  6. Router links     │
              │  7. Physical uplinks │
              └──────────────────────┘
```

### 3.4 SSH Utilities

All VM communication goes through `ssh_utils.py`:

| Function | Description |
|----------|-------------|
| `ssh_exec(command, timeout)` | Execute arbitrary command on VM via SSH |
| `vtysh_exec(command)` | Execute `vtysh -c "..."` on VM |
| `ovs_exec(command)` | Execute `ovs-vsctl ...` on VM |

Configuration: `VM_HOST`, `VM_USER`, `VM_SSH_KEY` from environment.

---

## 4. FRRouting Integration

### 4.1 Overview

FRRouting (FRR) 10.1 provides routing protocol implementation. The backend communicates via SSH, executing `vtysh` commands on the RHEL VM and parsing the output.

### 4.2 FRRService Methods

| Method | Description |
|--------|-------------|
| `get_routing_table(protocol?)` | Parse `show ip route` output |
| `add_static_route(dest, next_hop, metric)` | Configure static route via vtysh |
| `delete_static_route(dest)` | Remove static route |
| `get_bgp_summary()` | Parse `show bgp summary` |
| `get_bgp_neighbors()` | Parse BGP neighbor details |
| `add_bgp_neighbor(config)` | Add BGP peer via vtysh config mode |
| `delete_bgp_neighbor(ip)` | Remove BGP peer |
| `get_ospf_summary()` | Parse `show ip ospf` |
| `get_ospf_neighbors()` | Parse `show ip ospf neighbor` |
| `get_status()` | Check FRR daemon connectivity |

### 4.3 Mock Mode

When `FRR_ENABLED=false`, FRRService returns realistic mock data. This enables:
- Frontend development without a VM
- All tests to pass in CI/CD
- Demo mode for presentations

---

## 5. OVS / SDN Flow Management

### 5.1 Overview

Open vSwitch management is split between two services:
- **OVSService** — bridge/port management via `ovs-vsctl` (SSH)
- **RyuService** — flow rule management via `ovs-ofctl` (SSH)

> **Note:** Despite the name "RyuService", the current implementation primarily uses SSH-based `ovs-ofctl` commands rather than a Ryu REST API. The optional SDN REST API (`sdn_rest_api.py`) can also be used when `RYU_ENABLED=true`.

### 5.2 OVSService Methods

| Method | Description |
|--------|-------------|
| `list_bridges()` | `ovs-vsctl list-br` |
| `get_bridge(name)` | Bridge details with ports |
| `create_bridge(name, protocols?, controller?)` | `ovs-vsctl add-br` |
| `delete_bridge(name)` | `ovs-vsctl del-br` |
| `add_port(bridge, port, **opts)` | `ovs-vsctl add-port` |
| `delete_port(bridge, port)` | `ovs-vsctl del-port` |
| `set_controller(bridge, url)` | `ovs-vsctl set-controller` |
| `create_vxlan_port(bridge, port, remote_ip, vni)` | VXLAN tunnel port |
| `get_status()` | Check OVS connectivity |

### 5.3 RyuService Methods (Flow Management)

| Method | Description |
|--------|-------------|
| `get_switches()` | List OVS bridges as "switches" |
| `get_switch(dpid)` | Single switch details |
| `get_flows(dpid?)` | `ovs-ofctl dump-flows` |
| `get_flow(flow_id)` | Single flow by ID |
| `add_flow(flow_data)` | `ovs-ofctl add-flow` |
| `delete_flow(flow_id)` | `ovs-ofctl del-flows` |
| `get_flow_stats(flow_id)` | Flow statistics |
| `get_status()` | Check connectivity |

---

## 6. Topology Discovery

### 6.1 Discovery Process

TopologyService (408 lines) performs multi-phase discovery:

1. **FRR Router** — Detect FRR daemon, add as router node
2. **OVS Bridges** — List all OVS bridges, add as switch nodes
3. **Ports & Hosts** — For each bridge, discover ports and connected hosts
4. **Virtual Routers** — Find network namespaces with FRR (naming convention: router*)
5. **Virtual Hosts** — Find network namespaces (naming convention: host*)
6. **Network Nodes** — Other namespaces
7. **Router-to-Router Links** — Detect veth pairs between router namespaces
8. **Physical Uplinks** — Detect physical interface connections

### 6.2 Node Types

| Type | Created By | Representation |
|------|-----------|----------------|
| `switch` | OVS bridge | Blue diamond on topology |
| `host` | Network namespace (host*) | Green circle |
| `router` | Network namespace + FRR (router*) | Red square |
| `frr-router` | Main FRR daemon | Router node |

### 6.3 Position Persistence

Node positions are stored in-memory and can be updated via PATCH `/api/v1/topology/nodes/{node_id}`. The Topology Builder also has a dedicated PUT `/api/v1/topology/builder/positions` for batch position updates.

---

## 7. Topology Builder

### 7.1 Overview

The topology builder provides EVE-NG style functionality for creating virtual network labs on the RHEL VM. It has 11 dedicated API endpoints.

### 7.2 Operations

| Operation | Backend Action |
|-----------|---------------|
| Create switch | `ovs-vsctl add-br <name>` + set OpenFlow protocols |
| Delete switch | `ovs-vsctl del-br <name>` |
| Create host | `ip netns add <name>` + create veth pair + attach to bridge |
| Delete host | `ip netns del <name>` + cleanup veth |
| Create router | `ip netns add <name>` + start FRR daemons (zebra, bgpd, ospfd) in netns |
| Delete router | Stop FRR daemons in netns + `ip netns del <name>` |
| Create link | Create veth pair + attach endpoints to bridges/namespaces |
| Delete link | Remove veth pair and port attachments |
| Clear all | Delete all bridges, namespaces, and veth pairs |

### 7.3 Interface Name Limits

Linux enforces a 15-character limit on interface names. The builder truncates names accordingly and uses short prefixes (e.g., `ve-` for veth pairs).

---

## 8. VRF Management

### 8.1 Overview

Virtual Routing and Forwarding (VRF) support allows network segmentation. 5 API endpoints manage VRF lifecycle and per-VRF BGP configuration.

### 8.2 Operations

| Endpoint | Description |
|----------|-------------|
| GET `/api/v1/vrf` | List all VRFs with their route distinguishers |
| POST `/api/v1/vrf` | Create VRF (name, RD, RT) via vtysh |
| DELETE `/api/v1/vrf/{name}` | Delete VRF |
| POST `/api/v1/vrf/{name}/bgp` | Configure BGP within a VRF |
| GET `/api/v1/vrf/{name}/routes` | Get routes for a specific VRF |

---

## 9. Network Tools

### 9.1 Overview

Network diagnostic tools that execute commands from within specific network namespaces on the VM.

| Tool | How it works |
|------|-------------|
| Ping | `ip netns exec <ns> ping -c <count> <target>` |
| Traceroute | `ip netns exec <ns> traceroute <target>` |
| ARP | `ip netns exec <ns> ip neigh show` |
| List hosts | `ip netns list` |

---

## 10. WebSocket Endpoints

### 10.1 Broadcast WebSocket (`/api/v1/ws`)

Pushes JSON messages every 5 seconds containing:
- Monitoring statistics (CPU, memory, component health)
- Topology state
- System events

Frontend subscribes via `useWebSocket` hook which provides `lastMessage` and auto-reconnects.

### 10.2 Terminal WebSocket (`/api/v1/ws/terminal`)

Interactive SSH proxy to the VM. Query parameters:
- `shell=bash` (default) — bash shell
- `shell=vtysh` — FRR vtysh shell
- `netns=<name>` — Execute in a specific network namespace

Used by both TerminalPage (VM shell) and RouterTerminalPage (router-specific vtysh).

---

## 11. Testing

### 11.1 Test Summary

| File | Tests | Coverage |
|------|-------|----------|
| test_auth.py | 3 | Login success/failure, authenticated endpoint |
| test_health.py | 3 | Root, health check, system info |
| test_monitoring.py | 2 | Stats, events |
| test_parsers.py | 9 | FRR route/BGP output parsing |
| test_routing.py | 7 | Routes, BGP summary/neighbors, OSPF, static route auth |
| test_sdn.py | 5 | Flows, switches, add/delete flow auth |
| test_sdn_parsers.py | 13 | OVS action/flow/match parsing |
| test_topology.py | 5 | Topology get, node/link structure, refresh auth |
| **Total** | **47** | — |

All tests use mock SSH responses via `conftest.py` fixtures.

### 11.2 Running Tests

```bash
cd backend && source .venv/bin/activate
FRR_ENABLED=false RYU_ENABLED=false OVS_ENABLED=false pytest tests/ -v
```

---

## 12. Configuration

All settings loaded from environment variables via `pydantic-settings`. Defined in `backend/app/core/config.py`.

| Setting | Default | Description |
|---------|---------|-------------|
| `API_HOST` | `0.0.0.0` | API listen host |
| `API_PORT` | `8000` | API listen port |
| `DEBUG` | `false` | Debug mode |
| `SECRET_KEY` | `dev-secret-key-change-in-production` | JWT signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Token expiry |
| `ADMIN_USERNAME` | `admin` | Login username |
| `ADMIN_PASSWORD` | `admin123` | Login password |
| `SYSTEM_MODE` | `dc` | System mode (dc/wan) |
| `VM_HOST` | `192.168.64.3` | RHEL VM SSH host |
| `VM_USER` | `root` | VM SSH user |
| `VM_SSH_KEY` | `~/.ssh/id_ed25519` | SSH private key path |
| `FRR_ENABLED` | `false` | Enable live FRR connections |
| `FRR_VTYSH_PATH` | `/usr/bin/vtysh` | vtysh binary path on VM |
| `RYU_ENABLED` | `false` | Enable SDN REST API |
| `RYU_URL` | `http://192.168.64.3:8080` | SDN REST API URL |
| `OVS_ENABLED` | `false` | Enable live OVS connections |
| `OVS_VSCTL_PATH` | `/usr/bin/ovs-vsctl` | ovs-vsctl path on VM |

---

## 13. Infrastructure

### 13.1 Docker Compose

Two services: `backend` + `frontend`.

**Backend container:**
- Base: `python:3.11-slim`
- Installs `openssh-client` for VM SSH
- Mounts SSH key from host
- Healthcheck: HTTP GET `/api/v1/health`

**Frontend container:**
- Build stage: `node:22-alpine` → `npm ci` + `npm run build`
- Production: `nginx:alpine` with custom config
- Proxies `/api/` → `http://backend:8000/api/` (with WebSocket support)
- SPA fallback for client-side routing

### 13.2 CI/CD (GitHub Actions)

Triggers on push/PR to `main`. Three jobs:

| Job | Steps |
|-----|-------|
| Backend Tests | Python 3.11, pip install, `pytest tests/ -v --tb=short` (mock mode) |
| Frontend Build | Node 22, `npm ci`, `npx tsc --noEmit`, `npm run build` |
| Docker Build | Build both Docker images (after tests pass) |

### 13.3 Scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup-redhat-vm.sh` | Initial RHEL VM setup (FRR, OVS) |
| `scripts/setup-vm-full.sh` | Full VM setup with scenarios |
| `scripts/setup-vm-scenarios.sh` | Create test network scenarios |
| `scripts/fix-ovs.sh` | OVS troubleshooting/fix script |
| `scripts/netorch_controller.py` | NetOrch SDN controller |
| `scripts/osken-launcher.py` | OS-Ken SDN controller launcher |
| `scripts/sdn_rest_api.py` | Standalone SDN REST API bridge |
