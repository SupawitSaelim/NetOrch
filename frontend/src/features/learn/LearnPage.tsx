import { useState } from 'react';

/* ═══════════════════════════════════════════════════════════════
   Learning Hub – FRRouting · Open vSwitch · Ryu SDN Controller
   ═══════════════════════════════════════════════════════════════ */

// ── Types ──
interface SubTopic {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface Topic {
  id: string;
  label: string;
  icon: string;
  color: string;
  subtopics: SubTopic[];
}

// ── Style helpers ──
const code: React.CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '14px 18px',
  fontFamily: '"JetBrains Mono", "Fira Code", Menlo, monospace',
  fontSize: 12.5,
  lineHeight: 1.7,
  overflowX: 'auto',
  display: 'block',
  whiteSpace: 'pre',
  margin: '10px 0',
};

const h3Style: React.CSSProperties = { fontSize: 18, fontWeight: 700, margin: '24px 0 10px' };
const h4Style: React.CSSProperties = { fontSize: 15, fontWeight: 600, margin: '18px 0 8px', color: 'var(--color-primary)' };
const pStyle: React.CSSProperties = { lineHeight: 1.75, margin: '8px 0', fontSize: 14 };
const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', margin: '10px 0', fontSize: 13,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid var(--color-border)',
  fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--color-text-muted)',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 12px', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top',
};
const tipBox: React.CSSProperties = {
  background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
  borderRadius: 8, padding: '12px 16px', margin: '12px 0', fontSize: 13,
};

// ═══════════════════════════════════════════════════════════════
//  CONTENT – FRRouting
// ═══════════════════════════════════════════════════════════════

