import client from './client';
import type {
  BGPSummary,
  Event,
  FlowRule,
  HealthResponse,
  MetricsExport,
  MonitoringStats,
  Route,
  SimulatedFailure,
  Switch,
  SystemInfo,
  TokenResponse,
  Topology,
  TrafficPolicy,
  VRFListResponse,
} from '../types';

// --- Auth ---
export const login = (username: string, password: string) =>
  client.post<TokenResponse>('/auth/login', { username, password });

// --- System ---
export const getHealth = () => client.get<HealthResponse>('/health');
export const getSystemInfo = () => client.get<SystemInfo>('/system/info');
export const getSystemMode = () => client.get<{ mode: string }>('/system/mode');
export const setSystemMode = (mode: string) =>
  client.put<{ mode: string }>('/system/mode', { mode });

// --- Routing ---
export const getRoutes = (protocol?: string) =>
  client.get<{ routes: Route[]; total: number }>('/routing/routes', {
    params: protocol ? { protocol } : {},
  });

export const getBGPSummary = () =>
  client.get<BGPSummary>('/routing/bgp/summary');

export const getBGPNeighbors = () =>
  client.get<{ neighbors: BGPSummary['neighbors'] }>('/routing/bgp/neighbors');

export const getOSPFNeighbors = () =>
  client.get<{ neighbors: unknown[] }>('/routing/ospf/neighbors');

// --- SDN ---
export const getFlows = (dpid?: string) =>
  client.get<{ flows: FlowRule[]; total: number }>('/sdn/flows', {
    params: dpid ? { dpid } : {},
  });

export const addFlow = (data: {
  dpid: string;
  priority?: number;
  match: Record<string, unknown>;
  actions: Record<string, unknown>[];
}) => client.post<{ success: boolean; flow_id: string }>('/sdn/flows', data);

export const deleteFlow = (flowId: string) =>
  client.delete<{ message: string }>(`/sdn/flows/${flowId}`);

export const getSwitches = () =>
  client.get<{ switches: Switch[] }>('/switches');

// --- Topology ---
export const getTopology = () => client.get<Topology>('/topology');
export const refreshTopology = () => client.post<Topology>('/topology/refresh');

// --- Monitoring ---
export const getMonitoringStats = () =>
  client.get<MonitoringStats>('/monitoring/stats');

export const getEvents = (level?: string, limit?: number) =>
  client.get<{ events: Event[]; total: number }>('/monitoring/events', {
    params: { ...(level ? { level } : {}), ...(limit ? { limit } : {}) },
  });

// --- VRF (Virtual Routers) ---
export const getVRFs = () => client.get<VRFListResponse>('/vrf');

export const createVRF = (data: { name: string; table_id?: number }) =>
  client.post<{ success: boolean; message: string }>('/vrf', data);

export const deleteVRF = (name: string) =>
  client.delete<{ success: boolean; message: string }>(`/vrf/${name}`);

export const configureVRFBGP = (
  name: string,
  data: { asn: number; router_id?: string; networks: string[] },
) => client.post<{ success: boolean; message: string }>(`/vrf/${name}/bgp`, data);

export const getVRFRoutes = (name: string) =>
  client.get<{ routes: unknown; routes_raw?: string; total: number }>(`/vrf/${name}/routes`);

// --- Topology Builder ---
export const createSwitch = (data: {
  name: string;
  x?: number;
  y?: number;
  protocols?: string;
  controller?: string;
  fail_mode?: string;
}) => client.post<{ success: boolean; message: string; name: string }>('/topology/builder/switches', data);

export const deleteSwitch = (name: string) =>
  client.delete<{ success: boolean; message: string }>(`/topology/builder/switches/${name}`);

export const createHost = (data: {
  name: string;
  ip?: string;
  x?: number;
  y?: number;
  gateway?: string;
}) =>
  client.post<{ success: boolean; message: string; name: string; veth_host: string; veth_ns: string }>(
    '/topology/builder/hosts',
    data,
  );

export const deleteHost = (name: string) =>
  client.delete<{ success: boolean; message: string }>(`/topology/builder/hosts/${name}`);

export const listHosts = () =>
  client.get<{ hosts: { name: string; ip: string }[]; total: number }>('/topology/builder/hosts');

