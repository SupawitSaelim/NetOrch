import { useQuery } from '@tanstack/react-query';
import { getHealth, getMonitoringStats, getEvents, getTopology, getBGPSummary, getRoutes } from '../../api/endpoints';
import { SkeletonCard, ErrorBanner } from '../../components/Shared';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/* ── Stat Card ── */
function StatCard({ label, value, color, icon, delay = 0 }: { label: string; value: string | number; color: string; icon: string; delay?: number }) {
  return (
    <div className="card-hover slide-up"
      style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '20px 24px', flex: '1 1 180px', animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
        </div>
        <span style={{ fontSize: 28, opacity: 0.3 }}>{icon}</span>
      </div>
    </div>
  );
}

/* ── Mini Sparkline ── */
function Sparkline({ data, color, width = 120, height = 32 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const lastPoint = points.split(' ').pop()!.split(',');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={parseFloat(lastPoint[0])} cy={parseFloat(lastPoint[1])} r={2.5} fill={color} />
    </svg>
  );
}

/* ── Quick Action Button ── */
function QuickAction({ icon, label, to, color }: { icon: string; label: string; to: string; color: string }) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: color + '10', border: `1px solid ${color}22`, cursor: 'pointer', transition: 'all .15s' }}
        onMouseEnter={e => { e.currentTarget.style.background = color + '20'; e.currentTarget.style.borderColor = color + '44'; }}
        onMouseLeave={e => { e.currentTarget.style.background = color + '10'; e.currentTarget.style.borderColor = color + '22'; }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>→</span>
      </div>
    </Link>
  );
}