const frrTopics: SubTopic[] = [
  {
    id: 'frr-what',
    title: 'What is FRRouting?',
    content: (
      <>
        <h3 style={h3Style}>What is FRRouting (FRR)?</h3>
        <p style={pStyle}>
          <b>FRRouting</b> is a free and open-source Internet routing protocol suite for Linux and Unix platforms.
          It implements <b>BGP, OSPF, RIP, IS-IS, PIM, LDP, BFD, Babel, PBR, OpenFabric,</b> and <b>VRRP</b>,
          with alpha support for EIGRP and NHRP.
        </p>
        <p style={pStyle}>
          FRR is a fork of <b>Quagga</b>, which was itself a fork of GNU Zebra. It is widely used in
          data centers, ISPs, and enterprises as a software-based routing stack running on commodity hardware.
        </p>

        <h4 style={h4Style}>Key Features</h4>
        <ul style={{ ...pStyle, paddingLeft: 20 }}>
          <li><b>Multi-protocol:</b> BGP4, OSPFv2/v3, RIPv1/v2, IS-IS, and more</li>
          <li><b>Cisco-like CLI:</b> Uses <code>vtysh</code> — familiar to anyone who has used IOS</li>
          <li><b>VRF Support:</b> Virtual Routing and Forwarding for multi-tenant environments</li>
          <li><b>Route Maps & Prefix Lists:</b> Full policy-based routing control</li>
          <li><b>High Availability:</b> BFD, VRRP, Graceful Restart</li>
          <li><b>Modular Daemons:</b> Each protocol runs as a separate process (bgpd, ospfd, etc.)</li>
        </ul>

        <h4 style={h4Style}>Architecture</h4>
        <p style={pStyle}>FRR consists of multiple daemons coordinated by a core process:</p>
        <pre style={code}>{`┌─────────────────────────────────────────┐
│                 vtysh                   │  ← Unified CLI shell
├─────────┬─────────┬─────────┬──────────┤
│  bgpd   │  ospfd  │  isisd  │  ripd    │  ← Protocol daemons
├─────────┴─────────┴─────────┴──────────┤
│              zebra (core)               │  ← RIB manager + kernel interaction
├─────────────────────────────────────────┤
│          Linux Kernel (FIB)             │  ← Actual packet forwarding
└─────────────────────────────────────────┘`}</pre>

        <div style={tipBox}>
          💡 <b>Tip:</b> The <code>zebra</code> daemon is the core — it manages the Routing Information Base (RIB)
          and pushes selected routes into the Linux kernel's Forwarding Information Base (FIB).
        </div>

        <h4 style={h4Style}>Common Use Cases</h4>
        <ul style={{ ...pStyle, paddingLeft: 20 }}>
          <li>Data center leaf/spine routing (BGP unnumbered)</li>
          <li>WAN routers connecting sites via OSPF or BGP</li>
          <li>Internet Exchange Point (IXP) route servers</li>
          <li>Network labs and education</li>
          <li>SD-WAN underlay routing</li>
        </ul>
      </>
    ),
  },
  {
    id: 'frr-concepts',
    title: 'Key Concepts',
    content: (
      <>
        <h3 style={h3Style}>FRRouting Key Concepts</h3>

        <h4 style={h4Style}>1. BGP (Border Gateway Protocol)</h4>
        <p style={pStyle}>
          The de facto standard for inter-domain routing on the Internet. BGP is a <b>path-vector</b> protocol
          that exchanges reachability information between <b>Autonomous Systems (AS)</b>.
        </p>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Term</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}><b>AS (Autonomous System)</b></td><td style={tdStyle}>A group of networks under a single administrative control, identified by an ASN (e.g., AS65001)</td></tr>
            <tr><td style={tdStyle}><b>iBGP</b></td><td style={tdStyle}>BGP peering between routers in the same AS</td></tr>
            <tr><td style={tdStyle}><b>eBGP</b></td><td style={tdStyle}>BGP peering between routers in different ASes</td></tr>
            <tr><td style={tdStyle}><b>Prefix</b></td><td style={tdStyle}>A network address block (e.g., 10.0.0.0/24) announced via BGP</td></tr>
            <tr><td style={tdStyle}><b>AS-PATH</b></td><td style={tdStyle}>List of ASes a route has traversed — used for loop prevention and path selection</td></tr>
            <tr><td style={tdStyle}><b>Next-Hop</b></td><td style={tdStyle}>The IP address of the next router to reach a destination</td></tr>
            <tr><td style={tdStyle}><b>Route Reflector</b></td><td style={tdStyle}>Reduces full-mesh iBGP requirement by reflecting routes to clients</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>2. OSPF (Open Shortest Path First)</h4>
        <p style={pStyle}>
          A <b>link-state</b> interior gateway protocol (IGP). OSPF routers exchange Link State Advertisements (LSAs)
          to build a complete topology map, then use <b>Dijkstra's SPF algorithm</b> to calculate the shortest paths.
        </p>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Term</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}><b>Area</b></td><td style={tdStyle}>A logical grouping of routers. Area 0 is the backbone.</td></tr>
            <tr><td style={tdStyle}><b>DR / BDR</b></td><td style={tdStyle}>Designated Router / Backup DR — elected on multi-access networks to reduce flooding</td></tr>
            <tr><td style={tdStyle}><b>LSA</b></td><td style={tdStyle}>Link State Advertisement — describes a router's links and their costs</td></tr>
            <tr><td style={tdStyle}><b>Cost</b></td><td style={tdStyle}>Metric based on interface bandwidth (lower = preferred)</td></tr>
            <tr><td style={tdStyle}><b>SPF</b></td><td style={tdStyle}>Shortest Path First (Dijkstra) algorithm used to build the routing table</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>3. VRF (Virtual Routing and Forwarding)</h4>
        <p style={pStyle}>
          VRF allows a single router to maintain <b>multiple isolated routing tables</b>. Each VRF has its own
          set of interfaces, routes, and can run its own BGP/OSPF instance. This is essential for multi-tenancy.
        </p>
        <pre style={code}>{`# VRF "customer-a" sees: 10.0.0.0/24 via 192.168.1.1
# VRF "customer-b" sees: 10.0.0.0/24 via 172.16.1.1
# Same prefix, different routing — completely isolated`}</pre>

        <h4 style={h4Style}>4. Route Maps & Prefix Lists</h4>
        <p style={pStyle}>
          <b>Route Maps</b> are like ACLs for routing — they match routes and apply actions (permit/deny, modify attributes).
          <b>Prefix Lists</b> filter routes based on their network prefix.
        </p>
        <pre style={code}>{`ip prefix-list MY_NETS seq 10 permit 10.0.0.0/16 le 24
!
route-map EXPORT permit 10
  match ip address prefix-list MY_NETS
  set community 65001:100`}</pre>
      </>
    ),
  },
  {
    id: 'frr-commands',
    title: 'Essential Commands',
    content: (
      <>
        <h3 style={h3Style}>FRRouting Essential Commands</h3>
        <div style={tipBox}>
          💡 All commands below are run inside <code>vtysh</code> (the FRR CLI shell). Enter it by typing <code>vtysh</code> in the Linux terminal, or use the <b>Terminal</b> page in this platform.
        </div>

        <h4 style={h4Style}>General / System</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Command</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show version</td><td style={tdStyle}>Display FRR version and build info</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show running-config</td><td style={tdStyle}>Show the current active configuration</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>write memory</td><td style={tdStyle}>Save config to disk (persist across restarts)</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>configure terminal</td><td style={tdStyle}>Enter configuration mode</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show vrf</td><td style={tdStyle}>List all VRF instances</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show interface brief</td><td style={tdStyle}>Quick overview of all interfaces</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>Routing Table</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Command</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip route</td><td style={tdStyle}>Display the full IPv4 routing table</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip route summary</td><td style={tdStyle}>Route count by protocol</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip route 10.0.0.0/24</td><td style={tdStyle}>Show details for a specific prefix</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip route vrf NAME</td><td style={tdStyle}>Routing table for a specific VRF</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ipv6 route</td><td style={tdStyle}>Display the IPv6 routing table</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>BGP Commands</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Command</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip bgp summary</td><td style={tdStyle}>BGP neighbor summary — states, prefixes</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip bgp</td><td style={tdStyle}>Full BGP table</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip bgp neighbors</td><td style={tdStyle}>Detailed neighbor info</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip bgp neighbors X.X.X.X routes</td><td style={tdStyle}>Routes received from a specific neighbor</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>clear ip bgp *</td><td style={tdStyle}>Reset all BGP sessions</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>BGP Configuration Example</h4>
        <pre style={code}>{`configure terminal
!
router bgp 65001
  bgp router-id 10.0.0.1
  neighbor 10.0.0.2 remote-as 65002
  neighbor 10.0.0.2 description "Upstream ISP"
  !
  address-family ipv4 unicast
    network 192.168.1.0/24
    neighbor 10.0.0.2 activate
    neighbor 10.0.0.2 route-map IMPORT in
    neighbor 10.0.0.2 route-map EXPORT out
  exit-address-family
!
end
write memory`}</pre>

        <h4 style={h4Style}>OSPF Commands</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Command</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip ospf</td><td style={tdStyle}>OSPF process overview</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip ospf neighbor</td><td style={tdStyle}>OSPF neighbor states</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip ospf database</td><td style={tdStyle}>LSDB (Link State Database)</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip ospf route</td><td style={tdStyle}>OSPF computed routes</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>show ip ospf interface</td><td style={tdStyle}>OSPF-enabled interfaces</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>OSPF Configuration Example</h4>
        <pre style={code}>{`configure terminal
!
router ospf
  ospf router-id 10.0.0.1
  network 10.0.0.0/24 area 0
  network 192.168.1.0/24 area 1
  passive-interface eth0
!
end
write memory`}</pre>

        <h4 style={h4Style}>Static Routes</h4>
        <pre style={code}>{`configure terminal
!
ip route 172.16.0.0/16 10.0.0.254
ip route 0.0.0.0/0 192.168.1.1        ! default route
!
end
write memory`}</pre>
      </>
    ),
  },
  {
    id: 'frr-config',
    title: 'Configuration Files',
    content: (
      <>
        <h3 style={h3Style}>FRR Configuration Files & Daemons</h3>

        <h4 style={h4Style}>Main Config Files</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>File</th><th style={thStyle}>Purpose</th></tr></thead>
          <tbody>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/etc/frr/frr.conf</td><td style={tdStyle}>Unified configuration file (integrated mode)</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/etc/frr/daemons</td><td style={tdStyle}>Controls which daemons are enabled (bgpd=yes, ospfd=yes, etc.)</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/etc/frr/vtysh.conf</td><td style={tdStyle}>vtysh behavior settings</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>Daemons File Example</h4>
        <pre style={code}>{`# /etc/frr/daemons
zebra=yes       # MUST be enabled (core)
bgpd=yes        # BGP daemon
ospfd=yes       # OSPF daemon
isisd=no        # IS-IS daemon
ripd=no         # RIP daemon
pimd=no         # PIM multicast daemon
ldpd=no         # LDP (MPLS labels)
bfdd=yes        # BFD (failure detection)`}</pre>

        <h4 style={h4Style}>Service Management</h4>
        <pre style={code}>{`# Start / Stop / Restart FRR
sudo systemctl start frr
sudo systemctl stop frr
sudo systemctl restart frr
sudo systemctl status frr

# View logs
journalctl -u frr -f

# Enter CLI
vtysh`}</pre>

        <h4 style={h4Style}>Sample Complete Config</h4>
        <pre style={code}>{`! /etc/frr/frr.conf
frr version 10.1
frr defaults traditional
hostname netorch-router
log syslog informational
!
router bgp 65001
  bgp router-id 10.0.0.1
  neighbor 10.0.0.2 remote-as 65002
  address-family ipv4 unicast
    network 192.168.0.0/16
  exit-address-family
!
router ospf
  ospf router-id 10.0.0.1
  network 10.0.0.0/24 area 0
!
ip route 0.0.0.0/0 192.168.64.1
!
line vty
!`}</pre>
      </>
    ),
  },
];

