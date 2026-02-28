import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  getActiveFailures,
  simulateLinkDown,
  simulateNodeFailure,
  restoreAllFailures,
  restoreOneFailure,
  getTrafficPolicies,
  createTrafficPolicy,
  deleteTrafficPolicy,
  toggleTrafficPolicy,
  getMetricsJson,
  getMetricsPrometheus,
} from '../../api/endpoints';
import { ErrorBanner, EmptyState } from '../../components/Shared';
import type { SimulatedFailure, TrafficPolicy } from '../../types';

/* ───────── Tab types ───────── */
type Tab = 'failures' | 'traffic' | 'metrics';

export default function AdvancedPage() {
  const [activeTab, setActiveTab] = useState<Tab>('failures');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'failures', label: 'Failure Simulation', icon: '💥' },
    { id: 'traffic', label: 'Traffic Engineering', icon: '🚦' },
    { id: 'metrics', label: 'Metrics Export', icon: '📊' },
  ];

  return (
    <div className="fade-in" style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>⚡ Advanced Features</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 20 }}>
        Phase 3 — Failure simulation, traffic engineering, and metrics export
      </p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--color-border)', paddingBottom: 4 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: activeTab === t.id ? 600 : 400,
              color: activeTab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              background: activeTab === t.id ? 'rgba(59,130,246,0.1)' : 'transparent',
              borderBottom: activeTab === t.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'failures' && <FailureSimulationPanel />}
      {activeTab === 'traffic' && <TrafficEngineeringPanel />}
      {activeTab === 'metrics' && <MetricsPanel />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Failure Simulation Panel
   ═══════════════════════════════════════════════════════════════ */

function FailureSimulationPanel() {
  const qc = useQueryClient();
  const [linkId, setLinkId] = useState('');
  const [nodeId, setNodeId] = useState('');

  const failures = useQuery({
    queryKey: ['active-failures'],
    queryFn: () => getActiveFailures().then((r) => r.data),
    refetchInterval: 10_000,
  });

  const linkDown = useMutation({
    mutationFn: (id: string) => simulateLinkDown(id).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['active-failures'] }); setLinkId(''); },
  });

  const nodeFail = useMutation({
    mutationFn: (id: string) => simulateNodeFailure(id).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['active-failures'] }); setNodeId(''); },
  });

  const restoreAll = useMutation({
    mutationFn: () => restoreAllFailures().then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['active-failures'] }),
  });

  const restoreOne = useMutation({
    mutationFn: (id: string) => restoreOneFailure(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['active-failures'] }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Link Down */}
        <div className="card" style={{ padding: 20, background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>🔗 Simulate Link Down</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Bring down a specific veth/port to test failover behavior
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Port name (e.g. veth-sw1-h1)"
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              style={inputStyle}
            />
            <button
              onClick={() => linkId && linkDown.mutate(linkId)}
              disabled={!linkId || linkDown.isPending}
              style={btnDanger}
            >
              {linkDown.isPending ? 'Simulating...' : 'Link Down'}
            </button>
          </div>
          {linkDown.isError && <p style={errText}>Failed: {(linkDown.error as any)?.response?.data?.detail || 'Error'}</p>}
        </div>

        {/* Node Failure */}
        <div className="card" style={{ padding: 20, background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>🖥️ Simulate Node Failure</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Isolate a switch (bridge) or host/router (namespace)
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Node name (e.g. sw1, h1)"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              style={inputStyle}
            />
            <button
              onClick={() => nodeId && nodeFail.mutate(nodeId)}
              disabled={!nodeId || nodeFail.isPending}
              style={btnDanger}
            >
              {nodeFail.isPending ? 'Simulating...' : 'Node Fail'}
            </button>
          </div>
          {nodeFail.isError && <p style={errText}>Failed: {(nodeFail.error as any)?.response?.data?.detail || 'Error'}</p>}
        </div>
      </div>

      {/* Active failures */}
      <div className="card" style={{ padding: 20, background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>
            🚨 Active Failures
            {failures.data?.total ? <span style={{ color: '#ef4444', marginLeft: 8 }}>({failures.data.total})</span> : null}
          </h3>
          <button
            onClick={() => restoreAll.mutate()}
            disabled={!failures.data?.total || restoreAll.isPending}
            style={btnPrimary}
          >
            {restoreAll.isPending ? 'Restoring...' : '🔄 Restore All'}
          </button>
        </div>

        {failures.isError && <ErrorBanner message="Failed to load active failures" />}

        {!failures.data?.total ? (
          <EmptyState icon="✅" title="No active failures" description="All links and nodes are operating normally" />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Target</th>
                <th style={thStyle}>Details</th>
                <th style={thStyle}>Since</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {failures.data.failures.map((f: SimulatedFailure) => (
                <tr key={`${f.target_type}-${f.target_id}`}>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: f.target_type === 'link' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                      color: f.target_type === 'link' ? '#f59e0b' : '#ef4444',
                    }}>
                      {f.target_type === 'link' ? '🔗 Link' : '🖥️ Node'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>{f.target_id}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {String(f.details.action ?? '')} {f.details.type ? `(${String(f.details.type)})` : ''}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{new Date(f.timestamp).toLocaleTimeString()}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => restoreOne.mutate(f.target_id)}
                      disabled={restoreOne.isPending}
                      style={{ ...btnSmall, color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Traffic Engineering Panel
   ═══════════════════════════════════════════════════════════════ */

function TrafficEngineeringPanel() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', priority: 100, src_ip: '', dst_ip: '', protocol: '', actionType: 'forward', output_port: '' });

  const policies = useQuery({
    queryKey: ['traffic-policies'],
    queryFn: () => getTrafficPolicies().then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () => createTrafficPolicy({
      name: form.name,
      description: form.description,
      match: {
        ...(form.src_ip ? { src_ip: form.src_ip } : {}),
        ...(form.dst_ip ? { dst_ip: form.dst_ip } : {}),
        ...(form.protocol ? { protocol: form.protocol } : {}),
      },
      action: {
        type: form.actionType,
        ...(form.output_port ? { output_port: parseInt(form.output_port) } : {}),
      },
      priority: form.priority,
    }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traffic-policies'] });
      setShowForm(false);
      setForm({ name: '', description: '', priority: 100, src_ip: '', dst_ip: '', protocol: '', actionType: 'forward', output_port: '' });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteTrafficPolicy(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traffic-policies'] }),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => toggleTrafficPolicy(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traffic-policies'] }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Traffic Policies</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Define match conditions and actions for traffic engineering via OVS flow rules
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          {showForm ? 'Cancel' : '+ New Policy'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card" style={{ padding: 20, background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Create Traffic Policy</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input placeholder="Policy name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} />
            <input placeholder="Source IP (e.g. 10.0.0.0/24)" value={form.src_ip} onChange={(e) => setForm({ ...form, src_ip: e.target.value })} style={inputStyle} />
            <input placeholder="Destination IP (e.g. 10.0.1.0/24)" value={form.dst_ip} onChange={(e) => setForm({ ...form, dst_ip: e.target.value })} style={inputStyle} />
            <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} style={inputStyle}>
              <option value="">Any protocol</option>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
              <option value="icmp">ICMP</option>
            </select>
            <select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })} style={inputStyle}>
              <option value="forward">Forward</option>
              <option value="drop">Drop</option>
              <option value="qos">QoS</option>
              <option value="mirror">Mirror</option>
            </select>
            {form.actionType === 'forward' && (
              <input placeholder="Output port number" value={form.output_port} onChange={(e) => setForm({ ...form, output_port: e.target.value })} style={inputStyle} />
            )}
            <input type="number" placeholder="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 100 })} style={inputStyle} />
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={() => form.name && create.mutate()} disabled={!form.name || create.isPending} style={btnPrimary}>
              {create.isPending ? 'Creating...' : 'Create Policy'}
            </button>
          </div>
          {create.isError && <p style={errText}>Failed to create policy</p>}
        </div>
      )}

      {/* Policy list */}
      <div className="card" style={{ padding: 20, background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
        {policies.isError && <ErrorBanner message="Failed to load policies" />}

        {!policies.data?.total ? (
          <EmptyState icon="🚦" title="No traffic policies" description="Create a policy to start engineering traffic paths" />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Match</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.data.policies.map((p: TrafficPolicy) => (
                <tr key={p.id}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{p.description}</div>}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{p.priority}</td>
                  <td style={{ ...tdStyle, fontSize: 12, fontFamily: 'monospace' }}>
                    {Object.entries(p.match).map(([k, v]) => `${k}=${v}`).join(', ') || 'any'}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, fontFamily: 'monospace' }}>
                    {p.action.type as string}{p.action.output_port ? `:${p.action.output_port}` : ''}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: p.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)',
                      color: p.enabled ? '#22c55e' : '#94a3b8',
                    }}>
                      {p.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => toggle.mutate(p.id)} style={{ ...btnSmall, color: p.enabled ? '#f59e0b' : '#22c55e' }}>
                        {p.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => del.mutate(p.id)} style={{ ...btnSmall, color: '#ef4444' }}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Metrics Export Panel
   ═══════════════════════════════════════════════════════════════ */

function MetricsPanel() {
  const [format, setFormat] = useState<'json' | 'prometheus'>('json');

  const jsonMetrics = useQuery({
    queryKey: ['metrics-json'],
    queryFn: () => getMetricsJson().then((r) => r.data),
    refetchInterval: 15_000,
    enabled: format === 'json',
  });

  const promMetrics = useQuery({
    queryKey: ['metrics-prometheus'],
    queryFn: () => getMetricsPrometheus().then((r) => r.data),
    refetchInterval: 15_000,
    enabled: format === 'prometheus',
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Format toggle */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Format:</span>
        <button
          onClick={() => setFormat('json')}
          style={{ ...btnSmall, fontWeight: format === 'json' ? 700 : 400, color: format === 'json' ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
        >
          JSON
        </button>
        <button
          onClick={() => setFormat('prometheus')}
          style={{ ...btnSmall, fontWeight: format === 'prometheus' ? 700 : 400, color: format === 'prometheus' ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
        >
          Prometheus
        </button>
      </div>

      {format === 'json' && jsonMetrics.data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <MetricCard label="CPU Usage" value={`${jsonMetrics.data.resources.cpu_usage_percent.toFixed(1)}%`} color="#3b82f6" />
            <MetricCard label="Memory" value={`${jsonMetrics.data.resources.memory_usage_percent.toFixed(1)}%`} color="#a78bfa" />
            <MetricCard label="Uptime" value={formatUptime(jsonMetrics.data.system.uptime_seconds)} color="#22c55e" />
            <MetricCard label="API Requests" value={jsonMetrics.data.api.requests_total.toString()} color="#f59e0b" />
          </div>

          {/* Networking metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="card" style={{ padding: 16, background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#3b82f6' }}>FRR</h4>
              {Object.entries(jsonMetrics.data.networking.frr).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{k.replace(/_/g, ' ')}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: 16, background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#a78bfa' }}>OVS</h4>
              {Object.entries(jsonMetrics.data.networking.ovs).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{k.replace(/_/g, ' ')}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: 16, background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#f59e0b' }}>Ryu / SDN</h4>
              {Object.entries(jsonMetrics.data.networking.ryu).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{k.replace(/_/g, ' ')}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Raw JSON */}
          <div className="card" style={{ padding: 16, background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600 }}>Raw JSON</h4>
              <button onClick={() => copyToClipboard(JSON.stringify(jsonMetrics.data, null, 2))} style={btnSmall}>📋 Copy</button>
            </div>
            <pre style={preStyle}>{JSON.stringify(jsonMetrics.data, null, 2)}</pre>
          </div>
        </div>
      )}

      {format === 'prometheus' && (
        <div className="card" style={{ padding: 16, background: 'var(--color-bg-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 600 }}>Prometheus Exposition Format</h4>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                Scrape endpoint: <code style={{ background: 'rgba(148,163,184,0.1)', padding: '2px 6px', borderRadius: 4 }}>/api/v1/metrics/prometheus</code>
              </p>
            </div>
            {promMetrics.data && (
              <button onClick={() => copyToClipboard(promMetrics.data as string)} style={btnSmall}>📋 Copy</button>
            )}
          </div>
          {promMetrics.isError && <ErrorBanner message="Failed to load Prometheus metrics" />}
          {promMetrics.data && <pre style={preStyle}>{promMetrics.data}</pre>}
        </div>
      )}

      {(format === 'json' && jsonMetrics.isError) && <ErrorBanner message="Failed to load metrics" />}
    </div>
  );
}

/* ───────── Helper components ───────── */

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card" style={{
      padding: 16, background: 'var(--color-bg-card)', borderRadius: 12,
      border: '1px solid var(--color-border)', textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* ───────── Shared styles ───────── */

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: 13,
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--color-primary)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const btnDanger: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid rgba(239,68,68,0.3)',
  background: 'rgba(239,68,68,0.1)',
  color: '#ef4444',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const btnSmall: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'transparent',
  fontSize: 12,
  cursor: 'pointer',
  color: 'var(--color-text-muted)',
};

const errText: React.CSSProperties = {
  color: '#ef4444',
  fontSize: 12,
  marginTop: 8,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '1px solid var(--color-border)',
  color: 'var(--color-text-muted)',
  fontSize: 12,
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(148,163,184,0.08)',
};

const preStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.2)',
  padding: 16,
  borderRadius: 8,
  fontSize: 12,
  fontFamily: 'monospace',
  overflow: 'auto',
  maxHeight: 400,
  whiteSpace: 'pre-wrap',
  color: 'var(--color-text)',
};
