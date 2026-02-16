# Development Setup Guide

## 1. Overview

This guide covers setting up a development environment for NetOrch. The architecture uses a **macOS development machine** running the backend (FastAPI) and frontend (React/Vite), connecting via SSH to a **Red Hat Enterprise Linux (RHEL) VM** that runs the networking components (FRRouting + Open vSwitch).

## 2. System Requirements

### 2.1 Development Machine (macOS)

| Component | Requirement |
|-----------|-------------|
| OS | macOS (Apple Silicon or Intel) |
| Python | 3.9+ (system Python or Homebrew) |
| Node.js | 22+ |
| SSH | SSH key (Ed25519 recommended) |

### 2.2 Network VM (RHEL)

| Component | Requirement |
|-----------|-------------|
| OS | Red Hat Enterprise Linux 10.1 (aarch64 or x86_64) |
| Virtualization | UTM, VMware, or VirtualBox |
| CPU | 2+ cores |
| RAM | 4+ GB |
| Storage | 20+ GB |
| Network | Bridged or shared networking (accessible from host) |

---

## 3. VM Setup (RHEL)

### 3.1 Install RHEL VM

1. Download RHEL 10.1 ISO from Red Hat Developer portal
2. Create a VM in UTM (or your preferred hypervisor)
3. Install RHEL with minimal server configuration
4. Note the VM IP address (default in this project: `192.168.64.3`)

### 3.2 Configure SSH Access

On your Mac:
```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519

# Copy public key to VM
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@192.168.64.3

# Test connection
ssh root@192.168.64.3
```

### 3.3 Install FRRouting on RHEL

```bash
# On the VM
sudo dnf install -y frr frr-pythontools

# Enable daemons — edit /etc/frr/daemons
sudo vi /etc/frr/daemons
# Set: zebra=yes, bgpd=yes, ospfd=yes

# Start and enable FRR
sudo systemctl enable --now frr
sudo systemctl status frr

# Verify — FRR binary path on RHEL is /usr/libexec/frr/
sudo vtysh -c "show version"
```

### 3.4 Install Open vSwitch on RHEL

```bash
# On the VM
sudo dnf install -y openvswitch3.4
sudo systemctl enable --now openvswitch

# Verify
sudo ovs-vsctl --version
sudo ovs-vsctl show
```

### 3.5 Automated VM Setup

Use the provided setup scripts:
```bash
# Copy setup script to VM
scp scripts/setup-redhat-vm.sh root@192.168.64.3:/root/

# Run on VM
ssh root@192.168.64.3 'bash /root/setup-redhat-vm.sh'
```

Available scripts:
| Script | Purpose |
|--------|---------|
| `scripts/setup-redhat-vm.sh` | Base RHEL setup (FRR + OVS) |
| `scripts/setup-vm-full.sh` | Full setup with demo scenarios |
| `scripts/setup-vm-scenarios.sh` | Create test network topologies |
| `scripts/fix-ovs.sh` | OVS troubleshooting/fixes |

---

## 4. Backend Setup (macOS)

### 4.1 Create Virtual Environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 4.2 Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:
```env
# VM Connection
VM_HOST=192.168.64.3
VM_USER=root
VM_SSH_KEY=~/.ssh/id_ed25519

# Enable live connections (set to true when VM is running)
FRR_ENABLED=true
RYU_ENABLED=true
OVS_ENABLED=true

# Auth
SECRET_KEY=your-secret-key-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# System
SYSTEM_MODE=dc
DEBUG=true
```

### 4.3 Run Development Server

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or directly:
```bash
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

### 4.4 Verify Backend

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/v1/health
- System info: http://localhost:8000/api/v1/system/info

---

## 5. Frontend Setup (macOS)

### 5.1 Install Dependencies

```bash
cd frontend
npm install
```

### 5.2 Run Development Server

```bash
npm run dev
```

Frontend runs at http://localhost:5173 and proxies `/api/` requests to the backend at http://localhost:8000.

### 5.3 Type Check

```bash
npx tsc --noEmit
```

### 5.4 Build for Production

```bash
npm run build
```

---

## 6. Development Workflow

### 6.1 Service Startup Order

```bash
# Terminal 1: Backend
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend  
cd frontend
npm run dev
```

The VM should already be running with FRR and OVS services started.

### 6.2 Mock Mode (No VM Required)

For frontend/backend development without a VM, set all services to disabled:

```env
FRR_ENABLED=false
RYU_ENABLED=false
OVS_ENABLED=false
```

Services will return realistic mock data.

### 6.3 Useful VM Commands

```bash
# SSH into VM
ssh root@192.168.64.3