/* ── Dashboard ── */
export default function Dashboard() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => getHealth().then(r => r.data), refetchInterval: 10_000 });
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => getMonitoringStats().then(r => r.data), refetchInterval: 5_000 });
  const events = useQuery({ queryKey: ['events'], queryFn: () => getEvents(undefined, 20).then(r => r.data), refetchInterval: 15_000 });
  const topo = useQuery({ queryKey: ['topology'], queryFn: () => getTopology().then(r => r.data), refetchInterval: 30_000 });
  const bgp = useQuery({ queryKey: ['bgp-summary'], queryFn: () => getBGPSummary().then(r => r.data), refetchInterval: 15_000 });
  const routesQ = useQuery({ queryKey: ['routes'], queryFn: () => getRoutes().then(r => r.data), refetchInterval: 15_000 });

  // Sparkline history
  const cpuHistory = useRef<number[]>([]);
  const memHistory = useRef<number[]>([]);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!stats.data) return;
    cpuHistory.current = [...cpuHistory.current.slice(-29), stats.data.cpu_usage];
    memHistory.current = [...memHistory.current.slice(-29), stats.data.memory_usage];
    forceUpdate(n => n + 1);
  }, [stats.data]);

  const isLoading = health.isLoading || stats.isLoading;
  const topoNodes = topo.data?.nodes ?? [];
  const topoLinks = topo.data?.links ?? [];
  const routerCount = topoNodes.filter(n => n.type === 'router').length;
  const switchCount = topoNodes.filter(n => n.type === 'switch').length;
  const hostCount = topoNodes.filter(n => n.type === 'host').length;
  const linksUp = topoLinks.filter(l => l.status === 'up').length;
  const linksDown = topoLinks.filter(l => l.status === 'down').length;

  // Top routes
  const topRoutes = (routesQ.data?.routes ?? []).slice(0, 5);

  // BGP neighbors
  const bgpNeighbors = bgp.data?.neighbors ?? [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dashboard</h2>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Real-time overview of your hybrid SDN orchestration platform
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: health.data?.status === 'healthy' ? '#22c55e10' : '#ef444410', border: `1px solid ${health.data?.status === 'healthy' ? '#22c55e' : '#ef4444'}22` }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: health.data?.status === 'healthy' ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: health.data?.status === 'healthy' ? '#22c55e' : '#ef4444' }}>
            {health.data?.status === 'healthy' ? 'System Healthy' : 'System Degraded'}
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      {isLoading ? <div style={{ marginBottom: 24 }}><SkeletonCard count={6} /></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard label="Routers" value={routerCount} color="#22c55e" icon="🔀" delay={0} />
          <StatCard label="Switches" value={switchCount} color="#3b82f6" icon="⬡" delay={50} />
          <StatCard label="Hosts" value={hostCount} color="#a78bfa" icon="◉" delay={100} />
          <StatCard label="Active Flows" value={stats.data?.components?.ovs?.flows ?? 0} color="#06b6d4" icon="📡" delay={150} />
          <StatCard label="Total Routes" value={stats.data?.components?.frr?.total_routes ?? 0} color="#f59e0b" icon="🛣️" delay={200} />
          <StatCard label="Links Up" value={`${linksUp}/${linksUp + linksDown}`} color={linksDown > 0 ? '#ef4444' : '#22c55e'} icon="🔗" delay={250} />
        </div>
      )}

      {/* Row 2: CPU/Mem + Quick Actions + Topology Mini-map */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* CPU & Memory live */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>⚡ System Resources</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>CPU Usage</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: (stats.data?.cpu_usage ?? 0) > 80 ? '#ef4444' : '#3b82f6' }}>{stats.data?.cpu_usage ?? 0}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: (stats.data?.cpu_usage ?? 0) > 80 ? '#ef4444' : '#3b82f6', width: `${stats.data?.cpu_usage ?? 0}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ marginTop: 6 }}><Sparkline data={cpuHistory.current} color="#3b82f6" /></div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Memory Usage</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: (stats.data?.memory_usage ?? 0) > 80 ? '#ef4444' : '#22c55e' }}>{stats.data?.memory_usage ?? 0}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: (stats.data?.memory_usage ?? 0) > 80 ? '#ef4444' : '#22c55e', width: `${stats.data?.memory_usage ?? 0}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ marginTop: 6 }}><Sparkline data={memHistory.current} color="#22c55e" /></div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
              Uptime: {Math.floor((stats.data?.uptime ?? 0) / 3600)}h {Math.floor(((stats.data?.uptime ?? 0) % 3600) / 60)}m
              {' · '}API: {stats.data?.api_requests_total ?? 0} req
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>🚀 Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <QuickAction icon="🗺️" label="Open Topology Builder" to="/topology" color="#3b82f6" />
            <QuickAction icon="📡" label="Manage SDN Flows" to="/flows" color="#06b6d4" />
            <QuickAction icon="🔀" label="Router Management" to="/routers" color="#22c55e" />
            <QuickAction icon="🏓" label="Network Tools" to="/tools" color="#a78bfa" />
            <QuickAction icon="🧪" label="Hands-on Labs" to="/labs" color="#f59e0b" />
          </div>
        </div>

        {/* Topology Mini-map */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>🌐 Topology Overview</h3>
            <Link to="/topology" style={{ fontSize: 11, color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>View full →</Link>
          </div>
          <TopologyMiniMap nodes={topoNodes} links={topoLinks} />
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            {([['router', '🔀', '#22c55e'], ['switch', '⬡', '#3b82f6'], ['host', '◉', '#a78bfa'], ['cloud', '☁', '#ec4899']] as const).map(([type, _icon, color]) => {
              const count = topoNodes.filter(n => n.type === type).length;
              if (count === 0) return null;
              return (
                <span key={type} style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {count} {type}s
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: Component Health + BGP Neighbors + Top Routes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Component Health */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>🔧 Component Health</h3>
          {health.data?.components && Object.entries(health.data.components).map(([key, s]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 13, fontWeight: 500, textTransform: 'uppercase' }}>{key}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: s === 'up' ? '#22c55e' : s === 'mock' ? '#f59e0b' : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s === 'up' ? '#22c55e' : s === 'mock' ? '#f59e0b' : '#ef4444', display: 'inline-block' }} />
                {s === 'up' ? 'Online' : s === 'mock' ? 'Mock' : 'Offline'}
              </span>
            </div>
          ))}
        </div>

        {/* BGP Neighbors */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>🛰️ BGP Neighbors</h3>
            <Link to="/routing" style={{ fontSize: 11, color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
          </div>
          {bgpNeighbors.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '16px 0' }}>No BGP neighbors</div>
          ) : (
            bgpNeighbors.slice(0, 5).map((n: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{n.neighbor ?? n.ip ?? '?'}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>AS {n.as ?? n.remote_as ?? '?'}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: n.state === 'Established' ? '#22c55e15' : '#ef444415', color: n.state === 'Established' ? '#22c55e' : '#ef4444' }}>
                  {n.state ?? 'Unknown'}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Top Routes */}
        <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>🛣️ Top Routes</h3>
            <Link to="/routing" style={{ fontSize: 11, color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
          </div>
          {topRoutes.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '16px 0' }}>No routes</div>
          ) : (
            topRoutes.map((r: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 9, fontWeight: 700, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: r.protocol === 'bgp' ? '#f59e0b15' : r.protocol === 'ospf' ? '#3b82f615' : '#22c55e15', color: r.protocol === 'bgp' ? '#f59e0b' : r.protocol === 'ospf' ? '#3b82f6' : '#22c55e' }}>
                  {(r.protocol ?? 'S')[0].toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.network ?? r.prefix ?? '?'}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>via {r.next_hop ?? r.nexthop ?? '-'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Row 4: Events Log (full width) */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>📋 Recent Events</h3>
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {events.data?.events?.map((evt) => (
            <div key={evt.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13, alignItems: 'center' }}>
              <span style={{ fontSize: 11, width: 60, textAlign: 'center', padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: evt.level === 'error' ? '#ef444415' : evt.level === 'warning' ? '#f59e0b15' : '#3b82f615', color: evt.level === 'error' ? '#ef4444' : evt.level === 'warning' ? '#f59e0b' : '#3b82f6' }}>
                {evt.level}
              </span>
              <span style={{ color: 'var(--color-text-muted)', minWidth: 70, fontSize: 12, fontWeight: 500 }}>{evt.component}</span>
              <span style={{ flex: 1, color: 'var(--color-text)' }}>{evt.message}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ''}
              </span>
            </div>
          ))}
          {events.isLoading && <div style={{ color: 'var(--color-text-muted)', padding: 16 }}>Loading events...</div>}
          {!events.isLoading && (events.data?.events?.length ?? 0) === 0 && (
            <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', padding: 16, textAlign: 'center' }}>No events recorded yet</div>
          )}
        </div>
      </div>

      {health.isError && <ErrorBanner message="Failed to connect to backend. Make sure the API server is running on port 8000." />}
    </div>
  );
}

/* ── Topology Mini-map (SVG) ── */
function TopologyMiniMap({ nodes, links }: { nodes: any[]; links: any[] }) {
  const W = 260, H = 160;

  if (nodes.length === 0) {
    return (
      <div style={{ width: '100%', height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', borderRadius: 8, fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
        No nodes — open Topology Builder to create
      </div>
    );
  }

  // Use metadata.x/y if available, otherwise grid
  const positioned = nodes.map((n, i) => {
    const x = (n.metadata?.x as number) ?? (80 + (i % 5) * 50);
    const y = (n.metadata?.y as number) ?? (60 + Math.floor(i / 5) * 50);
    return { ...n, px: x, py: y };
  });

  // Normalize to fit in W×H
  const xs = positioned.map(n => n.px);
  const ys = positioned.map(n => n.py);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const pad = 20;

  const scaled = positioned.map(n => ({
    ...n,
    sx: pad + ((n.px - minX) / rangeX) * (W - pad * 2),
    sy: pad + ((n.py - minY) / rangeY) * (H - pad * 2),
  }));

  const nodeMap = new Map(scaled.map(n => [n.id, n]));

  const COLORS: Record<string, string> = { switch: '#3b82f6', router: '#22c55e', host: '#a78bfa', network: '#f59e0b', cloud: '#ec4899' };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: 'var(--color-bg)', borderRadius: 8 }}>
      {links.map((l, i) => {
        const src = nodeMap.get(typeof l.source === 'string' ? l.source : l.source?.id);
        const tgt = nodeMap.get(typeof l.target === 'string' ? l.target : l.target?.id);
        if (!src || !tgt) return null;
        return <line key={i} x1={src.sx} y1={src.sy} x2={tgt.sx} y2={tgt.sy} stroke={l.status === 'up' ? '#334155' : '#ef444444'} strokeWidth={1} />;
      })}
      {scaled.map(n => (
        <circle key={n.id} cx={n.sx} cy={n.sy} r={4} fill={COLORS[n.type] ?? '#94a3b8'} stroke={COLORS[n.type] ?? '#94a3b8'} strokeWidth={1} opacity={0.9} />
      ))}
    </svg>
  );
}