// --- Topology Builder: Routers ---
export const createRouter = (data: {
  name: string;
  x?: number;
  y?: number;
}) =>
  client.post<{ success: boolean; message: string; name: string }>(
    '/topology/builder/routers',
    data,
  );

export const deleteRouter = (name: string) =>
  client.delete<{ success: boolean; message: string }>(`/topology/builder/routers/${name}`);

export const createCloud = (data: { name: string; x?: number; y?: number }) =>
  client.post<{ success: boolean; message: string; name: string }>('/topology/builder/clouds', data);

export const deleteCloud = (name: string) =>
  client.delete<{ success: boolean; message: string }>(`/topology/builder/clouds/${name}`);

export const createLink = (data: {
  source_id: string;
  target_id: string;
  source_name: string;
  target_name: string;
  ip?: string;
  target_ip?: string;
}) =>
  client.post<{ success: boolean; message: string; link_type: string }>(
    '/topology/builder/links',
    data,
  );

export const deleteLink = (sourceName: string, targetName: string) =>
  client.delete<{ success: boolean; message: string }>('/topology/builder/links', {
    params: { source_name: sourceName, target_name: targetName },
  });

export const saveTopologyPositions = (positions: Record<string, { x: number; y: number }>) =>
  client.put<{ success: boolean; updated: number }>('/topology/builder/positions', { positions });

export const clearAllTopology = () =>
  client.delete<{
    success: boolean; message: string;
    removed_bridges: string[]; removed_namespaces: string[]; errors: string[];
  }>('/topology/builder/all');

// --- Network Tools ---
export const toolPing = (data: { source: string; target: string; count?: number; timeout?: number }) =>
  client.post<{
    success: boolean; source: string; target: string; output: string; error: string | null;
    summary: { transmitted?: number; received?: number; loss_pct?: number; rtt_min?: number; rtt_avg?: number; rtt_max?: number };
  }>('/tools/ping', data);

export const toolTraceroute = (data: { source: string; target: string; max_hops?: number; timeout?: number }) =>
  client.post<{
    success: boolean; source: string; target: string; output: string; error: string | null;
    hops: { hop: number; detail: string }[];
  }>('/tools/traceroute', data);

export const toolArp = (data: { source: string }) =>
  client.post<{
    success: boolean; source: string; output: string;
    entries: { ip: string; mac?: string; state: string; interface: string }[];
  }>('/tools/arp', data);

export const toolMac = (data: { bridge: string }) =>
  client.post<{
    success: boolean; bridge: string; output: string; error: string | null;
    entries: { port: string; vlan: string; mac: string; age: string; source?: string }[];
    total: number;
  }>('/tools/mac', data);

export const toolCapture = (data: { source?: string; interface?: string; filter?: string; count?: number; timeout?: number }) =>
  client.post<{
    success: boolean; source: string; interface: string; filter: string;
    output: string; error: string | null;
    packets: {
      raw: string; timestamp?: string; src_mac?: string; dst_mac?: string;
      ethertype?: string; src_ip?: string; dst_ip?: string;
      protocol: string; length?: number; info: string;
    }[];
    total: number;
    summary: { captured?: number; received?: number; dropped?: number };
  }>('/tools/capture', data);

export const toolListHosts = () =>
  client.get<{ hosts: string[] }>('/tools/hosts');

export const toolListBridges = () =>
  client.get<{ bridges: string[] }>('/tools/bridges');

export const toolListInterfaces = (source?: string) =>
  client.get<{
    source: string;
    interfaces: { name: string; state: string; addresses: string[] }[];
  }>('/tools/interfaces', { params: source ? { source } : {} });

// --- Per-Router Config ---
export const getRouterConfig = (name: string) =>
  client.get<{ name: string; config: string }>(`/topology/builder/routers/${name}/config`);

export const getRouterRoutes = (name: string) =>
  client.get<{ name: string; routes: string }>(`/topology/builder/routers/${name}/routes`);

export const addRouterBGPNeighbor = (name: string, data: { neighbor_ip: string; remote_as: number }) =>
  client.post<{ success: boolean; message: string }>(`/topology/builder/routers/${name}/bgp/neighbor`, data);

export const deleteRouterBGPNeighbor = (name: string, ip: string) =>
  client.delete<{ success: boolean; message: string }>(`/topology/builder/routers/${name}/bgp/neighbor/${ip}`);