# FRR
sudo vtysh                          # Enter FRR shell
sudo vtysh -c "show ip route"       # Show routing table
sudo vtysh -c "show bgp summary"    # Show BGP status

# OVS
sudo ovs-vsctl show                 # Show OVS config
sudo ovs-ofctl dump-flows br0       # Show flow table
sudo ovs-vsctl list-br              # List bridges

# Network Namespaces
sudo ip netns list                   # List all namespaces
sudo ip netns exec host1 ping 10.0.0.2  # Ping from namespace
sudo ip netns exec router1 vtysh    # FRR shell in router namespace
```

---

## 7. Testing

### 7.1 Backend Tests

```bash
cd backend && source .venv/bin/activate

# Run all tests (mock mode — no VM needed)
FRR_ENABLED=false RYU_ENABLED=false OVS_ENABLED=false pytest tests/ -v

# Run specific test file
FRR_ENABLED=false RYU_ENABLED=false OVS_ENABLED=false pytest tests/test_routing.py -v

# Run with coverage
FRR_ENABLED=false RYU_ENABLED=false OVS_ENABLED=false pytest tests/ -v --cov=app
```

47 tests across 8 test files. All tests use mock SSH responses.

### 7.2 Frontend Type Check

```bash
cd frontend
npx tsc --noEmit
```

---

## 8. Docker Deployment

### 8.1 Build and Run

```bash
docker compose up --build
```

- Frontend: http://localhost:80
- Backend: http://localhost:8000

### 8.2 Requirements

- Docker Desktop or Docker Engine
- SSH key at `~/.ssh/id_ed25519` (mounted into backend container)
- `.env` file in `backend/` directory

### 8.3 Architecture

- **backend**: `python:3.11-slim` + `openssh-client`, port 8000
- **frontend**: `node:22-alpine` (build) → `nginx:alpine` (serve), port 80
- nginx proxies `/api/` to backend with WebSocket support

---

## 9. CI/CD Pipeline

GitHub Actions runs on push/PR to `main`:

| Job | Description |
|-----|-------------|
| Backend Tests | Python 3.11, install deps, `pytest tests/ -v --tb=short` (mock mode) |
| Frontend Build | Node 22, `npm ci`, `npx tsc --noEmit`, `npm run build` |
| Docker Build | Build backend + frontend Docker images |

---

## 10. Troubleshooting

### 10.1 SSH Connection Issues

```bash
# Test SSH connection
ssh -v root@192.168.64.3

# Check SSH key permissions
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub

# Check VM is accessible
ping 192.168.64.3
```

### 10.2 FRR Issues (on VM)

```bash
sudo systemctl status frr
sudo journalctl -u frr -f

# Restart FRR
sudo systemctl restart frr

# Check FRR binary path (RHEL uses /usr/libexec/frr/)
ls /usr/libexec/frr/
```

### 10.3 OVS Issues (on VM)

```bash
sudo systemctl status openvswitch
sudo journalctl -u openvswitch

# Restart OVS
sudo systemctl restart openvswitch

# Check bridge status
sudo ovs-vsctl show
```

### 10.4 Backend Won't Start

```bash
# Ensure venv is activated
source .venv/bin/activate

# Check .env file exists
cat .env

# Run with debug output
uvicorn app.main:app --reload --port 8000 --log-level debug
```

### 10.5 Frontend Proxy Issues

The Vite dev server proxies `/api/` to `http://localhost:8000`. Ensure:
1. Backend is running on port 8000
2. Check `vite.config.ts` for proxy settings

---

## 11. Quick Reference

| Service | Port | URL |
|---------|------|-----|
| Frontend (Vite dev) | 5173 | http://localhost:5173 |
| Backend (FastAPI) | 8000 | http://localhost:8000 |
| API Docs (Swagger) | 8000 | http://localhost:8000/docs |
| API Docs (ReDoc) | 8000 | http://localhost:8000/redoc |
| Frontend (Docker) | 80 | http://localhost:80 |

### Default Credentials

| Setting | Value |
|---------|-------|
| Admin username | `admin` |
| Admin password | `admin123` |
| VM host | `192.168.64.3` |
| VM user | `root` |
| SSH key | `~/.ssh/id_ed25519` |
