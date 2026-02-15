# 🔷 NetOrch — Hybrid SDN Orchestration Platform

A web-based hybrid network orchestration platform that integrates traditional IP routing (FRRouting) with Software-Defined Networking (OVS + SDN controller) through a modern React dashboard and FastAPI backend.

![CI](https://github.com/<owner>/NetOrch/actions/workflows/ci.yml/badge.svg)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                       │
│  Dashboard │ Topology │ Routing │ Flows │ Monitoring    │
│  (Vite + React 19 + TailwindCSS 4 + Chart.js)         │
└──────────────────────┬──────────────────────────────────┘
                       │  REST API + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                  FastAPI Backend                         │
│  Orchestrator → FRR Service / Ryu Service / OVS Service │
│  JWT Auth │ Real-time WS broadcast │ SSH tunneling      │
└──────────────────────┬──────────────────────────────────┘
                       │  SSH / HTTP
┌──────────────────────▼──────────────────────────────────┐
│              RHEL VM (Network Node)                      │
│  FRRouting 10.1  │  Open vSwitch 3.4  │  SDN REST API  │
│  BGP/OSPF/Static │  Bridges/VXLAN/GRE │  Flow Control  │
└─────────────────────────────────────────────────────────┘
```

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | System health, component status, recent events, uptime |
| **Topology** | Auto-discovered SVG topology from real OVS bridges, FRR routes, VXLAN/GRE tunnels |
| **Routing** | BGP summary, OSPF neighbors, route table with protocol filtering |
| **SDN Flows** | Full CRUD — view, add, delete OpenFlow rules with auth-protected mutations |
| **Monitoring** | Real-time CPU/Memory charts (Chart.js), event log, component health cards |
| **WebSocket** | Live updates pushed every 5s — stats, topology, events auto-refresh |
| **Authentication** | JWT-based auth for write operations |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, @tanstack/react-query 5, Chart.js, Zustand |
| Backend | Python 3.11, FastAPI, Pydantic v2, httpx, python-jose (JWT) |
| Infrastructure | FRRouting 10.1, Open vSwitch 3.4.1, Custom SDN REST API |
| DevOps | Docker Compose, GitHub Actions CI, nginx reverse proxy |

---

## Quick Start

### Prerequisites

- Python 3.9+ and Node.js 22+
- SSH access to a VM running FRRouting + OVS (or set `FRR_ENABLED=false` etc. for mock mode)

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

## API Endpoints

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/system/info` | System version, mode, uptime |

### Routing
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/routing/routes` | — | Route table (filter by `?protocol=bgp`) |
| GET | `/api/v1/routing/bgp/summary` | — | BGP summary |
| GET | `/api/v1/routing/bgp/neighbors` | — | BGP neighbors |
| GET | `/api/v1/routing/ospf/neighbors` | — | OSPF neighbors |
| POST | `/api/v1/routing/static` | ✅ | Add static route |

### SDN
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/sdn/flows` | — | List all flows |
| POST | `/api/v1/sdn/flows` | ✅ | Add a flow rule |
| DELETE | `/api/v1/sdn/flows/{id}` | ✅ | Delete a flow rule |
| GET | `/api/v1/switches` | — | List switches |
| POST | `/api/v1/switches` | ✅ | Create OVS bridge |

### Topology
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/topology` | Auto-discovered topology |
| POST | `/api/v1/topology/refresh` | Force topology refresh |

### Monitoring
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/monitoring/stats` | CPU, memory, component stats |
| GET | `/api/v1/monitoring/events` | Event log |

### WebSocket
| Path | Description |
|------|-------------|
| `ws://host/api/v1/ws` | Real-time stats, topology, events (JSON messages) |

---

## Project Structure

```
NetOrch/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routes (health, routing, sdn, topology, monitoring, ws)
│   │   ├── core/         # Config, security (JWT)
│   │   ├── schemas/      # Pydantic models
│   │   └── services/     # FRR, Ryu, OVS, Topology, Orchestrator
│   ├── tests/            # 45+ pytest tests
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios client + endpoint functions
│   │   ├── components/   # Layout (Header, Sidebar), Shared (Skeleton, ErrorBanner)
│   │   ├── features/     # Dashboard, Topology, Routing, Flows, Monitoring pages
│   │   ├── hooks/        # useWebSocket
│   │   ├── stores/       # Zustand (auth, app state)
│   │   └── types/        # TypeScript interfaces
│   ├── Dockerfile
│   └── nginx.conf
├── scripts/              # VM setup scripts
├── docker-compose.yml
├── .github/workflows/    # CI pipeline
└── docs/                 # Architecture & API documentation
```

## Testing

```bash
# Run all backend tests (no VM required — mock mode)
cd backend && source .venv/bin/activate
FRR_ENABLED=false RYU_ENABLED=false OVS_ENABLED=false pytest tests/ -v

# Frontend type check
cd frontend && npx tsc --noEmit
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VM_HOST` | `192.168.64.3` | VM IP address |
| `VM_USER` | `root` | SSH user |
| `SSH_KEY_PATH` | `~/.ssh/id_ed25519` | SSH private key |
| `FRR_ENABLED` | `true` | Enable real FRR connections |
| `RYU_ENABLED` | `true` | Enable SDN API connections |
| `OVS_ENABLED` | `true` | Enable OVS connections |
| `SECRET_KEY` | — | JWT signing secret |

---

## License

This project is built as a learning and portfolio platform for hybrid SDN orchestration.

See [REQUIREMENTS.md](REQUIREMENTS.md) for the original project requirements document.
