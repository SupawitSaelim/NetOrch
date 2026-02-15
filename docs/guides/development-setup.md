# Development Setup Guide

## 1. Overview

This guide covers setting up a development environment for the Hybrid SDN Orchestration Platform (Phase 1: Single-Node).

## 2. System Requirements

### 2.1 Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Storage | 20 GB | 50+ GB |
| Network | 1 NIC | 2+ NICs |

### 2.2 Operating System

**Supported:**
- Ubuntu 22.04 LTS (Recommended)
- Ubuntu 24.04 LTS
- Debian 12

> **Note:** FRRouting, Open vSwitch, and Ryu require Linux. For Windows/macOS development, use a Linux VM or WSL2.

---

## 3. Development Environment Options

### Option A: Linux VM (Recommended for Full Stack)
- VMware / VirtualBox / Hyper-V
- Full access to all networking features

### Option B: WSL2 (Windows)
- Good for backend/frontend development
- Limited OVS/FRR functionality

### Option C: Docker Compose
- Containerized development
- Good for testing API and frontend

---

## 4. Base System Setup (Ubuntu/Debian)

### 4.1 Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 4.2 Install Essential Tools

```bash
sudo apt install -y \
    git \
    curl \
    wget \
    vim \
    htop \
    net-tools \
    iproute2 \
    bridge-utils \
    tcpdump \
    build-essential \
    software-properties-common
```

---

## 5. Python Environment Setup

### 5.1 Install Python 3.11+

```bash
# Ubuntu 22.04+ includes Python 3.10+
sudo apt install -y python3 python3-pip python3-venv

# Verify version
python3 --version
```

### 5.2 Install Poetry (Recommended)

```bash
curl -sSL https://install.python-poetry.org | python3 -

# Add to PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify
poetry --version
```

### 5.3 Alternative: pip + venv

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
```

---

## 6. Node.js Environment Setup

### 6.1 Install Node.js (via nvm)

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell
source ~/.bashrc

# Install Node.js LTS
nvm install --lts
nvm use --lts

# Verify
node --version
npm --version
```

### 6.2 Install pnpm (Recommended)

```bash
npm install -g pnpm

# Verify
pnpm --version
```

---

## 7. FRRouting Installation

### 7.1 Add FRR Repository

```bash
# Add GPG key
curl -s https://deb.frrouting.org/frr/keys.gpg | sudo tee /usr/share/keyrings/frrouting.gpg > /dev/null

# Add repository
FRRVER="frr-stable"
echo "deb [signed-by=/usr/share/keyrings/frrouting.gpg] https://deb.frrouting.org/frr $(lsb_release -s -c) $FRRVER" | sudo tee /etc/apt/sources.list.d/frr.list
```

### 7.2 Install FRR

```bash
sudo apt update
sudo apt install -y frr frr-pythontools
```

### 7.3 Enable Daemons

Edit `/etc/frr/daemons`:

```bash
sudo vim /etc/frr/daemons
```

Enable required daemons:
```
zebra=yes
bgpd=yes
ospfd=yes
# Enable others as needed
```

### 7.4 Start FRR Service

```bash
sudo systemctl enable frr
sudo systemctl start frr
sudo systemctl status frr

# Verify
sudo vtysh -c "show version"
```

---

## 8. Open vSwitch Installation

### 8.1 Install OVS

```bash
sudo apt install -y openvswitch-switch openvswitch-common
```

### 8.2 Verify Installation

```bash
sudo systemctl enable openvswitch-switch
sudo systemctl start openvswitch-switch

# Check version
sudo ovs-vsctl --version

# Check status
sudo ovs-vsctl show
```

### 8.3 Create Test Bridge

```bash
# Create bridge
sudo ovs-vsctl add-br br0

# Set OpenFlow version
sudo ovs-vsctl set bridge br0 protocols=OpenFlow13

# Verify
sudo ovs-vsctl show
```

---

## 9. Ryu SDN Controller Installation

### 9.1 Install Ryu

```bash
# In your Python virtual environment
pip install ryu

# Verify
ryu-manager --version
```

### 9.2 Test Ryu

```bash
# Run simple switch app
ryu-manager ryu.app.simple_switch_13

# Run with REST API
ryu-manager ryu.app.simple_switch_13 ryu.app.ofctl_rest
```

### 9.3 Connect OVS to Ryu

```bash
# Set controller for bridge
sudo ovs-vsctl set-controller br0 tcp:127.0.0.1:6633

# Verify connection
sudo ovs-vsctl show
```

---

## 10. Project Setup

### 10.1 Clone Repository

```bash
cd ~/projects
git clone <repository-url> sdn-platform
cd sdn-platform
```

### 10.2 Project Structure

```
sdn-platform/
├── backend/              # FastAPI backend
├── frontend/             # React frontend
├── ryu_app/              # Custom Ryu application
├── configs/              # Configuration templates
├── scripts/              # Setup and utility scripts
├── docs/                 # Documentation
├── tests/                # Test suites
├── docker/               # Docker files
└── README.md
```

