import { useQuery } from '@tanstack/react-query';
import { getFlows, getSwitches } from '../../api/endpoints';
import { SkeletonTable, ErrorBanner, EmptyState } from '../../components/Shared';

export default function FlowsPage() {
  const flows = useQuery({
    queryKey: ['flows'],
    queryFn: () => getFlows().then((r) => r.data),
    refetchInterval: 15_000,
  });
  const switches = useQuery({
    queryKey: ['switches'],
    queryFn: () => getSwitches().then((r) => r.data),
    refetchInterval: 15_000,
  });

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>SDN Flows</h2>

      {flows.isLoading && <SkeletonTable rows={4} cols={5} />}
      {flows.isError && <ErrorBanner message="Failed to load flow data." />}
      {!flows.isLoading && !flows.isError && !flows.data?.flows?.length && (
        <EmptyState icon="🔄" title="No flows" description="No OpenFlow rules found." />
      )}

      {/* Switches */}
      {!switches.isLoading && (
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
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Switches</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {switches.data?.switches.map((sw) => (
            <div
              key={sw.dpid}
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 16,
                minWidth: 200,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{sw.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                {sw.dpid}
              </div>
              <div style={{ fontSize: 13, marginTop: 8 }}>
                <span
                  style={{
                    color: sw.connected ? 'var(--color-success)' : 'var(--color-danger)',
                    fontWeight: 600,
                  }}
                >
                  {sw.connected ? '● Connected' : '○ Disconnected'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Ports: {sw.ports.length}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Flow Table */}
      {(flows.data?.flows?.length ?? 0) > 0 && (
      <div
        className="fade-in"
        style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Flow Rules {flows.data && `(${flows.data.total})`}
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>ID</th>
              <th style={{ padding: 8 }}>Switch</th>
              <th style={{ padding: 8 }}>Priority</th>
              <th style={{ padding: 8 }}>Match</th>
              <th style={{ padding: 8 }}>Actions</th>
              <th style={{ padding: 8 }}>Packets</th>
              <th style={{ padding: 8 }}>Bytes</th>
            </tr>
          </thead>
          <tbody>
            {flows.data?.flows.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: 8, fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                  {f.id}
                </td>
                <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>{f.dpid}</td>
                <td style={{ padding: 8 }}>{f.priority}</td>
                <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>
                  {Object.entries(f.match)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}
                </td>
                <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>
                  {f.actions.map((a: any, i: number) => {
                    const label = typeof a === 'string' ? a : `${a.type ?? ''}${a.port ? ':' + a.port : ''}`;
                    return <span key={i}>{i > 0 ? ', ' : ''}{label}</span>;
                  })}
                </td>
                <td style={{ padding: 8 }}>{f.packet_count.toLocaleString()}</td>
                <td style={{ padding: 8 }}>{f.byte_count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {flows.isLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading...</div>}
      </div>
      )}
    </div>
  );
}
