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
