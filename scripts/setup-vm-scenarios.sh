#!/bin/bash
set -e

echo "=== Setting up network scenarios on VM ==="

# --- Create br1 (second switch) ---
ovs-vsctl --may-exist add-br br1
ovs-vsctl set bridge br1 protocols=OpenFlow13
ovs-vsctl set-controller br1 tcp:127.0.0.1:6653
echo "[OK] br1 created"

# --- Add a VXLAN tunnel on br0 (to remote site) ---
ovs-vsctl --may-exist add-port br0 vxlan0 -- set interface vxlan0 type=vxlan options:remote_ip=192.168.64.100 options:key=100
echo "[OK] VXLAN tunnel on br0"

# --- Add a VXLAN tunnel on br1 (to another remote site) ---
ovs-vsctl --may-exist add-port br1 vxlan1 -- set interface vxlan1 type=vxlan options:remote_ip=192.168.64.101 options:key=200
echo "[OK] VXLAN tunnel on br1"

# --- Add virtual host ports ---
ovs-vsctl --may-exist add-port br0 veth-h1 -- set interface veth-h1 type=internal
ovs-vsctl --may-exist add-port br1 veth-h2 -- set interface veth-h2 type=internal
ip addr add 10.10.1.1/24 dev veth-h1 2>/dev/null || true
ip addr add 10.10.2.1/24 dev veth-h2 2>/dev/null || true
ip link set veth-h1 up
ip link set veth-h2 up
echo "[OK] Virtual hosts veth-h1 and veth-h2"

# --- Add GRE tunnel on br1 ---
ovs-vsctl --may-exist add-port br1 gre0 -- set interface gre0 type=gre options:remote_ip=192.168.64.200
echo "[OK] GRE tunnel on br1"

# --- Add flow rules to br1 ---
ovs-ofctl -O OpenFlow13 add-flow br1 "priority=200,ip,nw_dst=10.10.2.0/24,actions=output:LOCAL"
ovs-ofctl -O OpenFlow13 add-flow br1 "priority=100,arp,actions=FLOOD"
ovs-ofctl -O OpenFlow13 add-flow br1 "priority=50,ip,actions=NORMAL"
echo "[OK] br1 flow rules"

# --- Verify ---
echo ""
echo "=== Bridges ==="
ovs-vsctl list-br
echo ""
echo "=== br0 ports ==="
ovs-vsctl list-ports br0
echo ""
echo "=== br1 ports ==="
ovs-vsctl list-ports br1
echo ""
echo "=== br0 flows ==="
ovs-ofctl -O OpenFlow13 dump-flows br0
echo ""
echo "=== br1 flows ==="
ovs-ofctl -O OpenFlow13 dump-flows br1
echo ""
echo "=== Done ==="
