import { useQuery } from '@tanstack/react-query';
import { getHealth, getMonitoringStats, getEvents } from '../../api/endpoints';
import { SkeletonCard, ErrorBanner } from '../../components/Shared';

function StatCard({ label, value, color, delay = 0 }: { label: string; value: string | number; color: string; delay?: number }) {
  return (
    <div
      className="card-hover slide-up"
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: '20px 24px',
        flex: '1 1 200px',
        animationDelay: `${delay}ms`,
        animationFillMode: 'backwards',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => getHealth().then((r) => r.data), refetchInterval: 10_000 });
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => getMonitoringStats().then((r) => r.data), refetchInterval: 10_000 });
  const events = useQuery({
    queryKey: ['events'],
    queryFn: () => getEvents(undefined, 10).then((r) => r.data),
    refetchInterval: 15_000,
  });

  const isLoading = health.isLoading || stats.isLoading;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Dashboard</h2>

      {/* Stat Cards */}
      {isLoading ? (
        <div style={{ marginBottom: 24 }}><SkeletonCard count={5} /></div>
      ) : (
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard
          label="System Status"
          value={health.data?.status ?? '...'}
          color={health.data?.status === 'healthy' ? 'var(--color-success)' : 'var(--color-danger)'}
          delay={0}
        />
        <StatCard
          label="Total Routes"
          value={stats.data?.components?.frr?.total_routes ?? '...'}
          color="var(--color-primary)"
          delay={60}
        />
        <StatCard
          label="Active Flows"
          value={stats.data?.components?.ovs?.flows ?? '...'}
          color="#a78bfa"
          delay={120}
        />
        <StatCard
          label="BGP Neighbors"
          value={stats.data?.components?.frr?.bgp_neighbors ?? '...'}
          color="var(--color-warning)"
          delay={180}
        />
        <StatCard
          label="Switches"
          value={stats.data?.components?.ryu?.switches ?? '...'}
          color="#2dd4bf"
          delay={240}
        />
      </div>
      )}

      {/* Component Health */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div
          style={{
            flex: '1 1 300px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Component Health</h3>
          {health.data?.components &&
            Object.entries(health.data.components).map(([key, status]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <span style={{ textTransform: 'uppercase', fontSize: 13, fontWeight: 500 }}>
                  {key}
                </span>
                <span
                  style={{
                    color:
                      status === 'up'
                        ? 'var(--color-success)'
                        : status === 'mock'
                          ? 'var(--color-warning)'
                          : 'var(--color-danger)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {status === 'up' ? '● Up' : status === 'mock' ? '◐ Mock' : '○ Down'}
                </span>
              </div>
            ))}
        </div>

        {/* Recent Events */}
        <div
          style={{
            flex: '2 1 400px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Recent Events</h3>
          {events.data?.events?.map((evt) => (
            <div
              key={evt.id}
              style={{
                display: 'flex',
                gap: 12,
                padding: '8px 0',
                borderBottom: '1px solid var(--color-border)',
                fontSize: 13,
              }}
            >
              <span
                style={{
                  color:
                    evt.level === 'error'
                      ? 'var(--color-danger)'
                      : evt.level === 'warning'
                        ? 'var(--color-warning)'
                        : 'var(--color-text-muted)',
                }}
              >
                {evt.level === 'error' ? '🔴' : evt.level === 'warning' ? '🟡' : '🔵'}
              </span>
              <span style={{ color: 'var(--color-text-muted)', minWidth: 60 }}>{evt.component}</span>
              <span>{evt.message}</span>
            </div>
          ))}
          {events.isLoading && <div style={{ color: 'var(--color-text-muted)' }}>Loading...</div>}
        </div>
      </div>

      {/* System Info */}
      {!isLoading && stats.data && (
        <div
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 20,
            fontSize: 13,
            color: 'var(--color-text-muted)',
          }}
        >
          CPU: {stats.data.cpu_usage}% | Memory: {stats.data.memory_usage}% | Uptime:{' '}
          {Math.floor(stats.data.uptime / 3600)}h | API Requests: {stats.data.api_requests_total}
        </div>
      )}

      {health.isError && (
        <ErrorBanner message="Failed to connect to backend. Make sure the API server is running on port 8000." />
      )}
    </div>
  );
}