// ═══════════════════════════════════════════════════════════════
//  CONTENT – Open vSwitch
// ═══════════════════════════════════════════════════════════════

const ovsTopics: SubTopic[] = [
  {
    id: 'ovs-what',
    title: 'What is Open vSwitch?',
    content: (
      <>
        <h3 style={h3Style}>What is Open vSwitch (OVS)?</h3>
        <p style={pStyle}>
          <b>Open vSwitch</b> is a production-quality, multilayer virtual switch. It is designed to enable
          massive network automation through programmatic extension, while supporting standard management
          interfaces and protocols (OpenFlow, OVSDB, sFlow, IPFIX, LACP, 802.1Q).
        </p>
        <p style={pStyle}>
          OVS is the most widely deployed virtual switch in cloud environments. It powers networking
          in <b>OpenStack, Kubernetes (with OVN), CloudStack,</b> and many SDN platforms.
        </p>

        <h4 style={h4Style}>Key Features</h4>
        <ul style={{ ...pStyle, paddingLeft: 20 }}>
          <li><b>OpenFlow Support:</b> Full OpenFlow 1.0–1.5 for SDN flow programming</li>
          <li><b>VLAN / VXLAN / GRE / Geneve:</b> L2/L3 tunneling and VLAN tagging</li>
          <li><b>QoS:</b> Traffic shaping, policing, and queuing</li>
          <li><b>Bonding:</b> Link aggregation for high availability</li>
          <li><b>Flow Caching:</b> Megaflow cache in kernel for high performance</li>
          <li><b>OVSDB:</b> JSON-RPC database for switch configuration (persistent)</li>
          <li><b>sFlow / IPFIX:</b> Network monitoring and flow export</li>
        </ul>

        <h4 style={h4Style}>Architecture</h4>
        <pre style={code}>{`┌───────────────────────────────────────────┐
│              User Space                   │
│  ┌─────────────┐  ┌───────────────────┐  │
│  │ ovs-vswitchd│  │  ovsdb-server     │  │
│  │ (OpenFlow   │  │  (Configuration   │  │
│  │  switch)    │  │   database)       │  │
│  └──────┬──────┘  └───────────────────┘  │
│         │ netlink                         │
├─────────┼────────────────────────────────┤
│  ┌──────┴──────────────────────────────┐ │
│  │     OVS Kernel Module               │ │
│  │  (fast-path flow caching)           │ │
│  └─────────────────────────────────────┘ │
│              Kernel Space                 │
└───────────────────────────────────────────┘`}</pre>

        <div style={tipBox}>
          💡 <b>How it works:</b> The first packet of a new flow goes to user-space (ovs-vswitchd) for OpenFlow
          lookup. The result is cached in the kernel module, so subsequent packets of the same flow are
          switched entirely in the kernel at near-line-rate speed.
        </div>

        <h4 style={h4Style}>OVS vs Linux Bridge</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Feature</th><th style={thStyle}>OVS</th><th style={thStyle}>Linux Bridge</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}>OpenFlow</td><td style={tdStyle}>✅ Full support</td><td style={tdStyle}>❌</td></tr>
            <tr><td style={tdStyle}>Tunneling</td><td style={tdStyle}>✅ VXLAN, GRE, Geneve</td><td style={tdStyle}>✅ (limited)</td></tr>
            <tr><td style={tdStyle}>SDN Control</td><td style={tdStyle}>✅ Remote controller</td><td style={tdStyle}>❌</td></tr>
            <tr><td style={tdStyle}>Performance</td><td style={tdStyle}>✅ Megaflow cache</td><td style={tdStyle}>✅ Simple L2</td></tr>
            <tr><td style={tdStyle}>Monitoring</td><td style={tdStyle}>✅ sFlow, IPFIX</td><td style={tdStyle}>Limited</td></tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'ovs-concepts',
    title: 'Key Concepts',
    content: (
      <>
        <h3 style={h3Style}>OVS Key Concepts</h3>

        <h4 style={h4Style}>1. Bridge</h4>
        <p style={pStyle}>
          An OVS <b>bridge</b> is a virtual switch. It has ports (physical or virtual) and a flow table.
          Think of it as a physical switch — traffic enters on one port and is forwarded based on rules.
        </p>

        <h4 style={h4Style}>2. Port Types</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Type</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}><b>Normal Port</b></td><td style={tdStyle}>Physical NIC or veth pair attached to the bridge</td></tr>
            <tr><td style={tdStyle}><b>Internal Port</b></td><td style={tdStyle}>Virtual interface on the bridge (like an SVI)</td></tr>
            <tr><td style={tdStyle}><b>Patch Port</b></td><td style={tdStyle}>Connects two OVS bridges together (like a crossover cable)</td></tr>
            <tr><td style={tdStyle}><b>Tunnel Port</b></td><td style={tdStyle}>VXLAN, GRE, or Geneve tunnel endpoint</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>3. OpenFlow & Flow Tables</h4>
        <p style={pStyle}>
          OpenFlow is the protocol that allows an external <b>SDN controller</b> to program the flow tables
          in OVS. Each flow entry consists of:
        </p>
        <pre style={code}>{`Match Fields          →  Actions
─────────────────────────────────────────
in_port=1, dl_dst=... →  output:2
in_port=2, nw_dst=... →  set_field, output:1
priority=0            →  drop (default)`}</pre>

        <h4 style={h4Style}>4. OVSDB (Open vSwitch Database)</h4>
        <p style={pStyle}>
          OVSDB stores the persistent configuration of OVS (bridges, ports, tunnels, QoS, etc.).
          It uses a JSON-RPC protocol and the configuration survives restarts.
        </p>

        <h4 style={h4Style}>5. Tunneling</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Protocol</th><th style={thStyle}>Use Case</th><th style={thStyle}>Header Overhead</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}><b>VXLAN</b></td><td style={tdStyle}>Data center overlay networks, up to 16M segments</td><td style={tdStyle}>50 bytes</td></tr>
            <tr><td style={tdStyle}><b>GRE</b></td><td style={tdStyle}>Simple point-to-point tunnels</td><td style={tdStyle}>24 bytes</td></tr>
            <tr><td style={tdStyle}><b>Geneve</b></td><td style={tdStyle}>Next-gen flexible tunnel (extensible TLV)</td><td style={tdStyle}>Variable</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>6. Datapath</h4>
        <p style={pStyle}>
          The <b>datapath</b> is the kernel module that does the actual packet switching. When ovs-vswitchd
          makes a forwarding decision, it installs a <b>megaflow</b> entry in the kernel datapath so
          matching packets are handled entirely in kernel space (fast path).
        </p>
      </>
    ),
  },
  {
    id: 'ovs-commands',
    title: 'Essential Commands',
    content: (
      <>
        <h3 style={h3Style}>OVS Essential Commands</h3>
        <div style={tipBox}>
          💡 All commands are run on the Linux host where OVS is installed. Use the <b>Terminal</b> page with <b>bash</b> shell.
        </div>

        <h4 style={h4Style}>Bridge Management (ovs-vsctl)</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Command</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-vsctl show</td><td style={tdStyle}>Show all bridges, ports, interfaces, and controllers</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-vsctl add-br br0</td><td style={tdStyle}>Create a new bridge named br0</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-vsctl del-br br0</td><td style={tdStyle}>Delete bridge br0 and all its ports</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-vsctl add-port br0 eth1</td><td style={tdStyle}>Add physical interface eth1 to bridge br0</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-vsctl del-port br0 eth1</td><td style={tdStyle}>Remove port eth1 from bridge br0</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-vsctl list-ports br0</td><td style={tdStyle}>List all ports on bridge br0</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-vsctl list-br</td><td style={tdStyle}>List all bridges</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>Tunnel Configuration</h4>
        <pre style={code}>{`# Add VXLAN tunnel
ovs-vsctl add-port br0 vxlan0 -- set interface vxlan0 \\
  type=vxlan options:remote_ip=10.0.0.2 options:key=100

# Add GRE tunnel
ovs-vsctl add-port br0 gre0 -- set interface gre0 \\
  type=gre options:remote_ip=10.0.0.2

# Add Geneve tunnel
ovs-vsctl add-port br0 gnv0 -- set interface gnv0 \\
  type=geneve options:remote_ip=10.0.0.2 options:key=200`}</pre>

        <h4 style={h4Style}>OpenFlow Control (ovs-ofctl)</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Command</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-ofctl dump-flows br0</td><td style={tdStyle}>Show all flow rules on bridge br0</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-ofctl add-flow br0 "priority=100,in_port=1,actions=output:2"</td><td style={tdStyle}>Add a flow rule</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-ofctl del-flows br0</td><td style={tdStyle}>Delete ALL flows</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-ofctl del-flows br0 "in_port=1"</td><td style={tdStyle}>Delete flows matching criteria</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-ofctl dump-ports br0</td><td style={tdStyle}>Port statistics (packets, bytes, errors)</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ovs-ofctl show br0</td><td style={tdStyle}>Bridge info including datapath ID and port list</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>Controller Management</h4>
        <pre style={code}>{`# Connect bridge to SDN controller (Ryu on port 6633)
ovs-vsctl set-controller br0 tcp:127.0.0.1:6633

# Disconnect controller
ovs-vsctl del-controller br0

# Check controller connection
ovs-vsctl get-controller br0

# Set bridge to standalone mode (no controller needed)
ovs-vsctl set-fail-mode br0 standalone

# Set bridge to secure mode (requires controller)
ovs-vsctl set-fail-mode br0 secure`}</pre>

        <h4 style={h4Style}>VLAN Tagging</h4>
        <pre style={code}>{`# Set port as access port (VLAN 100)
ovs-vsctl set port eth1 tag=100

# Set port as trunk
ovs-vsctl set port eth2 trunks=100,200,300

# Remove VLAN tag
ovs-vsctl remove port eth1 tag 100`}</pre>

        <h4 style={h4Style}>Troubleshooting</h4>
        <pre style={code}>{`# Show datapath stats
ovs-dpctl show

# Trace a packet through the pipeline
ovs-appctl ofproto/trace br0 in_port=1,dl_dst=ff:ff:ff:ff:ff:ff

# Show OVS processes
ovs-appctl version
systemctl status openvswitch`}</pre>
      </>
    ),
  },
];

