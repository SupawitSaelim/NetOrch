import { useQuery } from '@tanstack/react-query';
import { getRoutes, getBGPSummary } from '../../api/endpoints';
import { useState } from 'react';

export default function RoutingPage() {
  const [protocolFilter, setProtocolFilter] = useState<string>('');
  const routes = useQuery({
    queryKey: ['routes', protocolFilter],
    queryFn: () => getRoutes(protocolFilter || undefined).then((r) => r.data),
    refetchInterval: 15_000,
  });
  const bgp = useQuery({
    queryKey: ['bgp-summary'],
    queryFn: () => getBGPSummary().then((r) => r.data),
    refetchInterval: 15_000,
  });

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Routing</h2>

      {/* BGP Summary */}
      {bgp.data && (
        <div
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>BGP Summary</h3>
          <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
            <span>AS: <strong>{bgp.data.local_as}</strong></span>
            <span>Router ID: <strong>{bgp.data.router_id}</strong></span>
            <span>Neighbors: <strong>{bgp.data.established}/{bgp.data.total_neighbors}</strong></span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>Neighbor</th>
                <th style={{ padding: 8 }}>Remote AS</th>
                <th style={{ padding: 8 }}>State</th>
                <th style={{ padding: 8 }}>Uptime</th>
                <th style={{ padding: 8 }}>Prefixes Rx/Tx</th>
              </tr>
            </thead>
            <tbody>
              {bgp.data.neighbors.map((n) => (
                <tr key={n.neighbor} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 8 }}>{n.neighbor}</td>
                  <td style={{ padding: 8 }}>{n.remote_as}</td>
                  <td
                    style={{
                      padding: 8,
                      color: n.state === 'Established' ? 'var(--color-success)' : 'var(--color-warning)',
                    }}
                  >
                    {n.state}
                  </td>
                  <td style={{ padding: 8, color: 'var(--color-text-muted)' }}>{n.uptime}</td>
                  <td style={{ padding: 8 }}>
                    {n.prefixes_received} / {n.prefixes_sent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Routing Table */}
      <div
        style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>
            Routing Table {routes.data && `(${routes.data.total})`}
          </h3>
          <select
            value={protocolFilter}
            onChange={(e) => setProtocolFilter(e.target.value)}
            style={{
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <option value="">All Protocols</option>
            <option value="bgp">BGP</option>
            <option value="ospf">OSPF</option>
            <option value="static">Static</option>
            <option value="connected">Connected</option>
            <option value="kernel">Kernel</option>
          </select>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Destination</th>
              <th style={{ padding: 8 }}>Next Hop</th>
              <th style={{ padding: 8 }}>Protocol</th>
              <th style={{ padding: 8 }}>Metric</th>
              <th style={{ padding: 8 }}>Interface</th>
              <th style={{ padding: 8 }}>Uptime</th>
            </tr>
          </thead>
          <tbody>
            {routes.data?.routes.map((r) => (
              <tr key={r.destination} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: 8, fontFamily: 'monospace' }}>{r.destination}</td>
                <td style={{ padding: 8, fontFamily: 'monospace' }}>{r.next_hop}</td>
                <td style={{ padding: 8 }}>
                  <span
                    style={{
                      background:
                        r.protocol === 'bgp' ? '#3b82f620' :
                        r.protocol === 'ospf' ? '#22c55e20' :
                        r.protocol === 'static' ? '#f59e0b20' : '#64748b20',
                      color:
                        r.protocol === 'bgp' ? '#60a5fa' :
                        r.protocol === 'ospf' ? '#4ade80' :
                        r.protocol === 'static' ? '#fbbf24' : '#94a3b8',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {r.protocol}
                  </span>
                </td>
                <td style={{ padding: 8 }}>{r.metric}</td>
                <td style={{ padding: 8 }}>{r.interface}</td>
                <td style={{ padding: 8, color: 'var(--color-text-muted)' }}>{r.uptime}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {routes.isLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading...</div>}
        {routes.isError && <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-danger)' }}>Error loading routes</div>}
        {routes.data && routes.data.routes.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>No routes found</div>
        )}
      </div>
    </div>
  );
}
