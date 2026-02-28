/** Shared TypeScript types for the platform. */

// --- Common ---
export interface HealthResponse {
  status: string;
  components: {
    api: string;
    frr: string;
    ryu: string;
    ovs: string;
  };
  timestamp: string;
}

export interface SystemInfo {
  version: string;
  mode: 'dc' | 'wan';
  uptime: number;
  hostname: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  role: string;
}

// --- Routing ---
export interface Route {
  destination: string;
  next_hop: string;
  protocol: string;
  metric: number;
  interface: string;
  uptime: string;
  selected: boolean;
  fib: boolean;
}

export interface BGPNeighbor {
  neighbor: string;
  remote_as: number;
  description: string;
  state: string;
  uptime: string;
  prefixes_received: number;
  prefixes_sent: number;
}

export interface BGPSummary {
  local_as: number;
  router_id: string;
  total_neighbors: number;
  established: number;
  neighbors: BGPNeighbor[];
}

export interface OSPFNeighbor {
  neighbor_id: string;
  priority: number;
  state: string;
  address: string;
  interface: string;
  dead_time: string;
}

// --- SDN ---
export interface FlowRule {
  id: string;
  dpid: string;
  table_id: number;
  priority: number;
  match: Record<string, unknown>;
  actions: Record<string, unknown>[];
  packet_count: number;
  byte_count: number;
  idle_timeout: number;
  hard_timeout: number;
}

export interface Switch {
  dpid: string;
  name: string;
  connected: boolean;
  controller: string;
  ports: SwitchPort[];
}

export interface SwitchPort {
  port_no: number;
  name: string;
  hw_addr: string;
  state: string;
}

// --- Topology ---
export interface TopologyNode {
  id: string;
  type: 'switch' | 'router' | 'host' | 'network' | 'cloud';
  name: string;
  dpid: string | null;
  metadata: Record<string, unknown>;
}

export interface TopologyLink {
  id: string;
  source: string;
  target: string;
  source_port: string;
  target_port: string;
  bandwidth: number | null;
  status: 'up' | 'down';
}

export interface Topology {
  nodes: TopologyNode[];
  links: TopologyLink[];
  timestamp: string;
}

// --- Monitoring ---
export interface MonitoringStats {
  cpu_usage: number;
  memory_usage: number;
  uptime: number;
  api_requests_total: number;
  components: {
    frr: { bgp_neighbors: number; ospf_neighbors: number; total_routes: number };
    ovs: { bridges: number; flows: number };
    ryu: { switches: number; controllers: number };
  };
}

export interface Event {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  component: string;
  message: string;
}

// --- VRF (Virtual Routers) ---
export interface VRFInfo {
  name: string;
  table_id: number | null;
  interfaces: string[];
  routes: number;
  state: string;
}

export interface VRFListResponse {
  vrfs: VRFInfo[];
  total: number;
}

// --- Advanced (Phase 3) ---
export interface SimulatedFailure {
  target_type: 'link' | 'node';
  target_id: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface TrafficPolicy {
  id: string;
  name: string;
  description: string;
  match: Record<string, unknown>;
  action: Record<string, unknown>;
  priority: number;
  enabled: boolean;
  hit_count: number;
  created_at: string;
  updated_at: string;
}

export interface MetricsExport {
  format: string;
  timestamp: string;
  system: {
    version: string;
    mode: string;
    hostname: string;
    uptime_seconds: number;
  };
  health: Record<string, string>;
  resources: {
    cpu_usage_percent: number;
    memory_usage_percent: number;
  };
  networking: {
    frr: Record<string, number>;
    ovs: Record<string, number>;
    ryu: Record<string, number>;
  };
  api: {
    requests_total: number;
  };
}
