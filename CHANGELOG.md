# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Input validation for all SSH-interpolated user inputs (routing, VRF, topology builder)
- Shared validators module (`app.core.validators`) to prevent command injection
- Rate limiting on login endpoint (5 attempts per 60 seconds per IP)
- Password complexity validation (configurable minimum length)
- Configurable CORS origins via `CORS_ORIGINS` environment variable
- Configurable operational parameters: cache TTLs, WS broadcast interval, SSH timeouts, audit buffer size, BGP default ASN
- Security warnings on startup for default credentials
- WebSocket authentication (JWT token via query parameter)
- DC/WAN mode-aware service behavior in FRRService and OVSService
- Frontend form validation with real-time IP/name format checking
- Frontend test infrastructure (Vitest + Testing Library)
- Backend tests for VRF, audit, WebSocket, terminal, users, and orchestrator modules
- Production deployment guide (`docs/guides/production-deployment.md`)
- Multi-node deployment configuration support
- Phase 3 feature stubs: failure simulation, traffic engineering, metrics export
- LICENSE (MIT), CONTRIBUTING.md, CHANGELOG.md

### Changed
- `RyuService` renamed to `SDNFlowService` for clarity
- Shared style constants extracted to `frontend/src/components/common/styles.ts`
- Topology discovery uses per-node error recovery (partial results on failure)
- Mock data uses deep copies to prevent cross-request state leaks
- Empty `models/` package now contains documentation placeholder

### Security
- **CRITICAL**: Fixed command injection vulnerabilities in routing and VRF endpoints
- Added input sanitization for neighbor IPs, destinations, VRF names, ASN numbers
- Login endpoint rate limiting prevents brute-force attacks
- Startup warnings when running with default `SECRET_KEY` or `admin123` password

### Performance
- SSH ControlMaster connection multiplexing
- TTL-based caching for stats, topology, and health data
- Staggered WebSocket broadcasts (stats 5s, topology 15s, events 10s)
- Parallel OVS bridge queries with asyncio.gather
- Shared httpx.AsyncClient for SDN REST calls
- Conditional REST polling disabled when WebSocket is connected
- Vite manual chunk splitting for optimized bundle size
- Selective D3 imports replacing full bundle import

## [0.1.0] - 2026-02-24

### Added
- Initial release
- FastAPI backend with 45+ REST endpoints and 2 WebSocket endpoints
- React 19 frontend with Dashboard, Topology Builder, Routing, Flows, Monitoring, Terminal, Labs
- FRRouting integration (BGP, OSPF, static routes via SSH)
- Open vSwitch integration (bridges, ports, flows via SSH)
- EVE-NG style topology builder with D3.js
- JWT authentication with role-based access control (admin, operator, viewer)
- Real-time WebSocket monitoring with Chart.js
- xterm.js web terminal with SSH proxy
- VRF management
- Network tools (ping, traceroute, ARP)
- Audit logging
- Learning Hub and Labs
- Docker Compose deployment
- GitHub Actions CI pipeline