export const addRouterOSPF = (name: string, data: { network: string; area?: string }) =>
  client.post<{ success: boolean; message: string }>(`/topology/builder/routers/${name}/ospf`, data);

// --- Topology Presets ---
export const listPresets = () =>
  client.get<{ presets: { name: string; description: string; node_count: number; link_count: number; saved_at: string }[] }>('/topology/builder/presets');

export const savePreset = (data: { name: string; description?: string }) =>
  client.post<{ success: boolean; message: string }>('/topology/builder/presets', data);

export const deletePreset = (name: string) =>
  client.delete<{ success: boolean; message: string }>(`/topology/builder/presets/${name}`);

export const getPreset = (name: string) =>
  client.get<{ description: string; nodes: any[]; links: any[]; saved_at: string }>(`/topology/builder/presets/${name}`);

// --- Auth: User Management + RBAC ---
export const getMe = () =>
  client.get<{ username: string; role: string; display_name: string }>('/auth/me');

export const getUsers = () =>
  client.get<{ users: { username: string; role: string; display_name: string }[] }>('/auth/users');

export const createUserApi = (data: { username: string; password: string; role?: string; display_name?: string }) =>
  client.post<{ success: boolean; user: { username: string; role: string; display_name: string } }>('/auth/users', data);

export const updateUserApi = (username: string, data: { role?: string; password?: string; display_name?: string }) =>
  client.put<{ success: boolean; user: { username: string; role: string; display_name: string } }>(`/auth/users/${username}`, data);

export const deleteUserApi = (username: string) =>
  client.delete<{ success: boolean; message: string }>(`/auth/users/${username}`);

// --- Audit Log ---
export const getAuditLogs = (params?: { limit?: number; offset?: number; user?: string; action?: string; resource?: string }) =>
  client.get<{ entries: { id: number; timestamp: string; user: string; role: string; action: string; resource: string; detail: string; ip: string }[]; total: number }>('/audit/logs', { params });

export const clearAuditLogs = () =>
  client.delete<{ success: boolean; cleared: number }>('/audit/logs');

// --- Advanced: Failure Simulation ---
export const getActiveFailures = () =>
  client.get<{ failures: SimulatedFailure[]; total: number }>('/simulate/failures');

export const simulateLinkDown = (link_id: string) =>
  client.post<{ success: boolean; message?: string; error?: string; failure?: SimulatedFailure; active_failures: SimulatedFailure[] }>(
    '/simulate/link-down', { link_id },
  );

export const simulateNodeFailure = (node_id: string) =>
  client.post<{ success: boolean; message?: string; error?: string; failure?: SimulatedFailure; active_failures: SimulatedFailure[] }>(
    '/simulate/node-failure', { node_id },
  );

export const restoreAllFailures = () =>
  client.post<{ success: boolean; message: string; restored: number; errors: string[] }>(
    '/simulate/restore',
  );

export const restoreOneFailure = (target_id: string) =>
  client.post<{ success: boolean; message?: string; error?: string }>(`/simulate/restore/${target_id}`);

// --- Advanced: Traffic Engineering ---
export const getTrafficPolicies = () =>
  client.get<{ policies: TrafficPolicy[]; total: number }>('/traffic/policies');

export const createTrafficPolicy = (data: {
  name: string; description?: string;
  match?: Record<string, unknown>; action?: Record<string, unknown>;
  priority?: number;
}) => client.post<{ success: boolean; message: string; policy: TrafficPolicy }>('/traffic/policies', data);

export const updateTrafficPolicy = (id: string, data: Record<string, unknown>) =>
  client.put<{ success: boolean; message: string; policy: TrafficPolicy }>(`/traffic/policies/${id}`, data);

export const deleteTrafficPolicy = (id: string) =>
  client.delete<{ success: boolean; message: string }>(`/traffic/policies/${id}`);

export const toggleTrafficPolicy = (id: string) =>
  client.post<{ success: boolean; message: string; policy: TrafficPolicy }>(`/traffic/policies/${id}/toggle`);

// --- Advanced: Metrics Export ---
export const getMetricsJson = () =>
  client.get<MetricsExport>('/metrics/export');

export const getMetricsPrometheus = () =>
  client.get<string>('/metrics/prometheus', { responseType: 'text' as any });
