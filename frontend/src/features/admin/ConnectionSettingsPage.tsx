import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getConnectionSettings,
  updateConnectionSettings,
  testConnection,
  testCustomConnection,
  detectVmIp,
  getServicesStatus,
  serviceAction,
} from '../../api/endpoints';
import { ErrorBanner } from '../../components/Shared';
import { useState, useEffect } from 'react';
import type { ConnectionSettings, ConnectionTestResult } from '../../types';

/* ── Status Badge ── */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string; label: string }> = {
    connected: { bg: '#22c55e20', fg: '#22c55e', label: '● Connected' },
    available: { bg: '#22c55e20', fg: '#22c55e', label: '● Available' },
    failed: { bg: '#ef444420', fg: '#ef4444', label: '✗ Failed' },
    unreachable: { bg: '#ef444420', fg: '#ef4444', label: '✗ Unreachable' },
    unavailable: { bg: '#f59e0b20', fg: '#f59e0b', label: '⚠ Unavailable' },
    timeout: { bg: '#f59e0b20', fg: '#f59e0b', label: '⏱ Timeout' },
    error: { bg: '#ef444420', fg: '#ef4444', label: '✗ Error' },
    disabled: { bg: '#94a3b820', fg: '#94a3b8', label: '○ Disabled' },
  };
  const c = colors[status] ?? { bg: '#94a3b820', fg: '#94a3b8', label: status };
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '3px 12px',
        borderRadius: 10,
        background: c.bg,
        color: c.fg,
        display: 'inline-block',
      }}
    >
      {c.label}
    </span>
  );
}