// ═══════════════════════════════════════════════════════════════
//  CONTENT – Ryu SDN Controller
// ═══════════════════════════════════════════════════════════════

const ryuTopics: SubTopic[] = [
  {
    id: 'ryu-what',
    title: 'What is Ryu?',
    content: (
      <>
        <h3 style={h3Style}>What is Ryu SDN Controller?</h3>
        <p style={pStyle}>
          <b>Ryu</b> is an open-source Software Defined Networking (SDN) controller written in Python.
          It provides a well-defined API for developers to create network management and control applications.
        </p>
        <p style={pStyle}>
          Ryu supports various protocols for managing network devices, with <b>OpenFlow</b> being the primary one.
          It can control OpenFlow-capable switches like Open vSwitch to implement custom forwarding logic.
        </p>

        <h4 style={h4Style}>Key Features</h4>
        <ul style={{ ...pStyle, paddingLeft: 20 }}>
          <li><b>OpenFlow 1.0–1.5:</b> Full support for all major OpenFlow versions</li>
          <li><b>REST API:</b> Built-in HTTP REST interface for external tools</li>
          <li><b>Python-based:</b> Easy to extend with custom applications</li>
          <li><b>Component System:</b> Modular architecture — load only what you need</li>
          <li><b>Event-Driven:</b> Handles switch events (connect, disconnect, packet-in, etc.)</li>
          <li><b>Topology Discovery:</b> Built-in LLDP-based topology detection</li>
          <li><b>Well-Documented:</b> Extensive documentation and examples</li>
        </ul>

        <h4 style={h4Style}>Architecture</h4>
        <pre style={code}>{`┌──────────────────────────────────────────┐
│           Ryu Applications               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  L2      │ │ REST API │ │ Topology │ │
│  │  Switch  │ │ (ofctl)  │ │ Discover │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ │
│       └─────────────┼────────────┘       │
│              Ryu Core Framework           │
│         (Event system, OFP library)      │
├──────────────────────────────────────────┤
│            OpenFlow Channel               │
│         (TCP port 6633 / 6653)           │
├──────────────────────────────────────────┤
│  ┌──────────┐   ┌──────────┐             │
│  │   OVS    │   │  OVS     │  Switches   │
│  │  Bridge1 │   │  Bridge2 │             │
│  └──────────┘   └──────────┘             │
└──────────────────────────────────────────┘`}</pre>

        <div style={tipBox}>
          💡 <b>How it works:</b> Ryu sits between your application logic and the network switches. When a switch
          doesn't know how to handle a packet, it sends a <b>Packet-In</b> message to Ryu. Your application
          decides what to do and sends <b>Flow-Mod</b> messages back to install forwarding rules.
        </div>

        <h4 style={h4Style}>SDN Architecture Layers</h4>
        <pre style={code}>{`┌──────────────────────────┐
│     Application Layer    │  ← Your apps (L2 switch, firewall, LB)
│     (Ryu Applications)   │
├──────────────────────────┤
│     Control Layer         │  ← Ryu Controller (decision making)
│     (Ryu Framework)       │
├──────────────────────────┤  ← OpenFlow protocol (southbound API)
│     Data Layer            │
│     (OVS, physical HW)   │  ← Packet forwarding
└──────────────────────────┘`}</pre>
      </>
    ),
  },
  {
    id: 'ryu-concepts',
    title: 'Key Concepts',
    content: (
      <>
        <h3 style={h3Style}>Ryu Key Concepts</h3>

        <h4 style={h4Style}>1. OpenFlow Protocol</h4>
        <p style={pStyle}>
          OpenFlow is the standard protocol between the SDN controller and network switches.
          It defines how the controller can inspect, modify, and install forwarding rules in the switch's flow table.
        </p>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Message</th><th style={thStyle}>Direction</th><th style={thStyle}>Purpose</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}><b>Packet-In</b></td><td style={tdStyle}>Switch → Controller</td><td style={tdStyle}>Switch doesn't know what to do with a packet</td></tr>
            <tr><td style={tdStyle}><b>Flow-Mod</b></td><td style={tdStyle}>Controller → Switch</td><td style={tdStyle}>Install/modify/delete a flow rule</td></tr>
            <tr><td style={tdStyle}><b>Packet-Out</b></td><td style={tdStyle}>Controller → Switch</td><td style={tdStyle}>Send a packet out of a specific port</td></tr>
            <tr><td style={tdStyle}><b>Stats-Request/Reply</b></td><td style={tdStyle}>Both ways</td><td style={tdStyle}>Query flow/port/table statistics</td></tr>
            <tr><td style={tdStyle}><b>Hello</b></td><td style={tdStyle}>Both ways</td><td style={tdStyle}>Version negotiation during connection setup</td></tr>
            <tr><td style={tdStyle}><b>Echo</b></td><td style={tdStyle}>Both ways</td><td style={tdStyle}>Keep-alive / liveness check</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>2. Flow Table & Rules</h4>
        <p style={pStyle}>
          Each switch has one or more <b>flow tables</b>. Each table contains <b>flow entries</b> with:
        </p>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Field</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}><b>Priority</b></td><td style={tdStyle}>Higher priority rules match first (0–65535)</td></tr>
            <tr><td style={tdStyle}><b>Match</b></td><td style={tdStyle}>Criteria to match packets (in_port, MAC, IP, TCP port, VLAN, etc.)</td></tr>
            <tr><td style={tdStyle}><b>Actions</b></td><td style={tdStyle}>What to do: OUTPUT, DROP, SET_FIELD, GROUP, etc.</td></tr>
            <tr><td style={tdStyle}><b>Counters</b></td><td style={tdStyle}>Packet and byte count for matched traffic</td></tr>
            <tr><td style={tdStyle}><b>Timeouts</b></td><td style={tdStyle}>idle_timeout and hard_timeout — auto-expire rules</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>3. Match Fields (What you can match on)</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Field</th><th style={thStyle}>Layer</th><th style={thStyle}>Example</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}>in_port</td><td style={tdStyle}>Physical</td><td style={tdStyle}>in_port=1</td></tr>
            <tr><td style={tdStyle}>dl_src / dl_dst</td><td style={tdStyle}>L2 (MAC)</td><td style={tdStyle}>dl_dst=aa:bb:cc:dd:ee:ff</td></tr>
            <tr><td style={tdStyle}>dl_type</td><td style={tdStyle}>L2</td><td style={tdStyle}>0x0800 (IPv4), 0x0806 (ARP)</td></tr>
            <tr><td style={tdStyle}>dl_vlan</td><td style={tdStyle}>L2</td><td style={tdStyle}>VLAN tag 100</td></tr>
            <tr><td style={tdStyle}>nw_src / nw_dst</td><td style={tdStyle}>L3 (IP)</td><td style={tdStyle}>nw_dst=10.0.0.0/24</td></tr>
            <tr><td style={tdStyle}>nw_proto</td><td style={tdStyle}>L3</td><td style={tdStyle}>6 (TCP), 17 (UDP), 1 (ICMP)</td></tr>
            <tr><td style={tdStyle}>tp_src / tp_dst</td><td style={tdStyle}>L4 (Port)</td><td style={tdStyle}>tp_dst=80 (HTTP)</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>4. Actions</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Action</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}><b>OUTPUT:port</b></td><td style={tdStyle}>Forward packet to specified port</td></tr>
            <tr><td style={tdStyle}><b>DROP</b></td><td style={tdStyle}>Discard the packet (no actions = drop)</td></tr>
            <tr><td style={tdStyle}><b>FLOOD</b></td><td style={tdStyle}>Send to all ports except ingress</td></tr>
            <tr><td style={tdStyle}><b>NORMAL</b></td><td style={tdStyle}>Process with normal L2/L3 switching</td></tr>
            <tr><td style={tdStyle}><b>CONTROLLER</b></td><td style={tdStyle}>Send to controller (Packet-In)</td></tr>
            <tr><td style={tdStyle}><b>SET_FIELD</b></td><td style={tdStyle}>Modify packet header (rewrite MAC, IP, VLAN, etc.)</td></tr>
            <tr><td style={tdStyle}><b>GROUP</b></td><td style={tdStyle}>Group table actions (multicast, ECMP load balancing)</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>5. Ryu Application Model</h4>
        <p style={pStyle}>
          Ryu apps are Python classes that extend <code>RyuApp</code>. They use <b>decorators</b> to register
          event handlers:
        </p>
        <pre style={code}>{`from ryu.base import app_manager
from ryu.controller import ofp_event
from ryu.controller.handler import MAIN_DISPATCHER, set_ev_cls

class SimpleSwitch(app_manager.RyuApp):

    @set_ev_cls(ofp_event.EventOFPPacketIn, MAIN_DISPATCHER)
    def packet_in_handler(self, ev):
        msg = ev.msg              # OpenFlow message
        dp = msg.datapath         # Switch (datapath) object
        ofp = dp.ofproto          # OpenFlow protocol constants
        parser = dp.ofproto_parser

        # Flood the packet to all ports
        actions = [parser.OFPActionOutput(ofp.OFPP_FLOOD)]
        out = parser.OFPPacketOut(
            datapath=dp, buffer_id=msg.buffer_id,
            in_port=msg.match['in_port'], actions=actions
        )
        dp.send_msg(out)`}</pre>
      </>
    ),
  },
  {
    id: 'ryu-api',
    title: 'REST API & Commands',
    content: (
      <>
        <h3 style={h3Style}>Ryu REST API & Commands</h3>

        <h4 style={h4Style}>Starting Ryu</h4>
        <pre style={code}>{`# Start with built-in REST API + simple switch
ryu-manager ryu.app.simple_switch_13 ryu.app.ofctl_rest

# Start with REST API only
ryu-manager ryu.app.ofctl_rest --ofp-tcp-listen-port 6633

# Start with topology discovery
ryu-manager ryu.app.ofctl_rest ryu.app.rest_topology`}</pre>

        <h4 style={h4Style}>REST API Endpoints (ofctl_rest)</h4>
        <p style={pStyle}>
          When running with <code>ryu.app.ofctl_rest</code>, Ryu exposes a REST API on port <b>8080</b>.
        </p>

        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Method</th><th style={thStyle}>Endpoint</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}>GET</td><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/stats/switches</td><td style={tdStyle}>List connected switch DPIDs</td></tr>
            <tr><td style={tdStyle}>GET</td><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/stats/desc/&#123;dpid&#125;</td><td style={tdStyle}>Switch description (manufacturer, HW, SW)</td></tr>
            <tr><td style={tdStyle}>GET</td><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/stats/flow/&#123;dpid&#125;</td><td style={tdStyle}>Get all flow entries for a switch</td></tr>
            <tr><td style={tdStyle}>GET</td><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/stats/port/&#123;dpid&#125;</td><td style={tdStyle}>Port statistics (RX/TX packets, bytes, errors)</td></tr>
            <tr><td style={tdStyle}>GET</td><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/stats/table/&#123;dpid&#125;</td><td style={tdStyle}>Table statistics</td></tr>
            <tr><td style={tdStyle}>POST</td><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/stats/flowentry/add</td><td style={tdStyle}>Add a flow entry to a switch</td></tr>
            <tr><td style={tdStyle}>POST</td><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/stats/flowentry/delete</td><td style={tdStyle}>Delete flow entries</td></tr>
            <tr><td style={tdStyle}>POST</td><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>/stats/flowentry/modify</td><td style={tdStyle}>Modify existing flow entries</td></tr>
          </tbody>
        </table>

        <h4 style={h4Style}>API Examples (curl)</h4>
        <pre style={code}>{`# List all connected switches
curl http://localhost:8080/stats/switches

# Get flows from switch 1
curl http://localhost:8080/stats/flow/1

# Add a flow rule (forward port 1 → port 2)
curl -X POST http://localhost:8080/stats/flowentry/add \\
  -H "Content-Type: application/json" \\
  -d '{
    "dpid": 1,
    "priority": 100,
    "match": {"in_port": 1},
    "actions": [{"type": "OUTPUT", "port": 2}]
  }'

# Delete all flows from switch 1
curl -X POST http://localhost:8080/stats/flowentry/delete \\
  -H "Content-Type: application/json" \\
  -d '{"dpid": 1}'

# Get port statistics
curl http://localhost:8080/stats/port/1`}</pre>

        <h4 style={h4Style}>Topology API (rest_topology)</h4>
        <pre style={code}>{`# List switches (with rest_topology app loaded)
curl http://localhost:8080/v1.0/topology/switches

# List links
curl http://localhost:8080/v1.0/topology/links

# Get hosts
curl http://localhost:8080/v1.0/topology/hosts`}</pre>

        <h4 style={h4Style}>Common Ryu Apps</h4>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>App</th><th style={thStyle}>Description</th></tr></thead>
          <tbody>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>simple_switch_13</td><td style={tdStyle}>Basic L2 learning switch (OpenFlow 1.3)</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>ofctl_rest</td><td style={tdStyle}>REST API for OpenFlow operations</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>rest_topology</td><td style={tdStyle}>REST API for topology discovery</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>rest_firewall</td><td style={tdStyle}>REST-based firewall application</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>rest_qos</td><td style={tdStyle}>QoS management via REST</td></tr>
            <tr><td style={{...tdStyle, fontFamily: 'monospace', fontSize: 12}}>gui_topology</td><td style={tdStyle}>Web-based topology viewer</td></tr>
          </tbody>
        </table>
      </>
    ),
  },
];

