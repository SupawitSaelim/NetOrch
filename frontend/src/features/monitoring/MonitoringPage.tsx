import { useQuery } from '@tanstack/react-query';
import { getMonitoringStats, getEvents } from '../../api/endpoints';
import { useState } from 'react';

export default function MonitoringPage() {
  const [levelFilter, setLevelFilter] = useState('');
  const stats = useQuery({
    queryKey: ['monitoring-stats'],
    queryFn: () => getMonitoringStats().then((r) => r.data),
    refetchInterval: 10_000,
  });
  const events = useQuery({
    queryKey: ['events', levelFilter],
    queryFn: () => getEvents(levelFilter || undefined, 50).then((r) => r.data),
  });

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Monitoring</h2>

      {/* System Metrics */}
      {stats.data && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          {[
            { label: 'CPU Usage', value: `${stats.data.cpu_usage}%`, color: stats.data.cpu_usage > 80 ? 'var(--color-danger)' : 'var(--color-success)' },
            { label: 'Memory Usage', value: `${stats.data.memory_usage}%`, color: stats.data.memory_usage > 80 ? 'var(--color-danger)' : 'var(--color-success)' },
            { label: 'Uptime', value: `${Math.floor(stats.data.uptime / 3600)}h ${Math.floor((stats.data.uptime % 3600) / 60)}m`, color: 'var(--color-primary)' },
            { label: 'API Requests', value: stats.data.api_requests_total.toLocaleString(), color: '#a78bfa' },
          ].map((m) => (
            <div
              key={m.label}
              style={{
                flex: '1 1 180px',
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: '16px 20px',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Events */}
      <div
        style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>
            Events {events.data && `(${events.data.total})`}
          </h3>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            style={{
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <option value="">All Levels</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: 8, width: 40 }}>Level</th>
              <th style={{ padding: 8, width: 80 }}>Component</th>
              <th style={{ padding: 8 }}>Message</th>
              <th style={{ padding: 8, width: 160 }}>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {events.data?.events.map((evt) => (
              <tr key={evt.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: 8 }}>
                  {evt.level === 'error' ? '🔴' : evt.level === 'warning' ? '🟡' : '🔵'}
                </td>
                <td style={{ padding: 8, fontWeight: 500, textTransform: 'uppercase', fontSize: 12 }}>
                  {evt.component}
                </td>
                <td style={{ padding: 8 }}>{evt.message}</td>
                <td style={{ padding: 8, color: 'var(--color-text-muted)', fontSize: 12 }}>
                  {new Date(evt.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
