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

  // ─── LAB 7: BGP Basics — First iBGP Peering ──────────────────
  {
    id: 'lab-07-bgp-ibgp-basics',
    title: 'Lab 7: BGP Basics — Your First iBGP Peering',
    description: 'Learn the fundamentals of BGP by establishing an iBGP session between two routers in the same AS. Understand BGP states, keepalives, and route advertisement.',
    difficulty: 'intermediate',
    duration: '25 min',
    icon: '🌐',
    tags: ['BGP', 'iBGP', 'FRR', 'Routing', 'AS'],
    objectives: [
      'Understand the difference between IGP and EGP',
      'Create two FRR routers in the same AS',
      'Configure iBGP peering between them',
      'Observe BGP neighbor states (Idle → Active → OpenSent → Established)',
      'Advertise and verify routes via BGP',
    ],
    prerequisites: ['Completed Labs 1-2', 'Understanding of IP addressing'],
    topology: `
         AS 65001
    ┌─────────────────────────────────┐
    │                                 │
    │  ┌──────┐     ┌──────┐         │
    │  │  R1  ├─────┤  R2  │         │
    │  │.1/24 │     │.2/24 │         │
    │  └──┬───┘     └───┬──┘         │
    │     │             │             │
    │  ┌──┴───┐     ┌───┴──┐         │
    │  │  h1  │     │  h2  │         │
    │  │.10/24│     │.20/24│         │
    │  └──────┘     └──────┘         │
    │       10.0.0.0/24              │
    └─────────────────────────────────┘`,
    steps: [
      {
        title: 'What is BGP?',
        description: 'BGP (Border Gateway Protocol) is the routing protocol that holds the Internet together. It\'s how Autonomous Systems (AS) exchange routing information.\n\n• **iBGP** — BGP between routers in the **same** AS\n• **eBGP** — BGP between routers in **different** ASes\n• Uses TCP port 179\n• Path-vector protocol — carries full AS path\n• BGP states: Idle → Connect → Active → OpenSent → OpenConfirm → Established',
        instructions: [
          'In this lab, we\'ll start with iBGP (same AS)',
          'Two routers in AS 65001 will peer with each other',
          'Each router has a host behind it',
          'Goal: hosts reach each other via BGP-learned routes',
        ],
        where: 'info',
        tip: 'BGP is different from OSPF — BGP doesn\'t discover neighbors automatically. You must explicitly configure each peer.',
      },
      {
        title: 'Create Router R1',
        description: 'Create the first FRR router in the topology.',
        instructions: [
          'Go to Topology → Canvas',
          'Click "Add Router (🔀)" in the toolbar',
          'Click on the left side of the canvas',
          'Name: router1',
          'Click "Create Router"',
        ],
        where: 'builder',
        verify: 'Green diamond "router1" appears on the canvas.',
      },
      {
        title: 'Create Router R2',
        description: 'Create the second router.',
        instructions: [
          'Click "Add Router (🔀)" again',
          'Click on the right side of the canvas',
          'Name: router2',
          'Click "Create Router"',
        ],
        where: 'builder',
        verify: 'Green diamond "router2" appears.',
      },
      {
        title: 'Create Hosts',
        description: 'Create two hosts — one behind each router.',
        instructions: [
          'Create h1 (IP: 10.0.1.10/24, Gateway: 10.0.1.1) → link to router1',
          'Create h2 (IP: 10.0.2.10/24, Gateway: 10.0.2.1) → link to router2',
        ],
        where: 'builder',
        verify: 'h1 linked to router1, h2 linked to router2.',
      },
      {
        title: 'Connect Routers & Create Switch',
        description: 'Connect the two routers through a switch so they can exchange BGP messages.',
        instructions: [
          'Create sw1 (standalone mode)',
          'Link router1 → sw1 (set router1 interface IP: 10.0.0.1/24)',
          'Link router2 → sw1 (set router2 interface IP: 10.0.0.2/24)',
        ],
        where: 'builder',
        verify: 'Both routers connected to sw1. router1 has 10.0.0.1/24, router2 has 10.0.0.2/24.',
        tip: 'The router-to-switch links need IP addresses. This is the network where BGP peering will happen.',
      },
      {
        title: 'Verify Router Connectivity',
        description: 'Before configuring BGP, make sure the routers can reach each other.',
        instructions: [
          'Open router1\'s terminal (right-click → Open CLI Terminal)',
          'Ping router2\'s IP to verify connectivity',
        ],
        commands: [
          '# From router1, ping router2',
          'ping -c 3 10.0.0.2',
        ],
        where: 'cli',
        verify: 'Ping should succeed with 0% packet loss.',
        tip: 'If ping fails, check that the router interfaces are up and IP addresses are correct.',
      },
      {
        title: 'Configure BGP on Router1',
        description: 'Enter FRR\'s vtysh shell in router1 and configure BGP. We\'ll set AS 65001 and peer with router2.',
        instructions: [
          'Open router1\'s CLI terminal',
          'Enter vtysh, then configure BGP',
        ],
        commands: [
          '# Enter FRR shell',
          'vtysh',
          '',
          '# Enter configuration mode',
          'configure terminal',
          '',
          '# Start BGP process with AS number 65001',
          'router bgp 65001',
          '',
          '# Set router-id',
          'bgp router-id 10.0.0.1',
          '',
          '# Add iBGP neighbor (router2)',
          'neighbor 10.0.0.2 remote-as 65001',
          'neighbor 10.0.0.2 description Router2-iBGP',
          '',
          '# Advertise connected networks',
          'address-family ipv4 unicast',
          'network 10.0.1.0/24',
          'network 10.0.0.0/24',
          'exit-address-family',
          '',
          '# Save and exit',
          'end',
          'write memory',
        ],
        where: 'cli',
        verify: 'Configuration saved. No errors in output.',
        tip: 'In iBGP, the remote-as is the SAME as your local AS. In eBGP it would be different.',
      },
      {
        title: 'Configure BGP on Router2',
        description: 'Same configuration on router2, but mirrored.',
        instructions: [
          'Open router2\'s CLI terminal',
          'Configure BGP to peer with router1',
        ],
        commands: [
          'vtysh',
          'configure terminal',
          'router bgp 65001',
          'bgp router-id 10.0.0.2',
          'neighbor 10.0.0.1 remote-as 65001',
          'neighbor 10.0.0.1 description Router1-iBGP',
          'address-family ipv4 unicast',
          'network 10.0.2.0/24',
          'network 10.0.0.0/24',
          'exit-address-family',
          'end',
          'write memory',
        ],
        where: 'cli',
        verify: 'Configuration saved successfully.',
      },
      {
        title: 'Verify BGP Session',
        description: 'Check that the BGP session is Established between both routers.',
        instructions: [
          'On router1, check the BGP summary and neighbor details',
        ],
        commands: [
          '# Check BGP summary',
          'vtysh -c "show ip bgp summary"',
          '',
          '# Check neighbor details',
          'vtysh -c "show ip bgp neighbors 10.0.0.2"',
          '',
          '# Check received routes',
          'vtysh -c "show ip bgp"',
        ],
        where: 'cli',
        verify: 'Neighbor 10.0.0.2 should show state "Established". You should see routes in the BGP table.',
        tip: 'BGP session might take 30-60 seconds to establish. If stuck in "Active" state, check connectivity and AS numbers.',
      },
      {
        title: 'Verify in NetOrch UI',
        description: 'Check the BGP summary in the NetOrch dashboard.',
        instructions: [
          'Go to the Router Management page',
          'Check the BGP Neighbors section',
          'You should see the peering with state "Established"',
        ],
        where: 'browser',
        verify: 'BGP neighbor shows up with Established state.',
      },
      {
        title: 'Test End-to-End Connectivity',
        description: 'The ultimate test — can h1 ping h2 through the BGP-learned routes?',
        instructions: [
          'Ping from h1 to h2 through the routers',
        ],
        commands: [
          '# From the VM bash (not vtysh)',
          'ip netns exec h1 ping -c 3 10.0.2.10',
          '',
          '# Check the routing table on router1',
          'ip netns exec router1 vtysh -c "show ip route"',
        ],
        where: 'cli',
        verify: 'Ping from h1 to h2 succeeds. Route table shows 10.0.2.0/24 learned via BGP.',
        tip: 'The route to 10.0.2.0/24 should show "B>" (BGP best route) in the routing table.',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'You\'ve established your first BGP session! Both routers in AS 65001 are exchanging routes via iBGP, and hosts can communicate through BGP-learned paths.',
        instructions: [
          'Key concepts learned:',
          '• BGP uses TCP port 179 for peering',
          '• iBGP = same AS number on both sides',
          '• BGP neighbor must be explicitly configured',
          '• "network" command advertises prefixes to peers',
          '• States: Idle → Active → OpenSent → Established',
          '• "show ip bgp summary" shows peering status',
          'Next: Lab 8 — eBGP between different ASes!',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 8: eBGP Peering Between Two ASes ────────────────────
  {
    id: 'lab-08-ebgp-peering',
    title: 'Lab 8: eBGP — Peering Between Two ASes',
    description: 'Configure eBGP between routers in different Autonomous Systems. Learn about eBGP multihop, next-hop-self, and how the Internet\'s inter-domain routing works.',
    difficulty: 'intermediate',
    duration: '30 min',
    icon: '🌍',
    tags: ['BGP', 'eBGP', 'AS', 'Inter-domain', 'next-hop-self'],
    objectives: [
      'Create routers in different Autonomous Systems',
      'Configure eBGP peering across AS boundaries',
      'Understand eBGP vs iBGP differences (TTL, next-hop behavior)',
      'Use next-hop-self for iBGP route redistribution',
      'Trace the AS path in BGP routes',
    ],
    prerequisites: ['Completed Lab 7 (iBGP basics)'],
    topology: `
      AS 65001                         AS 65002
    ┌───────────────┐              ┌───────────────┐
    │               │              │               │
    │  ┌──────┐     │  10.0.0.0/24 │     ┌──────┐  │
    │  │  h1  │     │              │     │  h2  │  │
    │  │.10   │     │              │     │.10   │  │
    │  └──┬───┘     │              │     └──┬───┘  │
    │     │ .0/24   │              │   .0/24│      │
    │  ┌──┴───┐     │     eBGP     │  ┌────┴──┐   │
    │  │  R1  ├─────┼──────────────┼──┤  R2   │   │
    │  │.1    │     │              │  │.2     │   │
    │  └──────┘     │              │  └───────┘   │
    │               │              │               │
    └───────────────┘              └───────────────┘`,
    steps: [
      {
        title: 'eBGP vs iBGP — What\'s Different?',
        description: 'When BGP peers are in **different** ASes, the session is called **eBGP** (external BGP). Key differences:\n\n• **TTL:** eBGP defaults to TTL=1 (directly connected), iBGP has no limit\n• **Next-hop:** eBGP changes next-hop to self, iBGP preserves original next-hop\n• **AS Path:** eBGP prepends local AS to outgoing routes\n• **Loop prevention:** eBGP rejects routes containing own AS in path\n• **Admin distance:** eBGP routes (AD=20) preferred over iBGP (AD=200)',
        instructions: [
          'In this lab, we\'ll set up 2 ASes with 1 router each',
          'R1 in AS 65001, R2 in AS 65002',
          'eBGP peering on a shared /24 network',
          'Each AS has a host behind its router',
        ],
        where: 'info',
        tip: 'On the real Internet, eBGP is how ISPs, companies, and cloud providers exchange routes with each other.',
      },
      {
        title: 'Build the Topology',
        description: 'Create 2 routers, 2 hosts, and a connecting switch.',
        instructions: [
          'Create router1 (R1 — AS 65001)',
          'Create router2 (R2 — AS 65002)',
          'Create sw1 (standalone) and connect both routers to it',
          'Set router1→sw1 IP: 10.0.0.1/24',
          'Set router2→sw1 IP: 10.0.0.2/24',
          'Create h1 (10.0.1.10/24, gw 10.0.1.1) → link to router1',
          'Create h2 (10.0.2.10/24, gw 10.0.2.1) → link to router2',
        ],
        where: 'builder',
        verify: 'Topology: h1 ↔ router1 ↔ sw1 ↔ router2 ↔ h2',
      },
      {
        title: 'Configure eBGP on R1 (AS 65001)',
        description: 'Configure BGP on router1 with AS 65001. The key difference from Lab 7: the neighbor has a **different** AS number.',
        instructions: [
          'Open router1 CLI terminal',
          'Configure BGP with eBGP peer',
        ],
        commands: [
          'vtysh',
          'configure terminal',
          'router bgp 65001',
          'bgp router-id 10.0.0.1',
          '',
          '# eBGP peer — note different AS number!',
          'neighbor 10.0.0.2 remote-as 65002',
          'neighbor 10.0.0.2 description R2-eBGP',
          '',
          'address-family ipv4 unicast',
          'network 10.0.1.0/24',
          'network 10.0.0.0/24',
          'exit-address-family',
          'end',
          'write memory',
        ],
        where: 'cli',
        verify: 'No errors. Config saved.',
        tip: 'The remote-as is 65002 (not 65001) — this makes it eBGP instead of iBGP.',
      },
      {
        title: 'Configure eBGP on R2 (AS 65002)',
        description: 'Mirror configuration on router2 with AS 65002.',
        commands: [
          'vtysh',
          'configure terminal',
          'router bgp 65002',
          'bgp router-id 10.0.0.2',
          '',
          '# eBGP peer pointing back to R1',
          'neighbor 10.0.0.1 remote-as 65001',
          'neighbor 10.0.0.1 description R1-eBGP',
          '',
          'address-family ipv4 unicast',
          'network 10.0.2.0/24',
          'network 10.0.0.0/24',
          'exit-address-family',
          'end',
          'write memory',
        ],
        instructions: [
          'Open router2 CLI terminal',
          'Configure AS 65002 and peer with R1',
        ],
        where: 'cli',
        verify: 'Config saved. BGP should start establishing.',
      },
      {
        title: 'Verify eBGP Session & AS Path',
        description: 'Check the BGP session and examine the AS path — this is the key difference from iBGP.',
        instructions: [
          'On router1, check the BGP table and observe AS path',
        ],
        commands: [
          '# BGP summary — check state',
          'vtysh -c "show ip bgp summary"',
          '',
          '# Full BGP table — look at AS_PATH column',
          'vtysh -c "show ip bgp"',
          '',
          '# Detailed route info for R2\'s network',
          'vtysh -c "show ip bgp 10.0.2.0/24"',
        ],
        where: 'cli',
        verify: 'Session Established. Route 10.0.2.0/24 shows AS path "65002". This means the route came from AS 65002.',
        tip: 'In iBGP (Lab 7), the AS path was empty because both routers were in the same AS. In eBGP, each AS prepends its own number.',
      },
      {
        title: 'Test End-to-End & Traceroute',
        description: 'Verify hosts can communicate across AS boundaries and trace the path.',
        commands: [
          '# Ping from h1 to h2 (cross-AS)',
          'ip netns exec h1 ping -c 3 10.0.2.10',
          '',
          '# Traceroute to see the path',
          'ip netns exec h1 traceroute -n 10.0.2.10',
          '',
          '# Check routing table on R1',
          'ip netns exec router1 vtysh -c "show ip route"',
        ],
        instructions: [
          'Test cross-AS connectivity with ping',
          'Use traceroute to verify the path',
        ],
        where: 'cli',
        verify: 'Ping succeeds. Traceroute shows hops: 10.0.1.1 (R1) → 10.0.0.2 (R2) → 10.0.2.10 (h2).',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'You\'ve set up eBGP between two Autonomous Systems! This is exactly how ISPs and large networks connect on the Internet.',
        instructions: [
          'Key concepts learned:',
          '• eBGP = different AS numbers → inter-domain routing',
          '• AS path records which ASes a route has traversed',
          '• eBGP changes next-hop to the advertising router\'s IP',
          '• Administrative Distance: eBGP (20) < iBGP (200)',
          '• AS path is used for loop prevention (reject own AS)',
          'Next: Lab 9 — BGP Route Filtering!',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 9: BGP Route Filtering with Prefix Lists ────────────
  {
    id: 'lab-09-bgp-prefix-filter',
    title: 'Lab 9: BGP Route Filtering — Prefix Lists',
    description: 'Control which routes are advertised or accepted using prefix lists and route maps. This is fundamental for BGP security and policy.',
    difficulty: 'advanced',
    duration: '30 min',
    icon: '🛡️',
    tags: ['BGP', 'Prefix List', 'Route Map', 'Filtering', 'Security'],
    objectives: [
      'Create prefix lists to match specific networks',
      'Apply inbound and outbound filters to BGP neighbors',
      'Use route maps for complex filtering policies',
      'Verify filtered vs. accepted routes',
      'Understand why route filtering is critical for Internet security',
    ],
    prerequisites: ['Completed Lab 8 (eBGP)'],
    topology: `
      AS 65001                              AS 65002
    ┌───────────────┐                   ┌───────────────────┐
    │               │                   │  10.0.2.0/24 (OK) │
    │  ┌──────┐     │      eBGP        │  10.0.3.0/24 (OK) │
    │  │  R1  ├─────┼──────────────────┼──┤  R2             │
    │  │65001 │     │                   │  10.99.0.0/24 (✗) │
    │  └──────┘     │   prefix-list     │  ← BLOCKED!      │
    │               │   filters here    │                   │
    └───────────────┘                   └───────────────────┘`,
    steps: [
      {
        title: 'Why Filter BGP Routes?',
        description: 'On the Internet, BGP route filtering is **critical**:\n\n• **Without filters:** a misconfigured router could announce routes for networks it doesn\'t own (route hijacking)\n• **Prefix lists:** match routes by network address and mask length\n• **Route maps:** combine multiple conditions and set attributes\n• **Inbound filter:** controls what routes you accept FROM a peer\n• **Outbound filter:** controls what routes you advertise TO a peer\n\nReal-world example: In 2018, a BGP leak by a small ISP caused Google traffic to be routed through Russia and China for over an hour.',
        instructions: [
          'We\'ll build on the eBGP topology from Lab 8',
          'R2 will advertise 3 networks (2 legitimate + 1 bogus)',
          'R1 will use a prefix list to block the bogus route',
          'This simulates real-world BGP filtering',
        ],
        where: 'info',
        tip: 'Every ISP uses prefix lists. Without them, the Internet would be chaos.',
      },
      {
        title: 'Build the Topology',
        description: 'Create the same two-router eBGP topology from Lab 8.',
        instructions: [
          'Create router1, router2, sw1',
          'router1→sw1: 10.0.0.1/24',
          'router2→sw1: 10.0.0.2/24',
          'Configure eBGP: R1 AS 65001, R2 AS 65002 (same as Lab 8)',
        ],
        commands: [
          '# R1: AS 65001',
          'ip netns exec router1 vtysh -c "configure terminal" -c "router bgp 65001" -c "bgp router-id 10.0.0.1" -c "neighbor 10.0.0.2 remote-as 65002" -c "address-family ipv4 unicast" -c "network 10.0.1.0/24" -c "exit-address-family" -c "end" -c "write memory"',
          '',
          '# R2: AS 65002 — advertise 3 networks (1 will be "bogus")',
          'ip netns exec router2 vtysh -c "configure terminal" -c "router bgp 65002" -c "bgp router-id 10.0.0.2" -c "neighbor 10.0.0.1 remote-as 65001" -c "address-family ipv4 unicast" -c "network 10.0.2.0/24" -c "network 10.0.3.0/24" -c "network 10.99.0.0/24" -c "exit-address-family" -c "end" -c "write memory"',
        ],
        where: 'cli',
        verify: 'Both routers configured. R2 advertises three /24 networks.',
      },
      {
        title: 'Verify — R1 Receives All Routes (No Filter)',
        description: 'Before applying any filter, check that R1 receives all 3 routes from R2.',
        commands: [
          '# Check BGP table on R1',
          'ip netns exec router1 vtysh -c "show ip bgp"',
          '',
          '# You should see all 3 routes from R2:',
          '# 10.0.2.0/24  via 10.0.0.2 (AS 65002)',
          '# 10.0.3.0/24  via 10.0.0.2 (AS 65002)',
          '# 10.99.0.0/24 via 10.0.0.2 (AS 65002) ← bogus!',
        ],
        instructions: [
          'Check that R1 has received all 3 routes',
          'The 10.99.0.0/24 route is the one we want to block',
        ],
        where: 'cli',
        verify: 'R1 shows all 3 routes from AS 65002 in its BGP table.',
        tip: 'Without filtering, R1 trusts everything R2 advertises — this is dangerous!',
      },
      {
        title: 'Create a Prefix List on R1',
        description: 'A prefix list is a named set of rules that match IP prefixes. We\'ll create one that permits only 10.0.2.0/24 and 10.0.3.0/24, and denies everything else.',
        commands: [
          'ip netns exec router1 vtysh',
          'configure terminal',
          '',
          '# Create prefix list — order matters! (seq number)',
          'ip prefix-list ALLOWED-FROM-R2 seq 10 permit 10.0.2.0/24',
          'ip prefix-list ALLOWED-FROM-R2 seq 20 permit 10.0.3.0/24',
          '# Implicit deny all at the end!',
          '',
          'end',
          'write memory',
        ],
        instructions: [
          'Enter vtysh on router1',
          'Create a prefix list named "ALLOWED-FROM-R2"',
          'Permit only the legitimate networks',
        ],
        where: 'cli',
        verify: 'Prefix list created. No errors.',
        tip: 'Prefix lists have an implicit "deny all" at the end — anything not explicitly permitted is denied.',
      },
      {
        title: 'Apply the Prefix List to BGP Neighbor',
        description: 'Apply the prefix list as an inbound filter on the neighbor 10.0.0.2 (R2).',
        commands: [
          'ip netns exec router1 vtysh',
          'configure terminal',
          'router bgp 65001',
          '',
          'address-family ipv4 unicast',
          '# Apply prefix list on inbound routes from R2',
          'neighbor 10.0.0.2 prefix-list ALLOWED-FROM-R2 in',
          'exit-address-family',
          '',
          'end',
          'write memory',
          '',
          '# Clear BGP session to re-evaluate routes',
          'clear ip bgp 10.0.0.2 soft in',
        ],
        instructions: [
          'Apply the prefix list as an inbound filter',
          'Soft-clear the BGP session to apply immediately',
        ],
        where: 'cli',
        verify: 'Filter applied. BGP session soft-cleared.',
        tip: '"soft in" re-processes received routes without tearing down the BGP session.',
      },
      {
        title: 'Verify — Bogus Route is Blocked!',
        description: 'Now check the BGP table on R1 — the 10.99.0.0/24 route should be gone.',
        commands: [
          '# Check BGP table',
          'ip netns exec router1 vtysh -c "show ip bgp"',
          '',
          '# Check specific bogus route — should be rejected',
          'ip netns exec router1 vtysh -c "show ip bgp 10.99.0.0/24"',
          '',
          '# Show prefix list hit counters',
          'ip netns exec router1 vtysh -c "show ip prefix-list ALLOWED-FROM-R2"',
        ],
        instructions: [
          'Check the BGP table — 10.99.0.0/24 should be gone',
          'Verify the prefix list counters show hits',
        ],
        where: 'cli',
        verify: 'Only 10.0.2.0/24 and 10.0.3.0/24 remain. 10.99.0.0/24 is filtered out!',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'You\'ve implemented BGP route filtering! This is exactly how ISPs protect themselves from route hijacks and leaks.',
        instructions: [
          'Key concepts learned:',
          '• Prefix lists match routes by network/mask',
          '• "permit" allows, "deny" blocks, implicit deny at end',
          '• Apply with "neighbor X prefix-list NAME in/out"',
          '• "clear ip bgp X soft in" re-applies without session reset',
          '• Route filtering is CRITICAL for BGP security',
          '• Real ISPs filter based on IRR/RPKI databases',
          'Next: Lab 10 — BGP Path Attributes & Route Selection!',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 10: BGP Path Attributes & Route Selection ───────────
  {
    id: 'lab-10-bgp-path-attributes',
    title: 'Lab 10: BGP Path Attributes & Best Path Selection',
    description: 'Understand how BGP selects the best path when multiple routes exist. Learn about Local Preference, AS Path Prepending, MED, and the BGP decision process.',
    difficulty: 'advanced',
    duration: '35 min',
    icon: '🏆',
    tags: ['BGP', 'Local Preference', 'AS Path Prepend', 'MED', 'Best Path'],
    objectives: [
      'Understand the BGP best path selection algorithm',
      'Use Local Preference to influence outbound traffic',
      'Use AS Path Prepending to influence inbound traffic',
      'Configure MED (Multi-Exit Discriminator)',
      'Observe BGP decision process in action',
    ],
    prerequisites: ['Completed Lab 8 (eBGP)', 'Understanding of AS path'],
    topology: `
                     AS 65002
                   ┌──────────┐
              eBGP │   R2     │
           ┌───────┤  .2/24   │
           │       └──────────┘
      AS 65001         │
    ┌──────────┐       │ 10.0.0.0/24
    │   R1     │       │
    │  .1/24   ├───────┘
    │          │       ┌──────────┐
    │          ├───────┤   R3     │ AS 65003
    └──────────┘  eBGP │  .3/24   │
                       └──────────┘
    
    R1 has TWO paths to reach remote networks!`,
    steps: [
      {
        title: 'The BGP Decision Process',
        description: 'When BGP has multiple paths to the same destination, it picks the **best** one using this algorithm (in order):\n\n1. **Highest Weight** (Cisco proprietary, local to router)\n2. **Highest Local Preference** (default 100, shared in iBGP)\n3. **Locally originated** (prefer own routes)\n4. **Shortest AS Path** (fewer AS hops = better)\n5. **Lowest Origin** (IGP < EGP < incomplete)\n6. **Lowest MED** (metric from neighbor AS)\n7. **eBGP over iBGP**\n8. **Lowest IGP metric to next-hop**\n9. **Oldest route** (stability)\n10. **Lowest Router ID**\n\nWe\'ll focus on **Local Preference**, **AS Path**, and **MED** — the most commonly used.',
        instructions: [
          'R1 will have TWO eBGP peers: R2 (AS 65002) and R3 (AS 65003)',
          'Both will advertise the same destination network',
          'We\'ll manipulate path selection using BGP attributes',
        ],
        where: 'info',
        tip: 'Remember: "Higher is better" for Local Pref & Weight. "Lower is better" for AS Path length & MED.',
      },
      {
        title: 'Build a Multi-path Topology',
        description: 'Create 3 routers — R1 with two eBGP peers.',
        instructions: [
          'Create router1, router2, router3',
          'Create sw1 (standalone) and connect all 3 routers',
          'router1→sw1: 10.0.0.1/24',
          'router2→sw1: 10.0.0.2/24',
          'router3→sw1: 10.0.0.3/24',
        ],
        where: 'builder',
        verify: 'Three routers all connected to sw1.',
      },
      {
        title: 'Configure eBGP on All Routers',
        description: 'Set up eBGP — R1 (AS 65001) peers with R2 (AS 65002) and R3 (AS 65003). Both R2 and R3 will advertise 172.16.0.0/24.',
        commands: [
          '# R1: AS 65001 — peers with R2 and R3',
          'ip netns exec router1 vtysh -c "configure terminal" -c "router bgp 65001" -c "bgp router-id 10.0.0.1" -c "neighbor 10.0.0.2 remote-as 65002" -c "neighbor 10.0.0.3 remote-as 65003" -c "address-family ipv4 unicast" -c "network 10.0.1.0/24" -c "exit-address-family" -c "end" -c "write memory"',
          '',
          '# R2: AS 65002 — advertises 172.16.0.0/24',
          'ip netns exec router2 vtysh -c "configure terminal" -c "router bgp 65002" -c "bgp router-id 10.0.0.2" -c "neighbor 10.0.0.1 remote-as 65001" -c "address-family ipv4 unicast" -c "network 172.16.0.0/24" -c "network 10.0.0.0/24" -c "exit-address-family" -c "end" -c "write memory"',
          '',
          '# R3: AS 65003 — also advertises 172.16.0.0/24',
          'ip netns exec router3 vtysh -c "configure terminal" -c "router bgp 65003" -c "bgp router-id 10.0.0.3" -c "neighbor 10.0.0.1 remote-as 65001" -c "address-family ipv4 unicast" -c "network 172.16.0.0/24" -c "network 10.0.0.0/24" -c "exit-address-family" -c "end" -c "write memory"',
        ],
        instructions: [
          'Configure BGP on all 3 routers',
          'Both R2 and R3 advertise the same 172.16.0.0/24 network',
        ],
        where: 'cli',
        verify: 'All sessions established. R1 sees 172.16.0.0/24 from both R2 and R3.',
      },
      {
        title: 'Check Default Best Path',
        description: 'See which path R1 selects by default for 172.16.0.0/24.',
        commands: [
          '# Check all paths to 172.16.0.0/24',
          'ip netns exec router1 vtysh -c "show ip bgp 172.16.0.0/24"',
          '',
          '# The "best" path is marked with ">"',
          '# Default: shorter AS path wins (both same length here)',
          '# So it falls to lowest router-id as tiebreaker',
        ],
        instructions: [
          'Check which path R1 selected as best',
          'Both paths have AS path length 1, so tie-breaking rules apply',
        ],
        where: 'cli',
        verify: 'R1 shows 2 paths to 172.16.0.0/24, one marked with ">" (best).',
        tip: 'When AS path length is equal, BGP uses subsequent criteria. The lowest router-id (10.0.0.2) typically wins.',
      },
      {
        title: 'Use Local Preference to Prefer R3',
        description: 'Local Preference (default 100) tells a router which exit path to prefer. **Higher = better**. Let\'s set routes from R3 to have Local Pref 200.',
        commands: [
          'ip netns exec router1 vtysh',
          'configure terminal',
          '',
          '# Create a route map to set local preference',
          'route-map PREFER-R3 permit 10',
          'set local-preference 200',
          'exit',
          '',
          '# Apply to R3 neighbor (inbound)',
          'router bgp 65001',
          'address-family ipv4 unicast',
          'neighbor 10.0.0.3 route-map PREFER-R3 in',
          'exit-address-family',
          'end',
          'write memory',
          '',
          '# Soft-clear to apply',
          'clear ip bgp 10.0.0.3 soft in',
        ],
        instructions: [
          'Create a route map that sets Local Preference to 200',
          'Apply it to the R3 neighbor inbound',
        ],
        where: 'cli',
        verify: 'Route map applied. BGP soft-cleared.',
      },
      {
        title: 'Verify — R3 Path is Now Best',
        description: 'Check the BGP table — the path via R3 should now be selected as best because Local Pref 200 > 100.',
        commands: [
          '# Check paths to 172.16.0.0/24',
          'ip netns exec router1 vtysh -c "show ip bgp 172.16.0.0/24"',
          '',
          '# The R3 path should show localpref 200 and be ">" best',
          '# The R2 path should show default localpref 100',
        ],
        instructions: [
          'Verify the best path is now via R3 (10.0.0.3)',
          'Check that Local Preference values differ',
        ],
        where: 'cli',
        verify: 'Path via 10.0.0.3 (R3) is now ">" best with localpref 200.',
        tip: 'Local Preference is the most commonly used attribute for traffic engineering within an AS.',
      },
      {
        title: 'AS Path Prepending on R3',
        description: 'Now let\'s try the opposite — make R3\'s path LESS preferred using AS path prepending. R3 will artificially lengthen its AS path by prepending its own AS number multiple times.',
        commands: [
          '# First, remove the local-pref route map from R1',
          'ip netns exec router1 vtysh -c "configure terminal" -c "router bgp 65001" -c "address-family ipv4 unicast" -c "no neighbor 10.0.0.3 route-map PREFER-R3 in" -c "exit-address-family" -c "end" -c "write memory"',
          '',
          '# On R3: create a route map to prepend AS path',
          'ip netns exec router3 vtysh',
          'configure terminal',
          'route-map PREPEND-OUT permit 10',
          'set as-path prepend 65003 65003 65003',
          'exit',
          '',
          'router bgp 65003',
          'address-family ipv4 unicast',
          'neighbor 10.0.0.1 route-map PREPEND-OUT out',
          'exit-address-family',
          'end',
          'write memory',
          '',
          '# Soft-clear',
          'clear ip bgp 10.0.0.1 soft out',
        ],
        instructions: [
          'Remove the local-pref change from R1',
          'On R3, prepend AS 65003 three times to outbound routes',
          'This makes R3\'s path look longer: 65003 65003 65003 65003',
        ],
        where: 'cli',
        verify: 'AS path prepending configured on R3.',
        tip: 'AS path prepending is used by networks to influence how OTHER networks send traffic to them. It\'s one of the few ways to influence inbound traffic.',
      },
      {
        title: 'Verify — R2 Path Wins (Shorter AS Path)',
        description: 'Check R1\'s BGP table. The path via R2 should now be best because its AS path (65002) is shorter than R3\'s (65003 65003 65003 65003).',
        commands: [
          '# Check paths — observe AS path lengths',
          'ip netns exec router1 vtysh -c "show ip bgp 172.16.0.0/24"',
          '',
          '# R2 path: AS 65002 (length 1)',
          '# R3 path: AS 65003 65003 65003 65003 (length 4)',
          '# R2 wins! Shorter AS path is preferred.',
        ],
        instructions: [
          'Verify R2\'s path is best due to shorter AS path',
        ],
        where: 'cli',
        verify: 'R2 path (AS 65002, length 1) is ">" best. R3 path shows 65003 repeated 4 times.',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'You\'ve mastered key BGP path attributes! These tools are how network engineers control traffic flow across the Internet.',
        instructions: [
          'Key concepts learned:',
          '• Local Preference: higher = preferred exit path (iBGP scope)',
          '• AS Path Prepending: longer path = less preferred (influences inbound)',
          '• BGP decision process: Weight > LP > AS Path > MED > ...',
          '• Route maps: powerful tool to set/modify attributes',
          '• "clear ip bgp X soft in/out" applies changes without reset',
          '• Traffic engineering = influencing path selection',
          'Next: Lab 11 — BGP Communities & Advanced Policies!',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 11: BGP Communities & Advanced Policy ────────────────
  {
    id: 'lab-11-bgp-communities',
    title: 'Lab 11: BGP Communities & Advanced Policy',
    description: 'Use BGP communities to tag routes and apply complex policies. Learn well-known communities (no-export, no-advertise) and custom community tagging for scalable policy management.',
    difficulty: 'advanced',
    duration: '35 min',
    icon: '🏷️',
    tags: ['BGP', 'Communities', 'Route Policy', 'no-export', 'no-advertise'],
    objectives: [
      'Understand BGP communities as route "tags"',
      'Use well-known communities: no-export, no-advertise',
      'Create custom communities for policy signaling',
      'Build route maps that match and set communities',
      'Implement a real-world transit vs. peering policy',
    ],
    prerequisites: ['Completed Lab 9-10 (filtering & path attributes)'],
    topology: `
                      AS 65002 (Transit)
                    ┌──────────────┐
               eBGP │     R2       │
            ┌───────┤   Transit    │──── → Internet
            │       └──────────────┘
       AS 65001                          
     ┌──────────┐                        
     │   R1     │                        
     │ Customer │                        
     │          │                        
     └────┬─────┘                        
          │ eBGP                         
          │       ┌──────────────┐       
          └───────┤     R3       │ AS 65003 (Peer)
                  │   Peering    │
                  └──────────────┘`,
    steps: [
      {
        title: 'What are BGP Communities?',
        description: 'BGP communities are **tags** attached to routes. They let you signal policy intent to neighboring ASes without changing the route itself.\n\nFormats:\n• **Standard:** AS:value (e.g., 65001:100)\n• **Well-known:**\n  - `no-export` — don\'t advertise to eBGP peers\n  - `no-advertise` — don\'t advertise to ANY peer\n  - `internet` — advertise to everyone (default)\n  - `local-as` — don\'t advertise outside the local AS confederation\n\nCommunities are the backbone of ISP policy. For example, a transit provider might use 65002:666 to mean "blackhole this route" or 65002:100 to mean "set local preference to 100".',
        instructions: [
          'In this lab, R1 (customer) has two providers:',
          'R2 (AS 65002) is the transit provider',
          'R3 (AS 65003) is a peering partner',
          'Goal: Only send customer routes to R2, not peering routes',
        ],
        where: 'info',
        tip: 'ISPs define a "community dictionary" — customers tag routes with specific communities to request behavior from the provider.',
      },
      {
        title: 'Build Three-Router Topology',
        description: 'Create the customer-transit-peering topology.',
        instructions: [
          'Create router1 (R1, Customer AS 65001)',
          'Create router2 (R2, Transit AS 65002)',
          'Create router3 (R3, Peer AS 65003)',
          'Create sw1 (standalone), connect all routers',
          'router1→sw1: 10.0.0.1/24',
          'router2→sw1: 10.0.0.2/24',
          'router3→sw1: 10.0.0.3/24',
        ],
        where: 'builder',
        verify: 'Three routers connected to sw1.',
      },
      {
        title: 'Configure Basic eBGP on All Routers',
        description: 'Set up eBGP between all three routers.',
        commands: [
          '# R1 (AS 65001) — customer',
          'ip netns exec router1 vtysh -c "configure terminal" -c "router bgp 65001" -c "bgp router-id 10.0.0.1" -c "neighbor 10.0.0.2 remote-as 65002" -c "neighbor 10.0.0.3 remote-as 65003" -c "address-family ipv4 unicast" -c "network 10.0.1.0/24" -c "exit-address-family" -c "end" -c "write memory"',
          '',
          '# R2 (AS 65002) — transit',
          'ip netns exec router2 vtysh -c "configure terminal" -c "router bgp 65002" -c "bgp router-id 10.0.0.2" -c "neighbor 10.0.0.1 remote-as 65001" -c "neighbor 10.0.0.3 remote-as 65003" -c "address-family ipv4 unicast" -c "network 10.0.2.0/24" -c "exit-address-family" -c "end" -c "write memory"',
          '',
          '# R3 (AS 65003) — peering partner',
          'ip netns exec router3 vtysh -c "configure terminal" -c "router bgp 65003" -c "bgp router-id 10.0.0.3" -c "neighbor 10.0.0.1 remote-as 65001" -c "address-family ipv4 unicast" -c "network 10.0.3.0/24" -c "exit-address-family" -c "end" -c "write memory"',
        ],
        instructions: [
          'Configure eBGP on all three routers',
          'R1 peers with both R2 and R3',
          'R2 also peers with R3 (full mesh)',
        ],
        where: 'cli',
        verify: 'All BGP sessions Established.',
      },
      {
        title: 'Verify — R2 Sees Peering Routes',
        description: 'Before applying communities, check that R2 (transit) sees R3\'s routes via R1. This is a problem — R1 shouldn\'t transit peering traffic through its paid transit link.',
        commands: [
          '# On R2, check if it learned R3\'s network via R1',
          'ip netns exec router2 vtysh -c "show ip bgp"',
          '',
          '# Look for 10.0.3.0/24 — if R2 sees it via R1,',
          '# it means R1 is transiting R3\'s traffic = not good!',
        ],
        instructions: [
          'Check R2\'s BGP table for R3\'s routes',
          'R2 might learn 10.0.3.0/24 through R1 (customer)',
        ],
        where: 'cli',
        verify: 'R2 may see 10.0.3.0/24 via R1 or directly via R3.',
        tip: 'A customer (R1) should NOT transit peering traffic through its paid transit (R2). This is a classic BGP policy problem.',
      },
      {
        title: 'Tag Peering Routes with no-export',
        description: 'On R1, tag routes learned from the peering partner (R3) with the well-known community **no-export**. This tells R1: "do not advertise these routes to eBGP peers" — so R2 won\'t learn R3\'s routes through R1.',
        commands: [
          'ip netns exec router1 vtysh',
          'configure terminal',
          '',
          '# Route map to tag incoming routes from R3 with no-export',
          'route-map FROM-PEER permit 10',
          'set community no-export',
          'exit',
          '',
          '# Apply to R3 neighbor inbound',
          'router bgp 65001',
          'address-family ipv4 unicast',
          'neighbor 10.0.0.3 route-map FROM-PEER in',
          'exit-address-family',
          '',
          'end',
          'write memory',
          '',
          '# Re-process routes',
          'clear ip bgp 10.0.0.3 soft in',
        ],
        instructions: [
          'Create a route map that sets no-export community',
          'Apply it to routes received from R3 (peering partner)',
          'Soft-clear to re-process',
        ],
        where: 'cli',
        verify: 'Route map applied. BGP session is not reset.',
        tip: 'no-export means: "I can use this route, but I won\'t forward it to any eBGP peer." R1 can still reach R3, but won\'t tell R2 about it.',
      },
      {
        title: 'Verify — no-export in Action',
        description: 'Check that R1 still has R3\'s route but R2 no longer learns it from R1.',
        commands: [
          '# R1 should still have the route (with no-export tag)',
          'ip netns exec router1 vtysh -c "show ip bgp 10.0.3.0/24"',
          '',
          '# Look for "Community: no-export" in the output',
          '',
          '# R2 should NOT learn 10.0.3.0/24 via R1 anymore',
          'ip netns exec router2 vtysh -c "show ip bgp 10.0.3.0/24"',
        ],
        instructions: [
          'On R1: verify route has no-export community attached',
          'On R2: verify R2 no longer has the route via R1',
        ],
        where: 'cli',
        verify: 'R1 shows 10.0.3.0/24 with "Community: no-export". R2 does NOT receive it from R1.',
      },
      {
        title: 'Custom Communities — Tag Customer Routes',
        description: 'Now let\'s use custom communities. We\'ll tag R1\'s customer routes with 65001:100 to signal "this is a customer route."',
        commands: [
          'ip netns exec router1 vtysh',
          'configure terminal',
          '',
          '# Route map for outbound to transit (R2)',
          'route-map TO-TRANSIT permit 10',
          'set community 65001:100',
          'exit',
          '',
          'router bgp 65001',
          'address-family ipv4 unicast',
          'neighbor 10.0.0.2 route-map TO-TRANSIT out',
          'exit-address-family',
          'end',
          'write memory',
          '',
          'clear ip bgp 10.0.0.2 soft out',
        ],
        instructions: [
          'Create a route map to tag outbound routes to R2 with 65001:100',
          'The transit provider can use this community to apply policies',
        ],
        where: 'cli',
        verify: 'Custom community route map applied.',
      },
      {
        title: 'Verify Custom Communities on R2',
        description: 'Check on R2 (transit) that routes from R1 carry the 65001:100 community tag.',
        commands: [
          '# On R2, check R1\'s routes with community details',
          'ip netns exec router2 vtysh -c "show ip bgp 10.0.1.0/24"',
          '',
          '# Look for "Community: 65001:100" in the output',
          '',
          '# Show all routes with a specific community',
          'ip netns exec router2 vtysh -c "show ip bgp community 65001:100"',
        ],
        instructions: [
          'Verify routes from R1 carry the 65001:100 community',
          'The transit provider can now build policies based on this tag',
        ],
        where: 'cli',
        verify: 'Routes from R1 show "Community: 65001:100" on R2.',
        tip: 'In the real world, ISPs publish a community dictionary. Customers use these to request specific treatment (set local-pref, prepend, blackhole, etc.).',
      },
      {
        title: '🎉 Lab Complete!',
        description: 'You\'ve mastered BGP communities! This is how ISPs and large networks implement scalable routing policy across thousands of peering sessions.',
        instructions: [
          'Key concepts learned:',
          '• Communities are "tags" attached to BGP routes',
          '• no-export: don\'t advertise to eBGP peers',
          '• no-advertise: don\'t advertise to ANY peer',
          '• Custom communities (AS:value) signal policy intent',
          '• Route maps set/match communities',
          '• Transit vs. peering: communities control route leaking',
          '• Real ISPs use communities for blackholing, local-pref, etc.',
          'Congratulations on completing all BGP labs! 🎓',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 12: OSPF Single-Area Basics ──────────────────────────
  {
    id: 'lab-12-ospf-single-area',
    title: 'Lab 12: OSPF Single-Area Basics',
    description: 'Configure OSPF in a single area (Area 0) between two routers. Learn the fundamentals of link-state routing, neighbor adjacency, and SPF path calculation.',
    difficulty: 'beginner',
    duration: '20 min',
    icon: '🕸️',
    tags: ['OSPF', 'Routing', 'Link-State', 'Area 0', 'SPF'],
    objectives: [
      'Understand OSPF as a link-state routing protocol',
      'Configure OSPF Area 0 on two connected routers',
      'Verify OSPF neighbor adjacency reaches FULL state',
      'Observe OSPF-learned routes in the routing table',
      'Understand Router ID, Hello/Dead intervals, and LSA types',
    ],
    prerequisites: [
      'VM is running with FRR + OVS',
      'Backend and Frontend are started',
      'Logged in (for write operations)',
    ],
    topology: `
    ┌──────────┐   10.0.12.0/30   ┌──────────┐
    │ router1  │─────────────────│ router2  │
    │ .1       │                  │ .2       │
    │ Loopback │                  │ Loopback │
    │ 1.1.1.1  │                  │ 2.2.2.2  │
    └──────────┘                  └──────────┘
              Area 0 (Backbone)
    `,
    steps: [
      {
        title: 'Understand OSPF',
        description: 'OSPF (Open Shortest Path First) is a link-state Interior Gateway Protocol (IGP). Unlike distance-vector protocols like RIP, OSPF builds a complete map of the network topology and uses Dijkstra\'s SPF algorithm to compute shortest paths.',
        instructions: [
          'OSPF routers exchange LSAs (Link-State Advertisements) to build a Link-State Database (LSDB)',
          'All routers in an area share the same LSDB',
          'Each router independently runs SPF to compute the best path to every destination',
          'OSPF uses "cost" as metric (typically based on bandwidth: cost = 100Mbps / link_BW)',
          'OSPF is classless and supports VLSM and CIDR',
        ],
        tip: 'OSPF Area 0 is the backbone area — all other areas must connect to it. For single-area designs, all routers are in Area 0.',
        where: 'info',
      },
      {
        title: 'Create Two Routers',
        description: 'Use the Topology Builder to create router1 and router2, then link them with a /30 subnet.',
        instructions: [
          'Open the Topology Builder page',
          'Click "🔨 Add Router" and create "router1"',
          'Click "🔨 Add Router" and create "router2"',
          'Click "🔗 Add Link", click router1, then click router2',
          'Set router1 IP: 10.0.12.1/30, router2 IP: 10.0.12.2/30',
        ],
        tip: 'The /30 subnet gives you exactly 2 usable IPs — perfect for point-to-point links.',
        where: 'builder',
      },
      {
        title: 'Configure OSPF on Router1',
        description: 'Enable OSPF process and advertise the connected network into Area 0.',
        instructions: [
          'Right-click router1 → Open CLI Terminal',
          'Enter OSPF configuration to advertise the connected link',
        ],
        commands: [
          'configure terminal',
          'router ospf',
          'network 10.0.12.0/30 area 0',
          'end',
        ],
        tip: 'The "network" command tells OSPF which interfaces to activate on. Any interface matching this prefix will send/receive Hello packets.',
        where: 'cli',
      },
      {
        title: 'Configure OSPF on Router2',
        description: 'Enable OSPF on router2 with the same area.',
        instructions: [
          'Right-click router2 → Open CLI Terminal',
          'Configure OSPF with Area 0',
        ],
        commands: [
          'configure terminal',
          'router ospf',
          'network 10.0.12.0/30 area 0',
          'end',
        ],
        verify: 'After configuring both sides, OSPF will start sending Hello packets and form a neighbor adjacency.',
        where: 'cli',
      },
      {
        title: 'Verify OSPF Neighbors',
        description: 'Check that OSPF has formed a FULL adjacency between router1 and router2.',
        instructions: [
          'On router1, check the OSPF neighbor table',
          'Look for router2 in "FULL" state — this means LSDBs are synchronized',
        ],
        commands: [
          'show ip ospf neighbor',
        ],
        verify: 'You should see one neighbor with State = "Full". The DR/BDR election happens on broadcast segments.',
        tip: 'OSPF states: Down → Init → 2-Way → ExStart → Exchange → Loading → Full. On point-to-point links, it goes directly to Full.',
        where: 'cli',
      },
      {
        title: 'Check OSPF Routes',
        description: 'Verify that OSPF-learned routes appear in the routing table.',
        instructions: [
          'On router1, check the routing table for OSPF routes (marked with "O")',
          'You should see the connected network learned via OSPF',
        ],
        commands: [
          'show ip route ospf',
          'show ip ospf database',
        ],
        verify: 'Routes with "O" prefix are OSPF-learned. The LSDB shows the LSAs exchanged between routers.',
        where: 'cli',
      },
      {
        title: 'Summary',
        description: 'You have successfully configured OSPF in a single Area 0!',
        instructions: [
          '✅ Created two routers with a point-to-point /30 link',
          '✅ Enabled OSPF Area 0 on both routers',
          '✅ Verified FULL neighbor adjacency',
          '✅ Confirmed OSPF routes in the routing table',
          '',
          '📚 Key OSPF concepts learned:',
          '• Hello packets (default every 10s on broadcast, 30s on NBMA)',
          '• LSA exchange and LSDB synchronization',
          '• SPF algorithm computes shortest paths',
          '• Cost metric = reference BW / interface BW',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 13: OSPF Multi-Area ─────────────────────────────────
  {
    id: 'lab-13-ospf-multi-area',
    title: 'Lab 13: OSPF Multi-Area Design',
    description: 'Build a multi-area OSPF network with Area 0 (backbone) and Area 1. Learn ABR (Area Border Router) behavior, inter-area route summarization, and LSA types 1/2/3.',
    difficulty: 'intermediate',
    duration: '30 min',
    icon: '🗺️',
    tags: ['OSPF', 'Multi-Area', 'ABR', 'Area 0', 'Area 1', 'LSA Type 3'],
    objectives: [
      'Design a multi-area OSPF topology with backbone (Area 0) and non-backbone area',
      'Configure an ABR (Area Border Router) connecting Area 0 and Area 1',
      'Understand inter-area routes (O IA) in the routing table',
      'Examine LSA Type 1 (Router), Type 2 (Network), and Type 3 (Summary)',
      'Verify end-to-end reachability across areas',
    ],
    prerequisites: [
      'Completed Lab 12 (OSPF single-area basics)',
      'VM is running with FRR + OVS',
    ],
    topology: `
              Area 0                    Area 1
    ┌──────────┐  10.0.12.0/30  ┌──────────┐  10.0.23.0/30  ┌──────────┐
    │ router1  │───────────────│ router2  │───────────────│ router3  │
    │ .1       │               │ ABR .2/.1│               │ .2       │
    └──────────┘               └──────────┘               └──────────┘
    `,
    steps: [
      {
        title: 'Multi-Area OSPF Concepts',
        description: 'In large networks, a single OSPF area becomes inefficient — every router has the full LSDB and reruns SPF for any topology change. Multi-area OSPF divides the network into areas to limit SPF scope and LSA flooding.',
        instructions: [
          'Area 0 (Backbone) — all areas must connect to Area 0, either directly or via virtual links',
          'ABR (Area Border Router) — a router with interfaces in multiple areas; summarizes routes between areas',
          'LSA Type 1 (Router LSA) — stays within an area, describes a router\'s links',
          'LSA Type 2 (Network LSA) — describes a broadcast segment, generated by the DR',
          'LSA Type 3 (Summary LSA) — generated by the ABR, advertises inter-area prefixes',
        ],
        tip: 'ABRs are the key to multi-area OSPF — they translate between areas by generating Type 3 LSAs.',
        where: 'info',
      },
      {
        title: 'Create Three Routers',
        description: 'Build the topology: router1 (Area 0), router2 (ABR — Area 0 + Area 1), router3 (Area 1).',
        instructions: [
          'Open the Topology Builder',
          'Create router1, router2, router3',
          'Link router1 ↔ router2: IPs 10.0.12.1/30 and 10.0.12.2/30',
          'Link router2 ↔ router3: IPs 10.0.23.1/30 and 10.0.23.2/30',
        ],
        where: 'builder',
      },
      {
        title: 'Configure Router1 (Area 0)',
        description: 'Router1 is fully in the backbone area.',
        instructions: [
          'Open router1 CLI terminal',
          'Configure OSPF with Area 0',
        ],
        commands: [
          'configure terminal',
          'router ospf',
          'network 10.0.12.0/30 area 0',
          'end',
        ],
        where: 'cli',
      },
      {
        title: 'Configure Router2 as ABR',
        description: 'Router2 has one interface in Area 0 and another in Area 1 — making it an ABR.',
        instructions: [
          'Open router2 CLI terminal',
          'Configure OSPF with both areas',
        ],
        commands: [
          'configure terminal',
          'router ospf',
          'network 10.0.12.0/30 area 0',
          'network 10.0.23.0/30 area 1',
          'end',
        ],
        tip: 'Router2 becomes an ABR because it has interfaces in multiple OSPF areas. It will generate Type 3 Summary LSAs.',
        where: 'cli',
      },
      {
        title: 'Configure Router3 (Area 1)',
        description: 'Router3 is fully in Area 1.',
        instructions: [
          'Open router3 CLI terminal',
          'Configure OSPF with Area 1',
        ],
        commands: [
          'configure terminal',
          'router ospf',
          'network 10.0.23.0/30 area 1',
          'end',
        ],
        where: 'cli',
      },
      {
        title: 'Verify ABR and Inter-Area Routes',
        description: 'Check that router2 shows as ABR and inter-area routes are propagated.',
        instructions: [
          'On router1 — check routing table for inter-area OSPF routes (O IA)',
          'On router2 — verify it identifies as ABR',
          'On router3 — check for OSPF routes from Area 0',
        ],
        commands: [
          'show ip route ospf',
          'show ip ospf',
          'show ip ospf database',
        ],
        verify: 'On router1, you should see 10.0.23.0/30 as "O IA" (inter-area). On router2, "show ip ospf" should show "Area Border Router" flag.',
        where: 'cli',
      },
      {
        title: 'Examine LSA Types',
        description: 'Look at the LSDB to understand different LSA types.',
        instructions: [
          'On router1, examine the link-state database',
          'You should see Type 1 (Router LSAs) from Area 0 and Type 3 (Summary LSAs) from the ABR',
        ],
        commands: [
          'show ip ospf database',
          'show ip ospf database summary',
        ],
        tip: 'Type 1 LSAs describe routers within the area. Type 3 LSAs are created by the ABR to advertise prefixes from other areas.',
        where: 'cli',
      },
      {
        title: 'Test End-to-End Connectivity',
        description: 'Verify that router1 (Area 0) can reach router3 (Area 1) through the ABR.',
        instructions: [
          'From router1, ping router3',
        ],
        commands: [
          'ping 10.0.23.2',
        ],
        verify: 'Ping should succeed — traffic crosses from Area 0 → ABR → Area 1.',
        where: 'cli',
      },
      {
        title: 'Summary',
        description: 'You have built a multi-area OSPF network!',
        instructions: [
          '✅ Area 0 (backbone) with router1',
          '✅ ABR (router2) connecting Area 0 and Area 1',
          '✅ Area 1 with router3',
          '✅ Verified inter-area routes (O IA) and LSA types',
          '✅ End-to-end connectivity across areas',
          '',
          '📚 Key concepts:',
          '• ABRs generate Type 3 Summary LSAs for inter-area routing',
          '• Each area has its own LSDB — SPF runs independently per area',
          '• All areas must connect to Area 0 (directly or via virtual links)',
        ],
        where: 'info',
      },
    ],
  },

  // ─── LAB 14: OSPF Stub Area ──────────────────────────────────
  {
    id: 'lab-14-ospf-stub-area',
    title: 'Lab 14: OSPF Stub & Totally Stubby Areas',
    description: 'Configure OSPF stub areas to reduce routing table size at the edge. Learn how stub areas block external LSAs and totally stubby areas also block inter-area summaries, using a default route instead.',
    difficulty: 'intermediate',
    duration: '25 min',
    icon: '🛡️',
    tags: ['OSPF', 'Stub Area', 'Totally Stubby', 'Default Route', 'LSA Filtering'],
    objectives: [
      'Understand why stub areas are used (reduce LSDB size)',
      'Configure a stub area that blocks Type 5 (External) LSAs',
      'Configure a totally stubby area that also blocks Type 3 (Summary) LSAs',
      'Verify that stub routers receive a default route from the ABR',
      'Compare routing tables between normal, stub, and totally stubby areas',
    ],
    prerequisites: [
      'Completed Lab 13 (OSPF multi-area)',
      'VM is running with FRR + OVS',
    ],
    topology: `
              Area 0                    Area 1 (Stub)
    ┌──────────┐  10.0.12.0/30  ┌──────────┐  10.0.23.0/30  ┌──────────┐
    │ router1  │───────────────│ router2  │───────────────│ router3  │
    │ .1       │               │ ABR .2/.1│               │ .2       │
    └──────────┘               └──────────┘               └──────────┘
    `,
    steps: [
      {
        title: 'Why Stub Areas?',
        description: 'In networks receiving many external routes (e.g., from BGP redistribution), edge areas don\'t need to know every external prefix. Stub areas inject a default route instead, dramatically reducing LSDB and routing table size.',
        instructions: [
          'Normal Area — receives all LSA types (1, 2, 3, 4, 5)',
          'Stub Area — blocks Type 4 (ASBR Summary) and Type 5 (External) LSAs. ABR injects default route.',
          'Totally Stubby — blocks Type 3, 4, and 5. Only Type 1, 2, and a single default route remain.',
          'Benefit: smaller routing table, faster SPF, less memory usage',
          'Restriction: No ASBR (external route redistribution) allowed inside a stub area',
        ],
        tip: 'Use stub areas for leaf/branch areas that only need a default route to reach the rest of the network.',
        where: 'info',
      },
      {
        title: 'Set Up the Topology',
        description: 'Create the same 3-router topology from Lab 13 (or reuse if still present).',
        instructions: [
          'Create router1, router2, router3 in the Topology Builder',
          'Link router1 ↔ router2: 10.0.12.1/30 and 10.0.12.2/30',
          'Link router2 ↔ router3: 10.0.23.1/30 and 10.0.23.2/30',
        ],
        where: 'builder',
      },
      {
        title: 'Configure Area 0 (Router1)',
        description: 'Router1 stays in the backbone area as normal.',
        instructions: ['Open router1 CLI and configure OSPF Area 0'],
        commands: [
          'configure terminal',
          'router ospf',
          'network 10.0.12.0/30 area 0',
          'end',
        ],
        where: 'cli',
      },
      {
        title: 'Configure Stub Area on ABR (Router2)',
        description: 'On the ABR, declare Area 1 as a stub area. The ABR will automatically inject a default route into the stub area.',
        instructions: [
          'Open router2 CLI',
          'Configure both areas, with Area 1 as stub',
        ],
        commands: [
          'configure terminal',
          'router ospf',
          'network 10.0.12.0/30 area 0',
          'network 10.0.23.0/30 area 1',
          'area 1 stub',
          'end',
        ],
        tip: 'Both the ABR and all routers inside the stub area must have "area X stub" configured. Mismatched config prevents adjacency!',
        where: 'cli',
      },
      {
        title: 'Configure Stub Area on Router3',
        description: 'Router3 is inside the stub area — it must also declare Area 1 as stub.',
        instructions: ['Open router3 CLI and configure OSPF with stub area'],
        commands: [
          'configure terminal',
          'router ospf',
          'network 10.0.23.0/30 area 1',
          'area 1 stub',
          'end',
        ],
        where: 'cli',
      },
      {
        title: 'Verify Stub Behavior',
        description: 'Check that router3 receives a default route instead of individual external routes.',
        instructions: [
          'On router3, check the routing table',
          'You should see a default route (0.0.0.0/0) learned via OSPF from the ABR',
          'Compare with router1\'s routing table which has all specific routes',
        ],
        commands: [
          'show ip route ospf',
          'show ip ospf database',
        ],
        verify: 'Router3 should show "O*IA 0.0.0.0/0" as a default route from the ABR. No Type 5 LSAs in the LSDB.',
        where: 'cli',
      },
      {
        title: 'Upgrade to Totally Stubby (Optional)',
        description: 'Make Area 1 "totally stubby" — the ABR blocks both external AND inter-area summary LSAs. Only a default route reaches router3.',
        instructions: [
          'On router2 (ABR only), change stub to "no-summary"',
          'Then verify router3\'s routing table is even smaller',
        ],
        commands: [
          'configure terminal',
          'router ospf',
          'area 1 stub no-summary',
          'end',
        ],
        tip: 'The "no-summary" keyword is configured ONLY on the ABR. Routers inside the area keep "area X stub" unchanged.',
        verify: 'Router3 now only has directly connected routes + the default route. No Type 3 Summary LSAs in its LSDB.',
        where: 'cli',
      },
      {
        title: 'Summary',
        description: 'You have configured OSPF stub and totally stubby areas!',
        instructions: [
          '✅ Created a 3-router multi-area topology',
          '✅ Configured Area 1 as a stub area',
          '✅ Verified default route injection by ABR',
          '✅ Upgraded to totally stubby to minimize routing table further',
          '',
          '📚 Key concepts:',
          '• Stub: blocks Type 4 & 5 LSAs, ABR injects default route',
          '• Totally Stubby: also blocks Type 3, only default route remains',
          '• "area X stub" must match on all routers in the area',
          '• "no-summary" is ABR-only keyword for totally stubby',
          '• No ASBRs (external redistribution) allowed in stub areas',
        ],
        where: 'info',
      },
    ],
  },
];

export function getLabById(id: string): Lab | undefined {
  return labs.find((l) => l.id === id);
}