// ═══════════════════════════════════════════════════════════════
//  TOPIC REGISTRY
// ═══════════════════════════════════════════════════════════════

const topics: Topic[] = [
  { id: 'frr', label: 'FRRouting', icon: '🛣️', color: '#22c55e', subtopics: frrTopics },
  { id: 'ovs', label: 'Open vSwitch', icon: '🌐', color: '#3b82f6', subtopics: ovsTopics },
  { id: 'ryu', label: 'Ryu Controller', icon: '📡', color: '#a855f7', subtopics: ryuTopics },
];

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function LearnPage() {
  const [activeTopic, setActiveTopic] = useState<string>('frr');
  const [activeSubtopic, setActiveSubtopic] = useState<string>('frr-what');

  const currentTopic = topics.find((t) => t.id === activeTopic)!;
  const currentSubtopic = currentTopic.subtopics.find((s) => s.id === activeSubtopic);

  const handleTopicChange = (topicId: string) => {
    setActiveTopic(topicId);
    const topic = topics.find((t) => t.id === topicId)!;
    setActiveSubtopic(topic.subtopics[0].id);
  };

  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 120px)' }}>
      {/* Left navigation */}
      <nav
        style={{
          width: 240,
          minWidth: 240,
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px 0 0 12px',
          overflowY: 'auto',
          padding: '16px 0',
        }}
      >
        <div style={{ padding: '0 16px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: 1 }}>
          📚 Learning Hub
        </div>

        {topics.map((topic) => (
          <div key={topic.id} style={{ marginBottom: 4 }}>
            {/* Topic header */}
            <button
              onClick={() => handleTopicChange(topic.id)}
              style={{
                width: '100%',
                padding: '10px 16px',
                border: 'none',
                background: activeTopic === topic.id ? `${topic.color}15` : 'transparent',
                color: activeTopic === topic.id ? topic.color : 'var(--color-text)',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderLeft: activeTopic === topic.id ? `3px solid ${topic.color}` : '3px solid transparent',
              }}
            >
              <span>{topic.icon}</span> {topic.label}
            </button>

            {/* Subtopics */}
            {activeTopic === topic.id && (
              <div style={{ paddingLeft: 12 }}>
                {topic.subtopics.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => setActiveSubtopic(sub.id)}
                    style={{
                      width: '100%',
                      padding: '7px 16px 7px 24px',
                      border: 'none',
                      background: activeSubtopic === sub.id ? 'rgba(59,130,246,0.08)' : 'transparent',
                      color: activeSubtopic === sub.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      fontWeight: activeSubtopic === sub.id ? 600 : 400,
                      fontSize: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderLeft: activeSubtopic === sub.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                    }}
                  >
                    {sub.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Content area */}
      <main
        style={{
          flex: 1,
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderLeft: 'none',
          borderRadius: '0 12px 12px 0',
          overflowY: 'auto',
          padding: '24px 32px',
        }}
      >
        {/* Breadcrumb */}
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
          Learn → {currentTopic.icon} {currentTopic.label} → {currentSubtopic?.title}
        </div>

        {/* Content */}
        {currentSubtopic?.content}
      </main>
    </div>
  );
}
