#!/bin/bash
# Fix OVS startup on RHEL 10

# Kill stale processes
pkill -f ovsdb-server 2>/dev/null || true
pkill -f ovs-vswitchd 2>/dev/null || true
sleep 1

# Setup directories
mkdir -p /run/openvswitch /etc/openvswitch /var/log/openvswitch

# Symlink so ovs-vsctl finds the socket at default path
rm -f /var/run/openvswitch
ln -sf /run/openvswitch /var/run/openvswitch

# Recreate DB
rm -f /etc/openvswitch/conf.db
ovsdb-tool create /etc/openvswitch/conf.db /usr/share/openvswitch/vswitch.ovsschema

# Start ovsdb-server
ovsdb-server /etc/openvswitch/conf.db \
    --remote=punix:/run/openvswitch/db.sock \
    --remote=db:Open_vSwitch,Open_vSwitch,manager_options \
    --pidfile=/run/openvswitch/ovsdb-server.pid \
    --log-file=/var/log/openvswitch/ovsdb-server.log \
    --detach
echo "ovsdb-server: $?"

# Init OVS DB
ovs-vsctl --no-wait init
echo "ovs-vsctl init: $?"

# Start vswitchd
ovs-vswitchd unix:/run/openvswitch/db.sock \
    --pidfile=/run/openvswitch/ovs-vswitchd.pid \
    --log-file=/var/log/openvswitch/ovs-vswitchd.log \
    --detach
echo "ovs-vswitchd: $?"

# Create bridge
ovs-vsctl --may-exist add-br br0
ovs-vsctl set-controller br0 tcp:127.0.0.1:6653
ovs-vsctl set bridge br0 protocols=OpenFlow13

# Show results
echo "=== OVS Status ==="
ovs-vsctl show
echo "=== Bridges ==="
ovs-vsctl list-br
echo "=== Version ==="
ovs-vsctl --version | head -1
