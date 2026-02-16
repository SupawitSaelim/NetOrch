import client from './client';
import type {
  BGPSummary,
  Event,
  FlowRule,
  HealthResponse,
  MonitoringStats,
  Route,
  Switch,
  SystemInfo,
  TokenResponse,
  Topology,
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

export const toolListHosts = () =>
  client.get<{ hosts: string[] }>('/tools/hosts');
