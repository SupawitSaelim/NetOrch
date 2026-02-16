/* ═══════════════════════════════════════════════════════════════
   Lab Exercises — Step-by-step worksheets for learning networking
   ═══════════════════════════════════════════════════════════════ */

export interface LabStep {
  title: string;
  description: string;          // what & why
  instructions: string[];       // numbered steps to do
  commands?: string[];           // CLI commands to run (copyable)
  tip?: string;                 // helpful hint
  verify?: string;              // how to check if step is done
  where: 'builder' | 'cli' | 'flows' | 'browser' | 'info';
}

export interface Lab {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: string;             // e.g. "15 min"
  icon: string;
  tags: string[];
  objectives: string[];
  prerequisites: string[];
  topology?: string;            // ASCII art of target topology
  steps: LabStep[];
}

export const labs: Lab[] = [
  // ─── LAB 1: First Switch & Host ───────────────────────────────
  {
    id: 'lab-01-first-switch',
    title: 'Lab 1: Your First Switch & Host',
    description: 'Learn the basics — create an OVS switch, connect a host, assign an IP, and test connectivity.',
    difficulty: 'beginner',
    duration: '10 min',
    icon: '🟢',
    tags: ['OVS', 'Bridge', 'Host', 'Ping'],
    objectives: [
      'Create an OVS bridge (virtual switch)',
      'Create a virtual host (network namespace)',
      'Connect host to switch via link',
      'Verify connectivity',
    ],
    prerequisites: ['VM is running and accessible'],
    topology: `
    ┌──────┐     ┌──────┐
    │ sw1  ├─────┤ h1   │
    │(OVS) │     │.10/24│
    └──────┘     └──────┘`,
    steps: [
      {
        title: 'Understand the Plan',
        description: 'We\'re going to create a simple network: 1 switch connected to 1 host. This is the most basic building block of any network. An OVS switch (bridge) works like a physical switch — it forwards frames between ports.',
        instructions: [
          'Go to the Topology → Canvas page',
          'Look at the toolbar on the left side',
          'Notice the three modes: Select (🖱️), Add Switch (⬡), Add Host (◉)',
        ],
        where: 'info',
        tip: 'Every network starts with a switch. Hosts connect to switches, and switches connect to each other or to routers.',
      },
      {
        title: 'Create a Switch',
        description: 'An OVS bridge is a software switch running inside your VM. It behaves like a real L2 switch — learning MAC addresses and forwarding frames.',
        instructions: [
          'Click the "Add Switch (⬡)" button in the toolbar',
          'Click anywhere on the canvas to place it',
          'In the dialog, enter name: sw1',
          'Leave Protocol as OpenFlow 1.3',
          'Leave "Connect to SDN Controller" unchecked for now',
          'Click "Create Switch"',
        ],
        where: 'builder',
        tip: 'The switch is created in "standalone" mode — OVS handles MAC learning internally, no controller needed.',
        verify: 'You should see a blue hexagon (⬡) labeled "sw1" appear on the canvas.',
      },
      {
        title: 'Create a Host',
        description: 'A virtual host is a Linux network namespace — it\'s like a separate computer with its own network stack, IP addresses, and routing table.',
        instructions: [
          'Click the "Add Host (◉)" button in the toolbar',
          'Click on the canvas near sw1',
          'Enter name: h1',
          'Enter IP: 10.0.0.10/24',
          'Leave Gateway empty for now',
          'Click "Create Host"',
        ],
        where: 'builder',
        tip: 'The /24 subnet mask means this host can talk to anything in the 10.0.0.0 – 10.0.0.255 range.',
        verify: 'You should see a purple circle (◉) labeled "h1" near sw1.',
      },
      {
        title: 'Connect Host to Switch',
        description: 'Now we need to create a virtual cable (veth pair) between h1 and sw1. This is like plugging an Ethernet cable from a PC to a switch port.',
        instructions: [
          'Click the "Link (🔗)" button in the toolbar',
          'Click on h1, then click on sw1',
          'The link is created automatically',
        ],
        where: 'builder',
        tip: 'Behind the scenes, this creates a veth pair — one end in h1\'s namespace, the other as a port on sw1.',
        verify: 'You should see a line connecting h1 and sw1.',
      },
      {
        title: 'Verify — Check from CLI',
        description: 'Let\'s verify everything was created correctly using CLI commands on the VM.',
        instructions: [
          'Go to the Terminal page',
          'Select BASH mode',
          'Run the commands below to check the switch, host, and link',
        ],
        commands: [
          '# Check the switch exists',
          'ovs-vsctl show',
          '',
          '# Check the host namespace exists',
          'ip netns list',
          '',
          '# Check h1\'s IP address',
          'ip netns exec h1 ip addr show',
        ],
        where: 'cli',
        verify: 'You should see sw1 in ovs-vsctl output, h1 in netns list, and 10.0.0.10/24 on h1\'s interface.',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'Congratulations! You\'ve built your first virtual network. You created a switch (OVS bridge) and connected a host (netns) to it. This is the foundation of everything we\'ll build next.',
        instructions: [
          'Review what you built: 1 switch + 1 host + 1 link',
          'The switch is in standalone mode (self-learning)',
          'The host has IP 10.0.0.10/24',
          'Next lab: we\'ll add more hosts and ping between them!',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 2: Two Hosts — Same Subnet Ping ─────────────────────
  {
    id: 'lab-02-same-subnet-ping',
    title: 'Lab 2: Two Hosts, One Switch — Ping!',
    description: 'Connect two hosts to the same switch and verify they can communicate. Understand L2 forwarding.',
    difficulty: 'beginner',
    duration: '10 min',
    icon: '🏓',
    tags: ['Ping', 'L2', 'MAC Learning', 'Same Subnet'],
    objectives: [
      'Create 2 hosts on the same subnet',
      'Connect both to 1 switch',
      'Ping between hosts',
      'Understand ARP and MAC learning',
    ],
    prerequisites: ['Completed Lab 1 (or know how to create switch/host)'],
    topology: `
    ┌──────┐     ┌──────┐     ┌──────┐
    │  h1  ├─────┤ sw1  ├─────┤  h2  │
    │.10/24│     │(OVS) │     │.20/24│
    └──────┘     └──────┘     └──────┘
               10.0.0.0/24`,
    steps: [
      {
        title: 'Plan the Network',
        description: 'We\'ll build a network with 1 switch and 2 hosts on the same subnet (10.0.0.0/24). Since they\'re on the same subnet, the switch can forward frames directly — no router needed.',
        instructions: [
          'Our target: sw1 with h1 (10.0.0.10/24) and h2 (10.0.0.20/24)',
          'Same subnet → L2 forwarding → switch does MAC learning',
          'Go to Topology → Canvas page',
        ],
        where: 'info',
        tip: 'When 2 devices are on the same /24, they can communicate directly through a switch. The switch learns which MAC is on which port.',
      },
      {
        title: 'Create the Switch',
        description: 'Create the central switch that both hosts will connect to.',
        instructions: [
          'Use Add Switch mode → click canvas',
          'Name: sw1',
          'Protocol: OpenFlow 1.3',
          'No controller needed',
          'Click Create',
        ],
        where: 'builder',
        verify: 'Blue hexagon "sw1" appears.',
      },
      {
        title: 'Create Host 1',
        description: 'Create the first host with IP 10.0.0.10.',
        instructions: [
          'Use Add Host mode → click canvas left of sw1',
          'Name: h1',
          'IP: 10.0.0.10/24',
          'Click Create',
          'Create link: click h1 → click sw1',
        ],
        where: 'builder',
        verify: 'h1 connected to sw1 with a line.',
      },
      {
        title: 'Create Host 2',
        description: 'Create the second host with IP 10.0.0.20.',
        instructions: [
          'Use Add Host mode → click canvas right of sw1',
          'Name: h2',
          'IP: 10.0.0.20/24',
          'Click Create',
          'Create link: click h2 → click sw1',
        ],
        where: 'builder',
        verify: 'h2 connected to sw1 with a line.',
      },
      {
        title: 'Ping h1 → h2',
        description: 'Now the exciting part! Let\'s test if our hosts can talk to each other. When h1 pings h2, this happens:\n1. h1 sends ARP "who has 10.0.0.20?"\n2. sw1 floods the ARP to all ports (doesn\'t know h2\'s MAC yet)\n3. h2 replies "that\'s me! here\'s my MAC"\n4. sw1 learns both MACs → forwards directly from now on',
        instructions: [
          'Go to the Terminal page',
          'Select BASH mode',
          'Run the ping command below',
        ],
        commands: [
          '# Ping from h1 to h2',
          'ip netns exec h1 ping -c 4 10.0.0.20',
        ],
        where: 'cli',
        verify: 'You should see 4 replies: "64 bytes from 10.0.0.20: icmp_seq=1 ..."',
        tip: 'The first ping might be slightly slower due to ARP. After that, the switch knows the MAC → port mapping.',
      },
      {
        title: 'Verify MAC Learning',
        description: 'Let\'s check what the switch learned about our hosts.',
        instructions: [
          'Run the command below to see the switch\'s forwarding database',
          'You\'ll see MAC addresses and which port they were learned on',
        ],
        commands: [
          '# Show MAC address table (FDB)',
          'ovs-appctl fdb/show sw1',
          '',
          '# Show all ports on sw1',
          'ovs-vsctl list-ports sw1',
        ],
        where: 'cli',
        verify: 'You should see 2 MAC addresses, each learned on a different port number.',
        tip: 'This is exactly how a physical switch works — it maintains a MAC address table mapping MACs to ports.',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'You\'ve built a working L2 network! Two hosts on the same subnet can ping through a switch. The switch automatically learns MAC addresses and forwards frames efficiently. This is the foundation of all Ethernet networking.',
        instructions: [
          'Key concepts learned:',
          '• L2 forwarding based on MAC addresses',
          '• ARP resolves IP → MAC',
          '• Switch learns MAC → port mapping',
          '• Same subnet = direct communication through switch',
          'Next: We\'ll explore what happens with different subnets!',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 3: SDN Controller & Flow Rules ───────────────────────
  {
    id: 'lab-03-sdn-controller',
    title: 'Lab 3: SDN Controller & OpenFlow',
    description: 'Connect a switch to the SDN controller. Observe how flows are installed automatically vs manually.',
    difficulty: 'intermediate',
    duration: '15 min',
    icon: '🧠',
    tags: ['SDN', 'OpenFlow', 'Controller', 'Flow Rules'],
    objectives: [
      'Understand standalone vs secure fail-mode',
      'Connect a switch to the SDN controller',
      'Observe automatic flow installation',
      'Manually add a flow rule',
    ],
    prerequisites: ['Completed Lab 2', 'netorch_controller.py running on VM'],
    topology: `
                  ┌──────────────┐
                  │  SDN Controller│
                  │  (port 6653) │
                  └──────┬───────┘
                         │ OpenFlow
    ┌──────┐     ┌──────┴──────┐     ┌──────┐
    │  h1  ├─────┤    sw1      ├─────┤  h2  │
    │.10/24│     │  (secure)   │     │.20/24│
    └──────┘     └─────────────┘     └──────┘`,
    steps: [
      {
        title: 'Standalone vs SDN — What\'s the Difference?',
        description: 'In Lab 2, sw1 ran in "standalone" mode — it forwarded frames on its own using built-in MAC learning. Now we\'ll switch to SDN mode where a centralized controller decides how every packet is handled.\n\n**Standalone mode:** Switch makes its own forwarding decisions\n**Secure mode:** Switch asks the controller for every unknown packet. No controller = no forwarding.',
        instructions: [
          'Understand the two modes:',
          '• Standalone: switch works independently (like a dumb switch)',
          '• Secure: switch depends on controller (SDN)',
          'We\'ll create a new switch in secure mode with controller',
        ],
        where: 'info',
        tip: 'SDN = Software Defined Networking. The "brain" (controller) is separated from the "body" (switch).',
      },
      {
        title: 'Start the SDN Controller',
        description: 'First, we need to make sure the SDN controller (netorch_controller.py) is running on the VM. This controller implements L2 MAC learning using OpenFlow.',
        instructions: [
          'Go to the Terminal page → BASH mode',
          'Check if the controller is already running',
          'If not, start it in the background',
        ],
        commands: [
          '# Check if controller is running',
          'pgrep -f netorch_controller && echo "Running" || echo "Not running"',
          '',
          '# If not running, start it:',
          'cd /opt/netorch && nohup python3 netorch_controller.py > /tmp/controller.log 2>&1 &',
          '',
          '# Verify it\'s listening on port 6653',
          'ss -tlnp | grep 6653',
        ],
        where: 'cli',
        verify: 'You should see port 6653 listening.',
        tip: 'Port 6653 is the standard OpenFlow port. The controller listens here for switch connections.',
      },
      {
        title: 'Create a Switch with SDN Controller',
        description: 'Now create a switch that connects to the controller. This switch will be in "secure" mode — it won\'t forward anything until the controller tells it to.',
        instructions: [
          'Go to Topology → Canvas',
          'Add Switch mode → click canvas',
          'Name: sw-sdn',
          'Protocol: OpenFlow 1.3',
          '✅ Check "Connect to SDN Controller"',
          'Controller address should auto-fill: 127.0.0.1:6653',
          'Click Create',
        ],
        where: 'builder',
        verify: 'The switch appears. Notice the hint says "fail-mode: secure".',
        tip: 'With the checkbox enabled, the switch automatically connects to the controller and sets fail-mode to secure.',
      },
      {
        title: 'Add Two Hosts',
        description: 'Create two hosts and connect them to the SDN-controlled switch.',
        instructions: [
          'Create h1: IP 10.0.0.10/24 → link to sw-sdn',
          'Create h2: IP 10.0.0.20/24 → link to sw-sdn',
          '(Same as Lab 2, just different switch name)',
        ],
        where: 'builder',
        verify: 'Both hosts connected to sw-sdn.',
      },
      {
        title: 'Check Flow Rules — Before Ping',
        description: 'Let\'s look at what flow rules the controller installed when the switch connected.',
        instructions: [
          'Go to Terminal → BASH mode',
          'Run the command below to see current flows',
        ],
        commands: [
          '# Dump flow rules on sw-sdn',
          'ovs-ofctl dump-flows sw-sdn -O OpenFlow13',
        ],
        where: 'cli',
        verify: 'You should see a table-miss rule (priority=0, actions=CONTROLLER:65535). This sends unknown packets to the controller.',
        tip: 'The table-miss rule is the "catch-all" — any packet that doesn\'t match a specific rule gets sent to the controller for decision.',
      },
      {
        title: 'Ping and Watch Flows Appear',
        description: 'When h1 pings h2, the controller will:\n1. Receive the unknown packet via OpenFlow\n2. Learn h1\'s MAC and port\n3. Flood the ARP (destination unknown)\n4. Learn h2\'s MAC when it replies\n5. Install specific flow rules so future packets go directly',
        instructions: [
          'Ping from h1 to h2',
          'Then immediately check the flow table again',
        ],
        commands: [
          '# Ping',
          'ip netns exec h1 ping -c 2 10.0.0.20',
          '',
          '# Now check flows again — new rules should appear!',
          'ovs-ofctl dump-flows sw-sdn -O OpenFlow13',
        ],
        where: 'cli',
        verify: 'You should now see additional flow rules with specific MAC addresses. The controller installed them!',
        tip: 'Compare before and after — the new flows have priority=1 and match specific eth_src/eth_dst pairs. This is "reactive" flow installation.',
      },
      {
        title: 'View Flows in the UI',
        description: 'You can also see the flows in the SDN Flows page.',
        instructions: [
          'Go to the SDN Flows page from the sidebar',
          'Look for flows on sw-sdn',
          'You should see the table-miss rule + the learned rules',
        ],
        where: 'flows',
        verify: 'Flow list shows rules for sw-sdn.',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'You\'ve experienced the core of SDN! Instead of the switch making its own decisions, a centralized controller programmatically installs flow rules. This is powerful because:\n\n• **Centralized control** — one brain manages all switches\n• **Programmable** — you can write custom forwarding logic\n• **Visibility** — the controller sees every unknown packet\n• **Reactive + Proactive** — install rules on-demand or pre-configure',
        instructions: [
          'Key concepts learned:',
          '• Standalone mode: switch self-manages',
          '• Secure mode: switch depends on controller',
          '• Table-miss rule: "ask controller" for unknown traffic',
          '• Reactive flow installation: learn & install on first packet',
          '• OpenFlow: protocol between switch and controller',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 4: VLAN Segmentation ─────────────────────────────────
  {
    id: 'lab-04-vlan-segmentation',
    title: 'Lab 4: VLAN Segmentation',
    description: 'Separate traffic using VLANs on a single switch. Learn how tagged ports isolate broadcast domains.',
    difficulty: 'intermediate',
    duration: '20 min',
    icon: '🏷️',
    tags: ['VLAN', 'Tagging', 'Segmentation', 'OVS'],
    objectives: [
      'Create tagged (trunk) and untagged (access) ports',
      'Isolate hosts into different VLANs',
      'Verify isolation — same VLAN can ping, different cannot',
    ],
    prerequisites: ['Completed Lab 2'],
    topology: `
    VLAN 10                           VLAN 20
    ┌──────┐     ┌──────────┐     ┌──────┐
    │  h1  ├─────┤   sw1    ├─────┤  h3  │
    │.10/24│     │          │     │.30/24│
    └──────┘     │  (OVS)   │     └──────┘
    ┌──────┐     │          │     ┌──────┐
    │  h2  ├─────┤          ├─────┤  h4  │
    │.20/24│     └──────────┘     │.40/24│
    └──────┘                      └──────┘`,
    steps: [
      {
        title: 'What is a VLAN?',
        description: 'A VLAN (Virtual LAN) divides one physical switch into multiple logical switches. Hosts in VLAN 10 cannot talk to hosts in VLAN 20, even though they\'re on the same physical switch. This is essential for security and network organization.\n\n**Access port:** belongs to one VLAN (untagged)\n**Trunk port:** carries multiple VLANs (tagged)',
        instructions: [
          'We\'ll create 1 switch with 4 hosts',
          'h1, h2 → VLAN 10 (10.0.0.0/24)',
          'h3, h4 → VLAN 20 (10.0.0.0/24)',
          'Same subnet but different VLANs → cannot ping across',
        ],
        where: 'info',
        tip: 'Think of VLANs as invisible walls inside a switch. Frame from VLAN 10 will never be forwarded to a VLAN 20 port.',
      },
      {
        title: 'Create Switch and Hosts',
        description: 'First, set up the basic topology — 1 switch + 4 hosts, all connected.',
        instructions: [
          'Create sw1 (standalone mode)',
          'Create h1 (IP: 10.0.0.10/24) → link to sw1',
          'Create h2 (IP: 10.0.0.20/24) → link to sw1',
          'Create h3 (IP: 10.0.0.30/24) → link to sw1',
          'Create h4 (IP: 10.0.0.40/24) → link to sw1',
        ],
        where: 'builder',
        verify: 'All 4 hosts connected to sw1 on the canvas.',
      },
      {
        title: 'Verify — Everyone Can Ping (No VLANs Yet)',
        description: 'Before adding VLANs, let\'s confirm all hosts can talk to each other. Right now there\'s no segmentation.',
        instructions: [
          'Go to Terminal → BASH',
          'Ping from h1 to h3 (should work)',
        ],
        commands: [
          '# Without VLANs, everyone can ping everyone',
          'ip netns exec h1 ping -c 2 10.0.0.30',
        ],
        where: 'cli',
        verify: 'Ping succeeds — 0% packet loss.',
        tip: 'This is the "before" state. After VLANs, this ping will fail!',
      },
      {
        title: 'Assign VLAN Tags to Ports',
        description: 'Now we\'ll configure OVS to put each host\'s port into a VLAN. We need to find the port names first, then set the VLAN tag.',
        instructions: [
          'First, list all ports on sw1',
          'Then set VLAN tags: h1,h2 ports → VLAN 10, h3,h4 ports → VLAN 20',
        ],
        commands: [
          '# List ports to find the port names',
          'ovs-vsctl list-ports sw1',
          '',
          '# Set VLAN 10 for h1 and h2 ports',
          '# (port names are usually like sw1-h1 or h1-veth)',
          '# Find them from the list-ports output, then:',
          'ovs-vsctl set port sw1-h1 tag=10',
          'ovs-vsctl set port sw1-h2 tag=10',
          '',
          '# Set VLAN 20 for h3 and h4 ports',
          'ovs-vsctl set port sw1-h3 tag=20',
          'ovs-vsctl set port sw1-h4 tag=20',
        ],
        where: 'cli',
        verify: 'Commands complete without error. Check with: ovs-vsctl show',
        tip: 'Port names depend on how the builder creates links. Use "ovs-vsctl list-ports sw1" to find exact names. The tag= value is the VLAN ID.',
      },
      {
        title: 'Test VLAN Isolation',
        description: 'Now the magic! Hosts in the same VLAN should ping, but hosts in different VLANs should NOT.',
        instructions: [
          'Test same VLAN: h1 ping h2 (both VLAN 10) → should work',
          'Test cross VLAN: h1 ping h3 (VLAN 10 → 20) → should FAIL',
        ],
        commands: [
          '# Same VLAN (10) — should succeed',
          'ip netns exec h1 ping -c 2 10.0.0.20',
          '',
          '# Different VLAN (10→20) — should FAIL',
          'ip netns exec h1 ping -c 2 -W 2 10.0.0.30',
        ],
        where: 'cli',
        verify: 'h1→h2: success ✅, h1→h3: 100% packet loss ❌ (this is correct!)',
        tip: 'The failure is expected! VLAN isolation is working. h1 and h3 are on the same subnet but different VLANs — the switch drops frames between them.',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'You\'ve implemented VLAN segmentation! Even though all hosts share the same physical switch and same subnet, VLANs create invisible boundaries. This is how enterprise networks separate departments, guest WiFi from corporate, etc.',
        instructions: [
          'Key concepts learned:',
          '• VLAN = virtual LAN (logical switch within a switch)',
          '• Access port: carries one VLAN (untagged)',
          '• tag=N assigns a port to VLAN N',
          '• Same VLAN → can communicate',
          '• Different VLAN → isolated (need a router to cross)',
          'Next: Adding a router to route between VLANs!',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 5: Inter-Switch Link (Patch Ports) ───────────────────
  {
    id: 'lab-05-multi-switch',
    title: 'Lab 5: Multi-Switch Network',
    description: 'Connect two switches using OVS patch ports. Understand how switches extend the network.',
    difficulty: 'intermediate',
    duration: '15 min',
    icon: '🔗',
    tags: ['Patch Ports', 'Multi-Switch', 'Trunk', 'OVS'],
    objectives: [
      'Create two switches and connect them',
      'Understand patch ports (inter-bridge link)',
      'Ping hosts across different switches',
    ],
    prerequisites: ['Completed Lab 2'],
    topology: `
    ┌──────┐     ┌──────┐─────┌──────┐     ┌──────┐
    │  h1  ├─────┤ sw1  │patch│ sw2  ├─────┤  h2  │
    │.10/24│     │      │port │      │     │.20/24│
    └──────┘     └──────┘     └──────┘     └──────┘`,
    steps: [
      {
        title: 'Why Multiple Switches?',
        description: 'In real networks, you can\'t connect everything to one switch. Multiple switches extend the network across buildings, floors, or racks. OVS uses "patch ports" to connect bridges — think of it as an internal cable between two switches.',
        instructions: [
          'We\'ll create sw1 + sw2, each with a host',
          'Then connect sw1↔sw2 via patch ports',
          'Hosts on different switches should still ping',
        ],
        where: 'info',
      },
      {
        title: 'Create Two Switches',
        description: 'Create both switches on the canvas.',
        instructions: [
          'Create sw1 on the left side of canvas',
          'Create sw2 on the right side of canvas',
          'Both in standalone mode',
        ],
        where: 'builder',
        verify: 'Two blue hexagons on the canvas.',
      },
      {
        title: 'Create Hosts and Connect',
        description: 'Add a host to each switch.',
        instructions: [
          'Create h1 (10.0.0.10/24) → link to sw1',
          'Create h2 (10.0.0.20/24) → link to sw2',
        ],
        where: 'builder',
        verify: 'h1↔sw1 and h2↔sw2 linked.',
      },
      {
        title: 'Connect Switches with Patch Ports',
        description: 'OVS patch ports create an internal connection between two bridges. It\'s like plugging a cable between two physical switches. No actual network interface is created — it\'s all internal to OVS.',
        instructions: [
          'Go to Terminal → BASH',
          'Create patch ports between sw1 and sw2',
        ],
        commands: [
          '# Create patch port on sw1 pointing to sw2',
          'ovs-vsctl add-port sw1 patch-to-sw2 -- set interface patch-to-sw2 type=patch options:peer=patch-to-sw1',
          '',
          '# Create patch port on sw2 pointing to sw1',
          'ovs-vsctl add-port sw2 patch-to-sw1 -- set interface patch-to-sw1 type=patch options:peer=patch-to-sw2',
          '',
          '# Verify',
          'ovs-vsctl show',
        ],
        where: 'cli',
        verify: 'ovs-vsctl show should display both bridges with patch ports listed.',
        tip: 'Patch ports always come in pairs — each side must reference the other as its peer.',
      },
      {
        title: 'Ping Across Switches',
        description: 'Now h1 (on sw1) should be able to ping h2 (on sw2) through the patch link.',
        instructions: [
          'Ping from h1 to h2 through the inter-switch link',
        ],
        commands: [
          'ip netns exec h1 ping -c 4 10.0.0.20',
        ],
        where: 'cli',
        verify: 'All 4 pings succeed. Frames flow: h1 → sw1 → patch → sw2 → h2',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'You\'ve built a multi-switch network! Patch ports let OVS bridges communicate internally. In production, this would be Ethernet cables, fiber, or even VXLAN tunnels linking switches across a datacenter.',
        instructions: [
          'Key concepts:',
          '• Patch ports = internal inter-bridge links',
          '• Always created in pairs (peer reference)',
          '• Extends L2 domain across switches',
          '• Packets traverse: host → switch → patch → switch → host',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 6: Manual Flow Rules ─────────────────────────────────
  {
    id: 'lab-06-manual-flows',
    title: 'Lab 6: Manual OpenFlow Rules',
    description: 'Take full control — write your own OpenFlow rules to permit, deny, and modify traffic.',
    difficulty: 'advanced',
    duration: '25 min',
    icon: '⚙️',
    tags: ['OpenFlow', 'Flow Rules', 'ovs-ofctl', 'ACL'],
    objectives: [
      'Clear all automatic flows',
      'Write permit rules (allow specific traffic)',
      'Write deny rules (block traffic)',
      'Understand match fields and actions',
    ],
    prerequisites: ['Completed Lab 3 (SDN Controller)'],
    topology: `
    ┌──────┐     ┌───────────┐     ┌──────┐
    │  h1  ├─────┤   sw1     ├─────┤  h2  │
    │.10/24│ p1  │ (secure)  │ p2  │.20/24│
    └──────┘     │           │     └──────┘
                 │           │
    ┌──────┐     │           │
    │  h3  ├─────┤           │
    │.30/24│ p3  └───────────┘
    └──────┘
    
    Flow rules YOU define control all traffic!`,
    steps: [
      {
        title: 'The Power of OpenFlow',
        description: 'OpenFlow lets you define exactly how every packet is handled. Each flow rule has:\n\n• **Match:** what packets to catch (MAC, IP, port, VLAN, etc.)\n• **Priority:** which rule wins when multiple match\n• **Actions:** what to do (forward, drop, modify, flood)\n\nHigher priority = checked first. First match wins.',
        instructions: [
          'We\'ll create a switch with 3 hosts',
          'Clear ALL automatic rules',
          'Write our OWN rules from scratch',
          'Selectively allow and block traffic',
        ],
        where: 'info',
        tip: 'Think of flow rules as firewall rules on steroids — they can match on any packet header field.',
      },
      {
        title: 'Build the Topology',
        description: 'Create a switch in secure mode with 3 hosts.',
        instructions: [
          'Create sw1 with SDN controller enabled (✅ checkbox)',
          'Create h1 (10.0.0.10/24) → link to sw1',
          'Create h2 (10.0.0.20/24) → link to sw1',
          'Create h3 (10.0.0.30/24) → link to sw1',
          'Verify all 3 can ping each other (controller installs rules)',
        ],
        commands: [
          '# Quick connectivity test',
          'ip netns exec h1 ping -c 1 10.0.0.20 && echo "h1→h2 OK"',
          'ip netns exec h1 ping -c 1 10.0.0.30 && echo "h1→h3 OK"',
        ],
        where: 'builder',
        verify: 'All pings succeed.',
      },
      {
        title: 'Delete All Flows',
        description: 'Now we take manual control. Delete all flows so the switch has a blank slate.',
        instructions: [
          'Delete all existing flows',
          'Verify the table is empty',
          'Try to ping — it should fail!',
        ],
        commands: [
          '# Delete ALL flows',
          'ovs-ofctl del-flows sw1 -O OpenFlow13',
          '',
          '# Verify — should be empty or just have 1 default rule',
          'ovs-ofctl dump-flows sw1 -O OpenFlow13',
          '',
          '# Ping should fail now (no rules = drop everything)',
          'ip netns exec h1 ping -c 2 -W 2 10.0.0.20',
        ],
        where: 'cli',
        verify: 'Flow table empty or minimal. Ping fails with 100% packet loss.',
        tip: 'In secure mode with no rules, the switch drops everything. You\'re now in full control!',
      },
      {
        title: 'Find Port Numbers',
        description: 'Before writing rules, we need to know the OpenFlow port numbers for each host\'s connection.',
        instructions: [
          'Show the port-to-interface mapping',
          'Note which port number corresponds to each host',
        ],
        commands: [
          '# Show OpenFlow port numbers',
          'ovs-ofctl show sw1 -O OpenFlow13',
        ],
        where: 'cli',
        verify: 'Note the port numbers — e.g., 1(sw1-h1), 2(sw1-h2), 3(sw1-h3)',
        tip: 'You\'ll use these port numbers in your flow rules. For example, if h1 is on port 1, you write in_port=1 to match traffic from h1.',
      },
      {
        title: 'Allow h1 ↔ h2 Only',
        description: 'Write rules to allow traffic between h1 and h2, but block everything else.',
        instructions: [
          'Install ARP rules (needed for IP resolution)',
          'Install ICMP/IP rules between h1↔h2',
          'Add a DROP rule for everything else',
          'Adjust port numbers based on your setup!',
        ],
        commands: [
          '# Allow ARP everywhere (needed for MAC resolution)',
          'ovs-ofctl add-flow sw1 "priority=100,arp,actions=FLOOD" -O OpenFlow13',
          '',
          '# Allow h1→h2 (adjust in_port and output based on your ports)',
          'ovs-ofctl add-flow sw1 "priority=50,ip,in_port=1,nw_dst=10.0.0.20,actions=output:2" -O OpenFlow13',
          '',
          '# Allow h2→h1 (return traffic)',
          'ovs-ofctl add-flow sw1 "priority=50,ip,in_port=2,nw_dst=10.0.0.10,actions=output:1" -O OpenFlow13',
          '',
          '# Drop everything else (low priority catch-all)',
          'ovs-ofctl add-flow sw1 "priority=1,actions=drop" -O OpenFlow13',
        ],
        where: 'cli',
        tip: 'Priority matters! Higher number = checked first. Our specific rules (50) are checked before the drop rule (1). ARP (100) is checked first.',
      },
      {
        title: 'Test Your Rules',
        description: 'Verify that your rules work correctly — h1↔h2 should work, h1↔h3 should be blocked.',
        instructions: [
          'Test allowed traffic: h1 → h2',
          'Test blocked traffic: h1 → h3',
          'Check flow statistics to see packet counts',
        ],
        commands: [
          '# Should WORK (we have rules for this)',
          'ip netns exec h1 ping -c 2 10.0.0.20',
          '',
          '# Should FAIL (no rule allows this → hits drop)',
          'ip netns exec h1 ping -c 2 -W 2 10.0.0.30',
          '',
          '# Check flow stats — see packet counts',
          'ovs-ofctl dump-flows sw1 -O OpenFlow13',
        ],
        where: 'cli',
        verify: 'h1→h2: works ✅, h1→h3: blocked ❌. Flow stats show packet/byte counts.',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'You\'ve written OpenFlow rules from scratch! This is the essence of SDN — programmable forwarding. You can match on any header field, set priorities, and chain complex actions.',
        instructions: [
          'Key concepts:',
          '• Flow rule = Match + Priority + Actions',
          '• Higher priority is checked first',
          '• "actions=drop" blocks traffic',
          '• "actions=output:N" forwards to specific port',
          '• "actions=FLOOD" sends to all ports',
          '• ARP must be allowed for IP communication to work',
          '• ovs-ofctl is the CLI tool for flow management',
        ],
        where: 'info',
      },
    ],
  },
];

export function getLabById(id: string): Lab | undefined {
  return labs.find((l) => l.id === id);
}
