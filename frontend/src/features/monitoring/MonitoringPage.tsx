import { useQuery } from '@tanstack/react-query';
import { getMonitoringStats, getEvents } from '../../api/endpoints';
import { useState, useRef, useEffect } from 'react';
import { SkeletonCard as _SkeletonCard, ErrorBanner as _ErrorBanner } from '../../components/Shared';
import { useAppStore } from '../../stores/appStore';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend);

const MAX_POINTS = 30;

export default function MonitoringPage() {
  const [levelFilter, setLevelFilter] = useState('');
  const wsConnected = useAppStore((s) => s.wsStatus === 'connected');

  // History buffers for charts
  const cpuHistory = useRef<number[]>([]);
  const memHistory = useRef<number[]>([]);
  const labelHistory = useRef<string[]>([]);
  const [, forceUpdate] = useState(0);

  const stats = useQuery({
    queryKey: ['monitoring-stats'],
    queryFn: () => getMonitoringStats().then((r) => r.data),
    refetchInterval: wsConnected ? false : 5_000,
  });

  const events = useQuery({
    queryKey: ['events', levelFilter],
    queryFn: () => getEvents(levelFilter || undefined, 50).then((r) => r.data),
  });

  // Append data to history when stats updates
  useEffect(() => {
    if (!stats.data) return;
    const now = new Date().toLocaleTimeString();
    cpuHistory.current.push(stats.data.cpu_usage);
    memHistory.current.push(stats.data.memory_usage);
    labelHistory.current.push(now);
    if (cpuHistory.current.length > MAX_POINTS) {
      cpuHistory.current.shift();
      memHistory.current.shift();
      labelHistory.current.shift();
    }
    forceUpdate((n) => n + 1);
  }, [stats.data]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 } as const,
    scales: {
      y: { min: 0, max: 100, ticks: { callback: (v: any) => `${v}%`, color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, .1)' } },
      x: { ticks: { maxTicksLimit: 8, color: '#94a3b8' }, grid: { display: false } },
    },
    plugins: { legend: { display: false } },
  };

  const cpuChartData = {
    labels: labelHistory.current,
    datasets: [
      {
        label: 'CPU %',
        data: cpuHistory.current,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, .15)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  };

  const memChartData = {
    labels: labelHistory.current,
    datasets: [
      {
        label: 'Memory %',
        data: memHistory.current,
        borderColor: '#a78bfa',
        backgroundColor: 'rgba(167, 139, 250, .15)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  };

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Monitoring</h2>

      {/* Stat cards */}
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

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#3b82f6' }}>📈 CPU Usage (real-time)</h3>
          <div style={{ height: 200 }}>
            <Line data={cpuChartData} options={chartOptions as any} />
          </div>
        </div>
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#a78bfa' }}>📈 Memory Usage (real-time)</h3>
          <div style={{ height: 200 }}>
            <Line data={memChartData} options={chartOptions as any} />
          </div>
        </div>
      </div>

      {/* Component Health Cards */}
      {stats.data?.components && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          {[
            { label: 'FRR', items: [
              `${stats.data.components.frr.bgp_neighbors} BGP neighbors`,
              `${stats.data.components.frr.ospf_neighbors} OSPF neighbors`,
              `${stats.data.components.frr.total_routes} routes`,
            ], color: '#10b981' },
            { label: 'OVS', items: [
              `${stats.data.components.ovs.bridges} bridges`,
              `${stats.data.components.ovs.flows} flows`,
            ], color: '#3b82f6' },
            { label: 'Ryu', items: [
              `${stats.data.components.ryu.switches} switches`,
              `${stats.data.components.ryu.controllers} controller`,
            ], color: '#f59e0b' },
          ].map((c) => (
            <div key={c.label} style={{ flex: '1 1 200px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.color, marginBottom: 8 }}>{c.label}</div>
              {c.items.map((item) => (
                <div key={item} style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.8 }}>• {item}</div>
              ))}
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
