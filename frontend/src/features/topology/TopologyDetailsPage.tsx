import { useQuery } from '@tanstack/react-query';
import { getTopology } from '../../api/endpoints';
import { SkeletonCard, ErrorBanner } from '../../components/Shared';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

/* ═══════════════════════════════════════════════════════════════
   Topology Details — Nodes & Links tables with search/filter
   ═══════════════════════════════════════════════════════════════ */

const NODE_COLORS: Record<string, string> = {
  switch: '#3b82f6',
  router: '#22c55e',
  host: '#a78bfa',
  network: '#f59e0b',
};

const NODE_ICONS: Record<string, string> = {
  switch: '⬡',
  router: '⬢',
  host: '◉',
  network: '◎',
};

export default function TopologyDetailsPage() {
  const topology = useQuery({
    queryKey: ['topology'],
    queryFn: () => getTopology().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const nodes = topology.data?.nodes ?? [];
  const links = topology.data?.links ?? [];

  const [nodeFilter, setNodeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [linkFilter, setLinkFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filtered data
  const filteredNodes = nodes.filter((n) => {
    const matchesText = !nodeFilter || n.name.toLowerCase().includes(nodeFilter.toLowerCase()) || n.id.toLowerCase().includes(nodeFilter.toLowerCase());
    const matchesType = typeFilter === 'all' || n.type === typeFilter;
    return matchesText && matchesType;
  });

  const filteredLinks = links.filter((l) => {
    const matchesText = !linkFilter
      || l.source.toLowerCase().includes(linkFilter.toLowerCase())
      || l.target.toLowerCase().includes(linkFilter.toLowerCase())
      || l.source_port.toLowerCase().includes(linkFilter.toLowerCase())
      || l.target_port.toLowerCase().includes(linkFilter.toLowerCase());
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesText && matchesStatus;
  });

  // Count by type
  const typeCounts = nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1;
    return acc;
  }, {});

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, fontSize: 13,
    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
    color: 'var(--color-text)', outline: 'none', width: '100%', boxSizing: 'border-box' as const,
  };

  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
    color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
  };

  const td: React.CSSProperties = {
    padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--color-border)',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📋 Nodes & Links</h2>
        <NavLink to="/topology"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
            borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none',
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
          }}>
          🗺️ Back to Canvas
        </NavLink>
      </div>

      {topology.isLoading && <SkeletonCard count={2} />}
      {topology.isError && <ErrorBanner message="Failed to load topology data." />}

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.entries(typeCounts).map(([type, count]) => (
          <div key={type} style={{
            flex: '1 1 120px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{
              width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: (NODE_COLORS[type] ?? '#94a3b8') + '20', fontSize: 18,
            }}>{NODE_ICONS[type] ?? '●'}</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{count}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{type}s</div>
            </div>
          </div>
        ))}
        <div style={{
          flex: '1 1 120px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
          borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{
            width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#3b82f620', fontSize: 18,
          }}>🔗</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{links.length}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Links</div>
          </div>
        </div>
      </div>

      {/* Nodes Table */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            Nodes <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 13 }}>({filteredNodes.length})</span>
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)}
              placeholder="Search nodes..." style={{ ...inputStyle, width: 200 }}
            />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              style={{ ...inputStyle, width: 130 }}>
              <option value="all">All types</option>
              <option value="router">Router</option>
              <option value="switch">Switch</option>
              <option value="host">Host</option>
              <option value="network">Network</option>
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={th}></th>
                <th style={th}>Name</th>
                <th style={th}>ID</th>
                <th style={th}>Type</th>
                <th style={th}>DPID</th>
                <th style={th}>IP</th>
                <th style={th}>Gateway</th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.map((n) => (
                <tr key={n.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ ...td, width: 32 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: (NODE_COLORS[n.type] ?? '#94a3b8') + '20', fontSize: 14,
                    }}>{NODE_ICONS[n.type] ?? '●'}</span>
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>{n.name}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)' }}>{n.id}</td>
                  <td style={td}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                      background: (NODE_COLORS[n.type] ?? '#94a3b8') + '20',
                      color: NODE_COLORS[n.type] ?? '#94a3b8', textTransform: 'capitalize',
                    }}>{n.type}</span>
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {n.dpid || '—'}
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#38bdf8' }}>
                    {(n.metadata.ip as string) || '—'}
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#34d399' }}>
                    {(n.metadata.gateway as string) || '—'}
                  </td>
                </tr>
              ))}
              {filteredNodes.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>
                    No nodes match the filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Links Table */}
      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            Links <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 13 }}>({filteredLinks.length})</span>
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={linkFilter} onChange={(e) => setLinkFilter(e.target.value)}
              placeholder="Search links..." style={{ ...inputStyle, width: 200 }}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              style={{ ...inputStyle, width: 130 }}>
              <option value="all">All status</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={th}>Source</th>
                <th style={th}>Target</th>
                <th style={th}>Source Port</th>
                <th style={th}>Target Port</th>
                <th style={th}>Bandwidth</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLinks.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ ...td, fontWeight: 500 }}>{l.source}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{l.target}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{l.source_port}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{l.target_port}</td>
                  <td style={td}>{l.bandwidth ? `${l.bandwidth} Mbps` : '—'}</td>
                  <td style={td}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                      background: l.status === 'up' ? '#22c55e20' : '#ef444420',
                      color: l.status === 'up' ? '#22c55e' : '#ef4444',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                      {l.status === 'up' ? 'Up' : 'Down'}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredLinks.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>
                    No links match the filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
