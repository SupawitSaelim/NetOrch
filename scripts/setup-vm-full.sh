#!/bin/bash
# Run with: nohup bash /root/setup.sh > /root/setup.log 2>&1 &
# Check progress: tail -f /root/setup.log

exec > /root/setup.log 2>&1
echo "========================================="
echo "  NetOrch - Red Hat VM Setup"
echo "  Started: $(date)"
echo "========================================="

# --- Step 1: Build deps ---
echo ""
echo "[STEP 1] Installing build dependencies..."
dnf install -y gcc make python3 python3-pip python3-devel openssl-devel \
    autoconf automake libtool wget
echo "STEP1_DONE"

# --- Step 2: Build OVS from source ---
echo ""
echo "[STEP 2] Building Open vSwitch 3.4.1 from source..."
cd /tmp
if [ ! -f openvswitch-3.4.1.tar.gz ]; then
    wget -q https://www.openvswitch.org/releases/openvswitch-3.4.1.tar.gz
fi
rm -rf openvswitch-3.4.1
tar xzf openvswitch-3.4.1.tar.gz
cd openvswitch-3.4.1
./configure --prefix=/usr --localstatedir=/var --sysconfdir=/etc
make -j$(nproc)
make install
echo "STEP2_DONE"

# Create OVS directories
mkdir -p /etc/openvswitch /var/run/openvswitch /var/log/openvswitch

# Create ovsdb if not exists
if [ ! -f /etc/openvswitch/conf.db ]; then
    ovsdb-tool create /etc/openvswitch/conf.db /usr/share/openvswitch/vswitch.ovsschema
fi

# Create systemd service files
cat > /etc/systemd/system/ovsdb-server.service <<'EOF'
[Unit]
Description=Open vSwitch Database Server
After=network.target

[Service]
Type=forking
ExecStart=/usr/sbin/ovsdb-server /etc/openvswitch/conf.db \
    --remote=punix:/var/run/openvswitch/db.sock \
    --remote=db:Open_vSwitch,Open_vSwitch,manager_options \
    --pidfile=/var/run/openvswitch/ovsdb-server.pid \
    --log-file=/var/log/openvswitch/ovsdb-server.log \
    --detach
PIDFile=/var/run/openvswitch/ovsdb-server.pid
ExecStop=/usr/bin/ovs-appctl -t ovsdb-server exit
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/ovs-vswitchd.service <<'EOF'
[Unit]
Description=Open vSwitch Forwarding Unit
After=ovsdb-server.service
Requires=ovsdb-server.service

[Service]
Type=forking
ExecStart=/usr/sbin/ovs-vswitchd \
    --pidfile=/var/run/openvswitch/ovs-vswitchd.pid \
    --log-file=/var/log/openvswitch/ovs-vswitchd.log \
    --detach
PIDFile=/var/run/openvswitch/ovs-vswitchd.pid
ExecStop=/usr/bin/ovs-appctl -t ovs-vswitchd exit
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ovsdb-server ovs-vswitchd
systemctl start ovsdb-server
systemctl start ovs-vswitchd
echo "OVS services: ovsdb=$(systemctl is-active ovsdb-server) vswitchd=$(systemctl is-active ovs-vswitchd)"
echo "STEP2_SERVICES_DONE"

# --- Step 3: Install Ryu/os-ken SDN Controller ---
echo ""
echo "[STEP 3] Installing Ryu (os-ken) SDN Controller..."
python3 -m venv /opt/ryu-env
/opt/ryu-env/bin/pip install --upgrade pip
/opt/ryu-env/bin/pip install eventlet==0.33.3 os-ken
ln -sf /opt/ryu-env/bin/osken-manager /usr/local/bin/osken-manager

# Create Ryu app for REST API and simple switch
cat > /opt/ryu-env/netorch_ryu_app.py <<'RYUAPP'
from os_ken.app.wsgi import WSGIApplication
from os_ken.base import app_manager
from os_ken.controller import ofp_event
from os_ken.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER, set_ev_cls
from os_ken.ofproto import ofproto_v1_3
from os_ken.lib.packet import packet, ethernet
import json
from webob import Response
from os_ken.app.wsgi import ControllerBase, route

SIMPLE_SWITCH_INSTANCE_NAME = 'simple_switch_api'
URL_PREFIX = '/stats'

class SimpleSwitchRest13(app_manager.RyuApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]
    _CONTEXTS = {'wsgi': WSGIApplication}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.mac_to_port = {}
        self.switches = {}
        wsgi = kwargs['wsgi']
        wsgi.register(SimpleSwitchController, {SIMPLE_SWITCH_INSTANCE_NAME: self})

    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):
        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        self.switches[datapath.id] = datapath
        # Install table-miss flow entry
        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER, ofproto.OFPCML_NO_BUFFER)]
        inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS, actions)]
        mod = parser.OFPFlowMod(datapath=datapath, priority=0, match=match, instructions=inst)
        datapath.send_msg(mod)
        self.logger.info(f"Switch {datapath.id} connected")

    @set_ev_cls(ofp_event.EventOFPPacketIn, MAIN_DISPATCHER)
    def packet_in_handler(self, ev):
        msg = ev.msg
        datapath = msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        in_port = msg.match['in_port']
        pkt = packet.Packet(msg.data)
        eth = pkt.get_protocols(ethernet.ethernet)[0]
        dst = eth.dst
        src = eth.src
        dpid = datapath.id
        self.mac_to_port.setdefault(dpid, {})
        self.mac_to_port[dpid][src] = in_port
        if dst in self.mac_to_port[dpid]:
            out_port = self.mac_to_port[dpid][dst]
        else:
            out_port = ofproto.OFPP_FLOOD
        actions = [parser.OFPActionOutput(out_port)]
        if out_port != ofproto.OFPP_FLOOD:
            match = parser.OFPMatch(in_port=in_port, eth_dst=dst, eth_src=src)
            inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS, actions)]
            mod = parser.OFPFlowMod(datapath=datapath, priority=1, match=match, instructions=inst, buffer_id=msg.buffer_id)
            datapath.send_msg(mod)
        data = None
        if msg.buffer_id == ofproto.OFP_NO_BUFFER:
            data = msg.data
        out = parser.OFPPacketOut(datapath=datapath, buffer_id=msg.buffer_id, in_port=in_port, actions=actions, data=data)
        datapath.send_msg(out)


