# 🔷 NetOrch — Hybrid SDN Orchestration Platform

A web-based hybrid network orchestration platform that integrates traditional IP routing (FRRouting) with Software-Defined Networking (OVS + SDN controller) through a modern React dashboard and FastAPI backend. Features an EVE-NG style topology builder, interactive terminals, educational labs, and comprehensive network management tools.

![CI](https://github.com/<owner>/NetOrch/actions/workflows/ci.yml/badge.svg)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                       │
│  Dashboard │ Topology Builder │ Routing │ Flows         │
│  Monitoring │ Terminal │ Routers │ VRF │ Tools │ Labs   │
│  (Vite 7 + React 19 + TailwindCSS 4 + D3.js + xterm)  │
└──────────────────────┬──────────────────────────────────┘
                       │  REST API (45 endpoints) + WebSocket (2)
┌──────────────────────▼──────────────────────────────────┐
│                  FastAPI Backend                         │
│  Orchestrator → FRR Service / Ryu Service / OVS Service │
│  JWT Auth │ Real-time WS broadcast │ SSH terminal proxy │
└──────────────────────┬──────────────────────────────────┘
                       │  SSH (Ed25519 key auth)
┌──────────────────────▼──────────────────────────────────┐
│              RHEL VM (Network Node)                      │
│  FRRouting 10.1  │  Open vSwitch 3.4  │  SDN REST API  │
│  BGP/OSPF/Static │  Bridges/VXLAN/GRE │  Flow Control  │
│  Network Namespaces (virtual hosts + routers)           │
└─────────────────────────────────────────────────────────┘
```

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | System health, component status, recent events, uptime |
| **Topology Builder** | EVE-NG style — create/delete switches, hosts, routers, links via D3.js canvas. Drag-and-drop, context menu, auto-layout |
| **Topology Discovery** | Auto-discovered from live OVS bridges, FRR routers, network namespaces, veth pairs, VXLAN/GRE tunnels |
| **Routing** | BGP summary, OSPF neighbors, route table with protocol filtering, static route CRUD |
| **SDN Flows** | Full CRUD — view, add, delete OpenFlow rules with auth-protected mutations |
| **VRF Management** | Create/delete VRFs, configure per-VRF BGP, view VRF-specific routes |
| **Monitoring** | Real-time CPU/Memory charts (Chart.js), event log, component health cards |
| **Web Terminal** | xterm.js SSH terminal to VM with auto-reconnect |
| **Router Terminal** | Fullscreen vtysh terminal per virtual router (network namespace isolation) |
| **Router Management** | List, create, delete virtual routers (FRR in network namespaces) |
| **Network Tools** | Ping, traceroute, ARP table — from any network namespace |
| **Learning Hub** | SDN, BGP, OSPF, VXLAN, OVS educational content |
| **Labs** | Guided lab scenarios with step-by-step instructions |
| **WebSocket** | Live updates pushed every 5s — stats, topology, events auto-refresh |
| **Authentication** | JWT-based auth for write operations |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, @tanstack/react-query 5, D3.js 7, Chart.js 4, xterm 6, Zustand 5, react-router-dom 7, Axios |
| Backend | Python 3.11, FastAPI 0.128, Pydantic v2, httpx, python-jose (JWT), Uvicorn |
| Infrastructure | FRRouting 10.1, Open vSwitch 3.4, RHEL 10.1 VM |
| DevOps | Docker Compose, GitHub Actions CI, nginx reverse proxy |

---

## Quick Start

### Prerequisites

- Python 3.9+ and Node.js 22+
- SSH access to a RHEL VM running FRRouting + OVS (or set `FRR_ENABLED=false` etc. for mock mode)

### Dev Script (recommended)

Start both backend and frontend with one command:

```bash
./dev.sh start     # launch backend (:8000) + frontend (:5173)
./dev.sh stop      # kill both
./dev.sh restart   # stop → start
./dev.sh status    # check if running
```

Logs are saved in `.logs/backend.log` and `.logs/frontend.log`.

### Manual Setup

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit VM_HOST, credentials, etc.
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev    # → http://localhost:5173
```

### 3. Docker (production)

```bash
docker compose up --build
# Frontend → http://localhost:80
# Backend  → http://localhost:8000
```

---

## API Endpoints (45 REST + 2 WebSocket)

### System & Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/health` | — | Health check |
| GET | `/api/v1/system/info` | — | System version, mode, uptime |
| POST | `/api/v1/auth/login` | — | Authenticate, returns JWT |
| GET | `/api/v1/system/mode` | — | Get system mode |
| PUT | `/api/v1/system/mode` | ✅ | Set system mode (dc/wan) |

### Routing (10 endpoints)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/routing/routes` | — | Route table (filter by `?protocol=bgp`) |
| POST | `/api/v1/routing/routes/static` | ✅ | Add static route |
| DELETE | `/api/v1/routing/routes/static/{dest}` | ✅ | Delete static route |
| GET | `/api/v1/routing/bgp/summary` | — | BGP summary |
| GET | `/api/v1/routing/bgp/neighbors` | — | BGP neighbors |
| GET | `/api/v1/routing/bgp/neighbors/{ip}` | — | Specific BGP neighbor |
| POST | `/api/v1/routing/bgp/neighbors` | ✅ | Add BGP neighbor |
| DELETE | `/api/v1/routing/bgp/neighbors/{ip}` | ✅ | Delete BGP neighbor |
| GET | `/api/v1/routing/ospf/summary` | — | OSPF summary |
| GET | `/api/v1/routing/ospf/neighbors` | — | OSPF neighbors |

### SDN (11 endpoints)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/sdn/flows` | — | List all flows |
| GET | `/api/v1/sdn/flows/{id}` | — | Get flow details |
| POST | `/api/v1/sdn/flows` | ✅ | Add a flow rule |
| DELETE | `/api/v1/sdn/flows/{id}` | ✅ | Delete a flow rule |
| GET | `/api/v1/sdn/flows/{id}/stats` | — | Flow statistics |
| GET | `/api/v1/switches` | — | List switches |
| GET | `/api/v1/switches/{dpid}` | — | Switch details |
| POST | `/api/v1/switches` | ✅ | Create OVS bridge |
| DELETE | `/api/v1/switches/{name}` | ✅ | Delete OVS bridge |
| POST | `/api/v1/switches/{name}/ports` | ✅ | Add port to bridge |
| POST | `/api/v1/switches/{name}/ports/vxlan` | ✅ | Create VXLAN tunnel |

### Topology (3 endpoints)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/topology` | — | Auto-discovered topology |
| POST | `/api/v1/topology/refresh` | ✅ | Force topology refresh |
| PATCH | `/api/v1/topology/nodes/{id}` | ✅ | Update node position |

### Topology Builder (11 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/topology/builder/switches` | Create OVS switch |
| DELETE | `/api/v1/topology/builder/switches/{name}` | Delete switch |
| POST | `/api/v1/topology/builder/hosts` | Create virtual host |
| DELETE | `/api/v1/topology/builder/hosts/{name}` | Delete host |
| POST | `/api/v1/topology/builder/routers` | Create virtual router |
| DELETE | `/api/v1/topology/builder/routers/{name}` | Delete router |
| POST | `/api/v1/topology/builder/links` | Create link |
| DELETE | `/api/v1/topology/builder/links` | Delete link |
| PUT | `/api/v1/topology/builder/positions` | Batch update positions |
| GET | `/api/v1/topology/builder/hosts` | List network namespaces |
| DELETE | `/api/v1/topology/builder/all` | Clear all topology |

### Monitoring (3 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/monitoring/stats` | CPU, memory, component stats |
| GET | `/api/v1/monitoring/ports/{dpid}` | Port statistics |
| GET | `/api/v1/monitoring/events` | Event log |

### VRF (5 endpoints)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/vrf` | — | List VRFs |
| POST | `/api/v1/vrf` | ✅ | Create VRF |
| DELETE | `/api/v1/vrf/{name}` | ✅ | Delete VRF |
| POST | `/api/v1/vrf/{name}/bgp` | ✅ | Configure VRF BGP |
| GET | `/api/v1/vrf/{name}/routes` | — | VRF routes |

### Network Tools (4 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tools/ping` | Ping from namespace |
| POST | `/api/v1/tools/traceroute` | Traceroute from namespace |
| POST | `/api/v1/tools/arp` | ARP table from namespace |
| GET | `/api/v1/tools/hosts` | List network namespaces |

### WebSocket
| Path | Description |
|------|-------------|
| `ws://host/api/v1/ws` | Real-time stats, topology, events (JSON every 5s) |
| `ws://host/api/v1/ws/terminal` | Interactive SSH terminal (`?shell=bash\|vtysh&netns=...`) |

---

## Project Structure

```
NetOrch/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routes
│   │   │   ├── health.py              # Health, system info
│   │   │   └── v1/                    # All v1 endpoints
│   │   │       ├── auth.py            # Authentication
│   │   │       ├── routing.py         # 10 routing endpoints
│   │   │       ├── sdn.py             # 11 SDN endpoints
│   │   │       ├── topology.py        # 3 topology endpoints
│   │   │       ├── topology_builder.py # 11 builder endpoints
│   │   │       ├── monitoring.py      # 3 monitoring endpoints
│   │   │       ├── vrf.py             # 5 VRF endpoints
│   │   │       ├── network_tools.py   # 4 tools endpoints
│   │   │       ├── ws.py              # WebSocket broadcast
│   │   │       └── terminal.py        # WebSocket terminal
│   │   ├── core/         # Config (pydantic-settings), JWT security
│   │   ├── schemas/      # Pydantic models
│   │   └── services/     # FRR, Ryu, OVS, Topology, Orchestrator, SSH utils
│   ├── tests/            # 47 pytest tests (8 files)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios client + endpoints
│   │   ├── components/   # Layout (Header, Sidebar), Shared
│   │   ├── features/     # 13 pages: Dashboard, Topology, Routing, Flows,
│   │   │                 #   Monitoring, Terminal, RouterTerminal, Routers,
│   │   │                 #   Learn, Labs, LabDetail, Tools, TopologyDetails
│   │   ├── hooks/        # useWebSocket
│   │   ├── stores/       # Zustand (auth, app state)
│   │   └── types/        # TypeScript interfaces
│   ├── Dockerfile
│   └── nginx.conf
├── scripts/              # VM setup scripts (RHEL, scenarios, OVS fix)
├── docker-compose.yml
├── .github/workflows/    # CI pipeline (3 jobs)
└── docs/                 # Architecture, API, guides documentation
```

## Testing

```bash
# Run all backend tests (no VM required — mock mode)
cd backend && source .venv/bin/activate
FRR_ENABLED=false RYU_ENABLED=false OVS_ENABLED=false pytest tests/ -v

# Frontend type check
cd frontend && npx tsc --noEmit
```

47 test functions across 8 test files. CI/CD runs: backend tests → frontend build + type check → Docker build.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VM_HOST` | `192.168.64.3` | VM IP address |
| `VM_USER` | `root` | SSH user |
| `VM_SSH_KEY` | `~/.ssh/id_ed25519` | SSH private key |
| `FRR_ENABLED` | `false` | Enable live FRR connections |
| `RYU_ENABLED` | `false` | Enable SDN API connections |
| `OVS_ENABLED` | `false` | Enable OVS connections |
| `SECRET_KEY` | `dev-secret-key-...` | JWT signing secret |
| `ADMIN_USERNAME` | `admin` | Admin login username |
| `ADMIN_PASSWORD` | `admin123` | Admin login password |
| `SYSTEM_MODE` | `dc` | System mode (dc/wan) |
| `FRR_VTYSH_PATH` | `/usr/bin/vtysh` | vtysh binary path |
| `RYU_URL` | `http://192.168.64.3:8080` | SDN REST API URL |
| `OVS_VSCTL_PATH` | `/usr/bin/ovs-vsctl` | ovs-vsctl binary path |

---

## Documentation

- [Architecture Overview](docs/architecture/overview.md)
- [Component Design](docs/architecture/components.md)
- [API Specification](docs/api/specification.md)
- [Development Setup](docs/guides/development-setup.md)

## License

This project is built as a learning and portfolio platform for hybrid SDN orchestration.

See [REQUIREMENTS.md](REQUIREMENTS.md) for the original project requirements document.