### 10.3 Backend Setup

```bash
cd backend

# Using Poetry
poetry install
poetry shell

# Or using pip
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 10.4 Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env.local

# Run development server
pnpm dev
```

---

## 11. Development Workflow

### 11.1 Service Startup Order

```bash
# 1. Start OVS (usually auto-started)
sudo systemctl start openvswitch-switch

# 2. Start FRR
sudo systemctl start frr

# 3. Start Ryu Controller (terminal 1)
cd ryu_app
ryu-manager orchestration_app.py

# 4. Start Backend (terminal 2)
cd backend
uvicorn app.main:app --reload

# 5. Start Frontend (terminal 3)
cd frontend
pnpm dev
```

### 11.2 Useful Commands

```bash
# FRR
sudo vtysh                          # Enter FRR shell
sudo vtysh -c "show ip route"       # Show routing table
sudo vtysh -c "show bgp summary"    # Show BGP status

# OVS
sudo ovs-vsctl show                 # Show OVS config
sudo ovs-ofctl dump-flows br0       # Show flow table
sudo ovs-vsctl list-br              # List bridges

# Ryu
curl http://localhost:8080/stats/switches  # List switches via REST
```

---

## 12. Testing Setup

### 12.1 Create Virtual Network

```bash
# Create namespaces for testing
sudo ip netns add host1
sudo ip netns add host2

# Create veth pairs
sudo ip link add veth1 type veth peer name veth1-br
sudo ip link add veth2 type veth peer name veth2-br

# Attach to namespaces
sudo ip link set veth1 netns host1
sudo ip link set veth2 netns host2

# Attach to OVS bridge
sudo ovs-vsctl add-port br0 veth1-br
sudo ovs-vsctl add-port br0 veth2-br

# Configure IPs
sudo ip netns exec host1 ip addr add 10.0.0.1/24 dev veth1
sudo ip netns exec host2 ip addr add 10.0.0.2/24 dev veth2

# Bring up interfaces
sudo ip link set veth1-br up
sudo ip link set veth2-br up
sudo ip netns exec host1 ip link set veth1 up
sudo ip netns exec host2 ip link set veth2 up
sudo ip netns exec host1 ip link set lo up
sudo ip netns exec host2 ip link set lo up
```

### 12.2 Test Connectivity

```bash
# Ping from host1 to host2
sudo ip netns exec host1 ping 10.0.0.2
```

---

## 13. VS Code Configuration

### 13.1 Recommended Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-python.python",
    "ms-python.vscode-pylance",
    "charliermarsh.ruff",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode-remote.remote-ssh"
  ]
}
```

### 13.2 Settings

```json
// .vscode/settings.json
{
  "python.defaultInterpreterPath": "./backend/.venv/bin/python",
  "python.analysis.typeCheckingMode": "basic",
  "[python]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "charliermarsh.ruff"
  },
  "[typescript]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

---

## 14. Troubleshooting

### 14.1 FRR Issues

```bash
# Check FRR status
sudo systemctl status frr
sudo journalctl -u frr -f

# Check daemon status
sudo vtysh -c "show logging"

# Restart FRR
sudo systemctl restart frr
```

### 14.2 OVS Issues

```bash
# Check OVS service
sudo systemctl status openvswitch-switch
sudo journalctl -u openvswitch-switch

# Check OVS database
sudo ovsdb-tool show-log

# Restart OVS
sudo systemctl restart openvswitch-switch
```

### 14.3 Ryu Issues

```bash
# Check if port 6633 is in use
sudo netstat -tlnp | grep 6633

# Check OpenFlow connection
sudo ovs-vsctl get-controller br0

# Debug mode
ryu-manager --verbose orchestration_app.py
```

### 14.4 Permission Issues

```bash
# Add user to necessary groups
sudo usermod -aG sudo $USER
sudo usermod -aG frr $USER
sudo usermod -aG frrvty $USER

# Fix vtysh permission
sudo chmod 755 /etc/frr
sudo chmod 640 /etc/frr/frr.conf
sudo chown frr:frrvty /etc/frr/frr.conf
```

---

## 15. Next Steps

After completing the setup:

1. **Run Tests**: `pytest tests/` (backend), `pnpm test` (frontend)
2. **Review API Docs**: Open `http://localhost:8000/docs`
3. **Access Web UI**: Open `http://localhost:5173`
4. **Start Development**: Check the component design docs for implementation details

---

## 16. Quick Reference

| Service | Port | URL |
|---------|------|-----|
| Frontend (Vite) | 5173 | http://localhost:5173 |
| Backend (FastAPI) | 8000 | http://localhost:8000 |
| API Docs | 8000 | http://localhost:8000/docs |
| Ryu REST | 8080 | http://localhost:8080 |
| OpenFlow | 6633 | tcp://localhost:6633 |
| FRR (vtysh) | - | `sudo vtysh` |