class SimpleSwitchController(ControllerBase):
    def __init__(self, req, link, data, **config):
        super().__init__(req, link, data, **config)
        self.simple_switch_app = data[SIMPLE_SWITCH_INSTANCE_NAME]

    @route('switches', '/switches', methods=['GET'])
    def list_switches(self, req, **kwargs):
        body = json.dumps(list(self.simple_switch_app.switches.keys()))
        return Response(content_type='application/json', body=body)

    @route('health', '/health', methods=['GET'])
    def health(self, req, **kwargs):
        body = json.dumps({
            'status': 'running',
            'switches': len(self.simple_switch_app.switches),
            'controller': 'os-ken'
        })
        return Response(content_type='application/json', body=body)
RYUAPP

# Create systemd service for Ryu
cat > /etc/systemd/system/ryu-controller.service <<'EOF'
[Unit]
Description=Ryu SDN Controller (os-ken)
After=network.target ovs-vswitchd.service

[Service]
Type=simple
ExecStart=/opt/ryu-env/bin/osken-manager --wsapi-port 8080 --ofp-tcp-listen-port 6653 /opt/ryu-env/netorch_ryu_app.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ryu-controller
systemctl start ryu-controller
echo "Ryu status: $(systemctl is-active ryu-controller)"
echo "STEP3_DONE"

# --- Step 4: Configure FRR ---
echo ""
echo "[STEP 4] Configuring FRR..."

# Enable FRR daemons
cat > /etc/frr/daemons <<'EOF'
bgpd=yes
ospfd=yes
zebra=yes
staticd=yes
bfdd=no
fabricd=no
isisd=no
ldpd=no
nhrpd=no
eigrpd=no
babeld=no
sharpd=no
pbrd=no
pimd=no
pim6d=no
vrrpd=no
pathd=no
EOF

# FRR config
cat > /etc/frr/frr.conf <<'EOF'
frr version 10.1
frr defaults traditional
hostname netorch-router
log syslog informational
no ipv6 forwarding
!
router bgp 65001
 bgp router-id 192.168.64.3
 neighbor 192.168.64.10 remote-as 65002
 !
 address-family ipv4 unicast
  network 192.168.64.0/24
 exit-address-family
exit
!
router ospf
 ospf router-id 192.168.64.3
 network 192.168.64.0/24 area 0.0.0.0
exit
!
ip route 10.0.0.0/24 192.168.64.1
ip route 172.16.0.0/16 192.168.64.1
!
line vty
!
EOF

# FRR HTTP API (vtysh HTTP)
if grep -q 'http-api' /etc/frr/daemons 2>/dev/null; then
    echo "http-api already configured"
else
    echo '' >> /etc/frr/daemons
    echo '# Enable FRR northbound API' >> /etc/frr/daemons
    echo 'mgmtd=yes' >> /etc/frr/daemons
fi

systemctl enable frr
systemctl restart frr
echo "FRR status: $(systemctl is-active frr)"
echo "STEP4_DONE"

# --- Step 5: System config ---
echo ""
echo "[STEP 5] System configuration..."

# IP forwarding
sysctl -w net.ipv4.ip_forward=1
echo 'net.ipv4.ip_forward = 1' > /etc/sysctl.d/99-netorch.conf
sysctl -p /etc/sysctl.d/99-netorch.conf

# Firewall
firewall-cmd --permanent --add-port=8080/tcp 2>/dev/null || true  # Ryu REST
firewall-cmd --permanent --add-port=6633/tcp 2>/dev/null || true  # OpenFlow
firewall-cmd --permanent --add-port=6653/tcp 2>/dev/null || true  # OpenFlow 1.3
firewall-cmd --permanent --add-port=2601/tcp 2>/dev/null || true  # FRR zebra
firewall-cmd --permanent --add-port=2605/tcp 2>/dev/null || true  # FRR BGPd
firewall-cmd --reload 2>/dev/null || true
echo "STEP5_DONE"

# --- Step 6: Create OVS demo bridge ---
echo ""
echo "[STEP 6] Creating OVS demo bridge..."
ovs-vsctl --may-exist add-br br0
ovs-vsctl set-controller br0 tcp:127.0.0.1:6653
ovs-vsctl set bridge br0 protocols=OpenFlow13
echo "OVS bridges: $(ovs-vsctl list-br)"
echo "STEP6_DONE"

# --- Summary ---
echo ""
echo "========================================="
echo "  SETUP COMPLETE - $(date)"
echo "========================================="
echo "FRR:  $(systemctl is-active frr) ($(rpm -q frr))"
echo "OVS:  $(ovs-vsctl --version | head -1)"
echo "Ryu:  $(systemctl is-active ryu-controller)"
echo "IP Forward: $(cat /proc/sys/net/ipv4/ip_forward)"
echo "Bridges: $(ovs-vsctl list-br)"
echo "========================================="
echo "ALL_DONE"
