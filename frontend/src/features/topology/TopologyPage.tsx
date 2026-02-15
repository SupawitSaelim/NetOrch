import { useQuery } from '@tanstack/react-query';
import { getTopology } from '../../api/endpoints';
import { SkeletonCard, ErrorBanner, EmptyState } from '../../components/Shared';

const NODE_COLORS: Record<string, string> = {
  switch: '#3b82f6',
  router: '#22c55e',
  host: '#a78bfa',
  network: '#f59e0b',
};

const NODE_ICONS: Record<string, string> = {
  switch: '🔀',
  router: '🖧',
  host: '💻',
  network: '🌐',
};

export default function TopologyPage() {
  const topology = useQuery({
    queryKey: ['topology'],
    queryFn: () => getTopology().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const nodes = topology.data?.nodes ?? [];
  const links = topology.data?.links ?? [];

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Network Topology</h2>

      {topology.isLoading && <SkeletonCard count={1} />}
      {topology.isError && <ErrorBanner message="Failed to load topology data." />}
      {!topology.isLoading && !topology.isError && nodes.length === 0 && (
        <EmptyState icon="🌐" title="No topology data" description="Waiting for OVS/FRR discovery..." />
      )}

      {/* Simple SVG topology */}
      {nodes.length > 0 && (
      <div
        className="fade-in"
        style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <svg width="100%" height="450" viewBox="0 0 600 430" style={{ display: 'block' }}>
          {/* Links */}
          {links.map((link) => {
            const src = nodes.find((n) => n.id === link.source);
            const tgt = nodes.find((n) => n.id === link.target);
            if (!src || !tgt) return null;
            const sx = (src.metadata.x as number) ?? 0;
            const sy = (src.metadata.y as number) ?? 0;
            const tx = (tgt.metadata.x as number) ?? 0;
            const ty = (tgt.metadata.y as number) ?? 0;
            return (
              <g key={link.id}>
                <line
                  x1={sx + 25}
                  y1={sy + 25}
                  x2={tx + 25}
                  y2={ty + 25}
                  stroke={link.status === 'up' ? '#475569' : '#ef4444'}
                  strokeWidth={2}
                  strokeDasharray={link.status === 'down' ? '5,5' : undefined}
                />
                <text
                  x={(sx + tx) / 2 + 25}
                  y={(sy + ty) / 2 + 20}
                  fill="#64748b"
                  fontSize={10}
                  textAnchor="middle"
                >
                  {link.source_port}↔{link.target_port}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const x = (node.metadata.x as number) ?? 0;
            const y = (node.metadata.y as number) ?? 0;
            const color = NODE_COLORS[node.type] ?? '#94a3b8';
            return (
              <g key={node.id}>
                <circle cx={x + 25} cy={y + 25} r={24} fill={color} opacity={0.2} />
                <circle cx={x + 25} cy={y + 25} r={18} fill={color} opacity={0.8} />
                <text x={x + 25} y={y + 31} textAnchor="middle" fontSize={16}>
                  {NODE_ICONS[node.type] ?? '●'}
                </text>
                <text x={x + 25} y={y + 60} fill="#e2e8f0" fontSize={12} textAnchor="middle" fontWeight={600}>
                  {node.name}
                </text>
                <text x={x + 25} y={y + 74} fill="#64748b" fontSize={10} textAnchor="middle">
                  {node.type}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      )}

      {/* Node & Link tables */}
      {nodes.length > 0 && (
      <div className="fade-in" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div
          style={{
            flex: '1 1 250px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Nodes ({nodes.length})</h3>
          {nodes.map((n) => (
            <div
              key={n.id}
              style={{
                display: 'flex',
                gap: 8,
                padding: '6px 0',
                borderBottom: '1px solid var(--color-border)',
                fontSize: 13,
              }}
            >
              <span>{NODE_ICONS[n.type]}</span>
              <span style={{ fontWeight: 500 }}>{n.name}</span>
              <span style={{ color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{n.type}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            flex: '2 1 350px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Links ({links.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>Source</th>
                <th style={{ padding: 6 }}>Target</th>
                <th style={{ padding: 6 }}>Ports</th>
                <th style={{ padding: 6 }}>BW</th>
                <th style={{ padding: 6 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 6 }}>{l.source}</td>
                  <td style={{ padding: 6 }}>{l.target}</td>
                  <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>
                    {l.source_port}↔{l.target_port}
                  </td>
                  <td style={{ padding: 6 }}>{l.bandwidth ? `${l.bandwidth}M` : '-'}</td>
                  <td
                    style={{
                      padding: 6,
                      color: l.status === 'up' ? 'var(--color-success)' : 'var(--color-danger)',
                      fontWeight: 600,
                    }}
                  >
                    {l.status === 'up' ? '● Up' : '○ Down'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
