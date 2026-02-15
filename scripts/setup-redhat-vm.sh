#!/bin/bash
set -e

echo "========================================="
echo "  NetOrch - Red Hat VM Setup Script"
echo "========================================="

# --- Step 1: Install Open vSwitch ---
echo ""
echo "[1/4] Installing Open vSwitch..."
if rpm -q openvswitch > /dev/null 2>&1; then
    echo "  OVS already installed: $(rpm -q openvswitch)"
else
    # Try from RHEL repos first
    if dnf install -y openvswitch 2>/dev/null; then
        echo "  OVS installed from RHEL repos"
    else
        echo "  OVS not in standard repos, building from source..."
        dnf install -y gcc make python3 python3-devel openssl-devel \
            autoconf automake libtool kernel-devel-$(uname -r) 2>/dev/null || \
        dnf install -y gcc make python3 python3-devel openssl-devel \
            autoconf automake libtool
        
        cd /tmp
        if [ ! -d ovs-src ]; then
            dnf install -y wget
            wget -q https://www.openvswitch.org/releases/openvswitch-3.4.1.tar.gz
            tar xzf openvswitch-3.4.1.tar.gz
            mv openvswitch-3.4.1 ovs-src
        fi
        cd ovs-src
        ./configure --prefix=/usr --localstatedir=/var --sysconfdir=/etc
        make -j$(nproc)
        make install
        
        # Create systemd service
        cat > /etc/systemd/system/openvswitch.service <<'EOF'
[Unit]
Description=Open vSwitch
After=network.target

[Service]
Type=forking
ExecStartPre=/usr/bin/ovsdb-tool create /etc/openvswitch/conf.db /usr/share/openvswitch/vswitch.ovsschema
ExecStart=/bin/bash -c '/usr/sbin/ovsdb-server --remote=punix:/var/run/openvswitch/db.sock --pidfile --detach && /usr/sbin/ovs-vswitchd --pidfile --detach'
ExecStop=/bin/bash -c 'ovs-appctl -t ovs-vswitchd exit; ovs-appctl -t ovsdb-server exit'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
        mkdir -p /etc/openvswitch /var/run/openvswitch
        echo "  OVS built from source"
    fi
fi

# --- Step 2: Install Python + Ryu dependencies ---
echo ""
echo "[2/4] Installing Python and Ryu SDN Controller..."
dnf install -y python3 python3-pip python3-devel gcc 2>/dev/null || true

# Install Ryu (or os-ken which is the maintained fork)
pip3 install eventlet==0.33.3 os-ken 2>/dev/null || pip3 install --break-system-packages eventlet==0.33.3 os-ken 2>/dev/null || {
    echo "  Trying with venv..."
    python3 -m venv /opt/ryu-env
    /opt/ryu-env/bin/pip install eventlet==0.33.3 os-ken
    ln -sf /opt/ryu-env/bin/osken-manager /usr/local/bin/osken-manager
    ln -sf /opt/ryu-env/bin/ryu-manager /usr/local/bin/ryu-manager 2>/dev/null || true
}

# --- Step 3: Enable IP forwarding ---
echo ""
echo "[3/4] Configuring system networking..."
sysctl -w net.ipv4.ip_forward=1
grep -q 'net.ipv4.ip_forward' /etc/sysctl.conf 2>/dev/null || echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf

# --- Step 4: Start services ---
echo ""
echo "[4/4] Starting services..."

# FRR
systemctl enable frr --now 2>/dev/null || true
echo "  FRR: $(systemctl is-active frr 2>/dev/null || echo 'not running')"

# OVS
if command -v ovs-vsctl &>/dev/null; then
    mkdir -p /etc/openvswitch /var/run/openvswitch
    
    if systemctl list-unit-files | grep -q openvswitch; then
        systemctl enable openvswitch --now 2>/dev/null || true
    else
        # Manual start if no systemd unit
        ovsdb-tool create /etc/openvswitch/conf.db /usr/share/openvswitch/vswitch.ovsschema 2>/dev/null || true
        ovsdb-server --remote=punix:/var/run/openvswitch/db.sock --pidfile --detach 2>/dev/null || true
        ovs-vswitchd --pidfile --detach 2>/dev/null || true
    fi
    echo "  OVS: $(ovs-vsctl --version 2>/dev/null | head -1 || echo 'not running')"
else
    echo "  OVS: not installed yet"
fi

# Firewall rules - open ports for FRR API, Ryu, OVS
echo ""
echo "Opening firewall ports..."
firewall-cmd --permanent --add-port=8080/tcp 2>/dev/null || true  # Ryu REST API
firewall-cmd --permanent --add-port=6633/tcp 2>/dev/null || true  # OpenFlow
firewall-cmd --permanent --add-port=6653/tcp 2>/dev/null || true  # OpenFlow 1.3
firewall-cmd --permanent --add-port=2620/tcp 2>/dev/null || true  # FRR vtysh
firewall-cmd --reload 2>/dev/null || true

echo ""
echo "========================================="
echo "  Setup Summary"
echo "========================================="
echo "FRR version: $(vtysh -c 'show version' 2>/dev/null | head -1 || rpm -q frr 2>/dev/null || echo 'N/A')"
echo "OVS version: $(ovs-vsctl --version 2>/dev/null | head -1 || echo 'N/A')"
echo "Python: $(python3 --version 2>/dev/null)"
echo "Ryu/os-ken: $(pip3 show os-ken 2>/dev/null | grep Version || /opt/ryu-env/bin/pip show os-ken 2>/dev/null | grep Version || echo 'N/A')"
echo "IP Forward: $(cat /proc/sys/net/ipv4/ip_forward)"
echo "FRR status: $(systemctl is-active frr 2>/dev/null)"
echo "========================================="