/* ── Test Results Panel ── */
function TestResultsPanel({ results, loading, onStartService }: {
  results: ConnectionTestResult | null;
  loading: boolean;
  onStartService?: (service: string) => void;
}) {
  if (loading) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Testing connections...</div>
      </div>
    );
  }
  if (!results) return null;

  const items = [
    { label: 'SSH Connection', icon: '🔑', data: results.ssh, service: null },
    { label: 'Ryu SDN Controller', icon: '📡', data: results.ryu, service: 'ryu' },
    { label: 'FRRouting (FRR)', icon: '🛣️', data: results.frr, service: 'frr' },
    { label: 'Open vSwitch (OVS)', icon: '🔀', data: results.ovs, service: 'ovs' },
  ];

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>🧪 Connection Test Results</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {items.map((item) => {
          const isFailed = ['failed', 'unreachable', 'error', 'timeout', 'unavailable'].includes(item.data.status);
          return (
            <div
              key={item.label}
              style={{
                padding: 14,
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {item.icon} {item.label}
                </span>
                <StatusBadge status={item.data.status} />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  wordBreak: 'break-all',
                  lineHeight: 1.5,
                }}
              >
                {item.data.message}
              </div>
              {isFailed && item.service && onStartService && (
                <button
                  onClick={() => onStartService(item.service!)}
                  style={{
                    marginTop: 8,
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: '1px solid #22c55e44',
                    background: '#22c55e20',
                    color: '#22c55e',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  ▶ Start {item.service.toUpperCase()}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Service Control Panel ── */
function ServiceControlPanel() {
  const qc = useQueryClient();
  const [actionLog, setActionLog] = useState<{ service: string; action: string; message: string; ok: boolean }[]>([]);

  const statusQuery = useQuery({
    queryKey: ['services-status'],
    queryFn: () => getServicesStatus().then((r) => r.data),
    refetchInterval: 15_000,
  });

  const actionMut = useMutation({
    mutationFn: ({ service, action }: { service: string; action: string }) =>
      serviceAction(service, action).then((r) => r.data),
    onSuccess: (data) => {
      setActionLog((prev) => [
        { service: data.service, action: data.action, message: data.message, ok: data.success },
        ...prev.slice(0, 9),
      ]);
      // Refresh status after action
      setTimeout(() => qc.invalidateQueries({ queryKey: ['services-status'] }), 1000);
    },
    onError: (err: any) => {
      setActionLog((prev) => [
        { service: '?', action: 'error', message: err?.response?.data?.detail ?? String(err), ok: false },
        ...prev.slice(0, 9),
      ]);
    },
  });

  const services = statusQuery.data?.services;
  const pendingService = actionMut.isPending ? (actionMut.variables as any)?.service : null;
  const pendingAction = actionMut.isPending ? (actionMut.variables as any)?.action : null;

  const serviceList = [
    { key: 'frr', label: 'FRRouting (FRR)', icon: '🛣️', description: 'BGP, OSPF, static routing daemon' },
    { key: 'ryu', label: 'Ryu/Osken Controller', icon: '📡', description: 'SDN OpenFlow controller' },
    { key: 'ovs', label: 'Open vSwitch', icon: '🔀', description: 'Virtual switch (ovsdb + vswitchd)' },
  ];

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>🖥️ Service Control</h3>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['services-status'] })}
          disabled={statusQuery.isFetching}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
            color: 'var(--color-text-muted)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {statusQuery.isFetching ? '⏳ Refreshing...' : '🔄 Refresh Status'}
        </button>
      </div>

      {statusQuery.isError && (
        <ErrorBanner message="Failed to get service status. SSH connection may be down." />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {serviceList.map((svc) => {
          const info = services?.[svc.key as keyof typeof services];
          const isRunning = info?.status === 'running';
          const isPending = pendingService === svc.key;
          const statusColor = isRunning ? '#22c55e' : info ? '#ef4444' : '#94a3b8';

          return (
            <div
              key={svc.key}
              style={{
                padding: 16,
                borderRadius: 10,
                border: `1px solid ${isRunning ? '#22c55e33' : 'var(--color-border)'}`,
                background: isRunning ? '#22c55e08' : 'var(--color-bg)',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  {svc.icon} {svc.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 10px',
                    borderRadius: 10,
                    background: statusColor + '20',
                    color: statusColor,
                  }}
                >
                  {info ? (isRunning ? '● Running' : '○ Stopped') : '…'}
                </span>
              </div>

              {/* Description / Message */}
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                {info?.message || svc.description}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {!isRunning && (
                  <ServiceButton
                    label={isPending && pendingAction === 'start' ? '⏳ Starting...' : '▶ Start'}
                    color="#22c55e"
                    disabled={isPending}
                    onClick={() => actionMut.mutate({ service: svc.key, action: 'start' })}
                  />
                )}
                {isRunning && (
                  <>
                    <ServiceButton
                      label={isPending && pendingAction === 'restart' ? '⏳ Restarting...' : '🔄 Restart'}
                      color="#f59e0b"
                      disabled={isPending}
                      onClick={() => actionMut.mutate({ service: svc.key, action: 'restart' })}
                    />
                    <ServiceButton
                      label={isPending && pendingAction === 'stop' ? '⏳ Stopping...' : '⏹ Stop'}
                      color="#ef4444"
                      disabled={isPending}
                      onClick={() => actionMut.mutate({ service: svc.key, action: 'stop' })}
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Log */}
      {actionLog.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
            Recent Actions
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 12 }}>
            {actionLog.map((log, i) => (
              <div
                key={i}
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  marginBottom: 2,
                  background: log.ok ? '#22c55e08' : '#ef444408',
                  color: log.ok ? '#22c55e' : '#ef4444',
                  fontFamily: 'monospace',
                  fontSize: 11,
                }}
              >
                {log.ok ? '✓' : '✗'} {log.service}.{log.action}: {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceButton({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 14px',
        borderRadius: 6,
        border: `1px solid ${color}44`,
        background: `${color}15`,
        color: color,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

/* ── Main Page ── */
export default function ConnectionSettingsPage() {
  const qc = useQueryClient();

  const settings = useQuery({
    queryKey: ['connection-settings'],
    queryFn: () => getConnectionSettings().then((r) => r.data),
  });

  // Form state
  const [form, setForm] = useState<Partial<ConnectionSettings>>({});
  const [testResults, setTestResults] = useState<ConnectionTestResult | null>(null);
  const [dirty, setDirty] = useState(false);

  // Sync form with loaded settings
  useEffect(() => {
    if (settings.data) {
      setForm(settings.data);
    }
  }, [settings.data]);

  const updateField = (key: keyof ConnectionSettings, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  // Mutations
  const saveMut = useMutation({
    mutationFn: () => updateConnectionSettings(form).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connection-settings'] });
      setDirty(false);
    },
  });

  const testMut = useMutation({
    mutationFn: () => {
      // If form is dirty, test with custom (unsaved) settings
      if (dirty) {
        return testCustomConnection(form).then((r) => r.data);
      }
      return testConnection().then((r) => r.data);
    },
    onSuccess: (data) => setTestResults(data),
  });

  const detectMut = useMutation({
    mutationFn: () => detectVmIp().then((r) => r.data),
    onSuccess: (data) => {
      if (data.detected_ip) {
        setForm((prev) => ({
          ...prev,
          vm_host: data.detected_ip!,
          ryu_url: prev.ryu_url?.replace(/\/\/[^:]+/, `//${data.detected_ip}`) ?? `http://${data.detected_ip}:8080`,
        }));
        setDirty(true);
      }
    },
  });

  const allConnected =
    testResults &&
    testResults.ssh.status === 'connected' &&
    (testResults.ryu.status === 'connected' || testResults.ryu.status === 'disabled') &&
    (testResults.frr.status === 'available' || testResults.frr.status === 'disabled') &&
    (testResults.ovs.status === 'available' || testResults.ovs.status === 'disabled');

  // Quick-start a service from test results and re-test
  const quickStartMut = useMutation({
    mutationFn: async (svcName: string) => {
      await serviceAction(svcName, 'start');
      // Wait a moment for service to boot, then re-test
      await new Promise((r) => setTimeout(r, 2000));
      const res = await testConnection();
      return res.data;
    },
    onSuccess: (data) => {
      setTestResults(data);
      qc.invalidateQueries({ queryKey: ['services-status'] });
    },
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>⚙️ Connection Settings</h2>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Configure and test the connection to your network VM (FRRouter, OVS, Ryu)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => detectMut.mutate()}
            disabled={detectMut.isPending}
            style={{
              ...btnStyle,
              background: '#8b5cf620',
              color: '#8b5cf6',
              borderColor: '#8b5cf644',
            }}
          >
            {detectMut.isPending ? '🔍 Scanning...' : '🔍 Auto-Detect IP'}
          </button>
          <button
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
            style={{
              ...btnStyle,
              background: '#3b82f620',
              color: '#3b82f6',
              borderColor: '#3b82f644',
            }}
          >
            {testMut.isPending ? '⏳ Testing...' : '🧪 Test Connection'}
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !dirty}
            style={{
              ...btnStyle,
              background: dirty ? '#22c55e' : '#22c55e40',
              color: dirty ? '#fff' : '#22c55e',
              borderColor: '#22c55e44',
              opacity: dirty ? 1 : 0.5,
            }}
          >
            {saveMut.isPending ? '💾 Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </div>

      {/* Success / Error banners */}
      {saveMut.isSuccess && (
        <div style={{ ...bannerStyle, background: '#22c55e15', borderColor: '#22c55e44', color: '#22c55e' }}>
          ✅ Settings saved successfully! The backend will use the new configuration.
        </div>
      )}
      {saveMut.isError && (
        <ErrorBanner
          message={
            (saveMut.error as any)?.response?.data?.detail ?? 'Failed to save settings. Make sure you have admin access.'
          }
        />
      )}
      {detectMut.isSuccess && detectMut.data?.detected_ip && (
        <div style={{ ...bannerStyle, background: '#8b5cf615', borderColor: '#8b5cf644', color: '#8b5cf6' }}>
          🎯 Detected VM at <strong>{detectMut.data.detected_ip}</strong> (method: {detectMut.data.method}). IP
          has been filled in — click &quot;Save Settings&quot; to apply.
        </div>
      )}
      {detectMut.isSuccess && !detectMut.data?.detected_ip && (
        <div style={{ ...bannerStyle, background: '#f59e0b15', borderColor: '#f59e0b44', color: '#f59e0b' }}>
          ⚠️ Could not auto-detect VM IP. Found {detectMut.data?.candidates.length ?? 0} candidate(s) but none passed SSH
          test. Please enter the IP manually.
        </div>
      )}

      {/* Settings Form */}
      {settings.isLoading ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
          Loading settings...
        </div>
      ) : settings.isError ? (
        <ErrorBanner message="Failed to load settings. You may not have authentication." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
          {/* VM Connection Card */}
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>🖥️ VM Connection (SSH)</h3>
            <div style={fieldGroupStyle}>
              <div>
                <label style={labelStyle}>Host IP Address</label>
                <input
                  value={form.vm_host ?? ''}
                  onChange={(e) => updateField('vm_host', e.target.value)}
                  placeholder="192.168.64.3"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>SSH Username</label>
                <input
                  value={form.vm_user ?? ''}
                  onChange={(e) => updateField('vm_user', e.target.value)}
                  placeholder="root"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>SSH Key Path</label>
                <input
                  value={form.vm_ssh_key ?? ''}
                  onChange={(e) => updateField('vm_ssh_key', e.target.value)}
                  placeholder="~/.ssh/id_ed25519"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* SDN Controller Card */}
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>📡 SDN Controller (Ryu/Osken)</h3>
            <div style={fieldGroupStyle}>
              <div>
                <label style={labelStyle}>Ryu REST API URL</label>
                <input
                  value={form.ryu_url ?? ''}
                  onChange={(e) => updateField('ryu_url', e.target.value)}
                  placeholder="http://192.168.64.3:8080"
                  style={inputStyle}
                />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  💡 Usually http://&lt;VM_IP&gt;:8080
                </div>
              </div>
            </div>

            {/* Feature Toggles */}
            <h4 style={{ margin: '20px 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>
              Service Toggles
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ToggleSwitch
                label="FRRouting (FRR)"
                description="BGP, OSPF, static routing"
                checked={form.frr_enabled ?? false}
                onChange={(v) => updateField('frr_enabled', v)}
              />
              <ToggleSwitch
                label="Ryu SDN Controller"
                description="OpenFlow flow management"
                checked={form.ryu_enabled ?? false}
                onChange={(v) => updateField('ryu_enabled', v)}
              />
              <ToggleSwitch
                label="Open vSwitch (OVS)"
                description="Virtual switch management"
                checked={form.ovs_enabled ?? false}
                onChange={(v) => updateField('ovs_enabled', v)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quick IP Helper */}
      {dirty && form.vm_host && form.vm_host !== settings.data?.vm_host && (
        <div style={{ ...bannerStyle, background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          💡 <strong>Tip:</strong> After changing the IP, click &quot;Test Connection&quot; first to verify, then &quot;Save Settings&quot; to apply.
          {form.ryu_url && !form.ryu_url.includes(form.vm_host) && (
            <span>
              {' '}The Ryu URL still points to a different IP.{' '}
              <button
                onClick={() =>
                  updateField('ryu_url', form.ryu_url!.replace(/\/\/[^:]+/, `//${form.vm_host}`))
                }
                style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', fontSize: 12, padding: 0 }}
              >
                Sync Ryu URL
              </button>
            </span>
          )}
        </div>
      )}

      {/* Service Control Panel */}
      <ServiceControlPanel />

      {/* Test Results */}
      <TestResultsPanel
        results={testResults}
        loading={testMut.isPending || quickStartMut.isPending}
        onStartService={(svc) => quickStartMut.mutate(svc)}
      />

      {/* Detect Candidates (if any) */}
      {detectMut.isSuccess && (detectMut.data?.candidates.length ?? 0) > 0 && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>🔍 Detected Candidates</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                {['IP Address', 'Detection Method', 'Status', 'SSH', 'Action'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      fontWeight: 600,
                      fontSize: 11,
                      color: 'var(--color-text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detectMut.data!.candidates.map((c) => (
                <tr key={c.ip} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{c.ip}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--color-text-muted)' }}>{c.method}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <StatusBadge status={c.status === 'reachable' || c.status === 'found_in_arp' ? 'available' : c.status} />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    {c.ssh_status ? <StatusBadge status={c.ssh_status} /> : <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <button
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          vm_host: c.ip,
                          ryu_url: prev.ryu_url?.replace(/\/\/[^:]+/, `//${c.ip}`) ?? `http://${c.ip}:8080`,
                        }));
                        setDirty(true);
                      }}
                      style={{
                        padding: '3px 12px',
                        borderRadius: 6,
                        border: '1px solid #3b82f644',
                        background: '#3b82f620',
                        color: '#3b82f6',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Use This IP
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All Connected Celebration */}
      {allConnected && (
        <div
          style={{
            ...bannerStyle,
            marginTop: 16,
            background: '#22c55e10',
            borderColor: '#22c55e44',
            color: '#22c55e',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          🎉 All services are connected and ready!
        </div>
      )}
    </div>
  );
}

/* ── Toggle ── */
function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        padding: '6px 0',
      }}
    >
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          background: checked ? '#22c55e' : 'var(--color-border)',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            background: '#fff',
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{description}</div>
      </div>
    </label>
  );
}

/* ── Styles ── */
const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: 20,
};

const cardTitleStyle: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: 15,
  fontWeight: 700,
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: 14,
  fontFamily: 'monospace',
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s',
  whiteSpace: 'nowrap',
};

const bannerStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid',
  fontSize: 13,
  marginBottom: 16,
  lineHeight: 1.6,
};
