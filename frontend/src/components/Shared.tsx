/**
 * Reusable UI components: Skeleton, ErrorBanner, EmptyState
 */

export function Skeleton({ width = '100%', height = 14, style }: {
  width?: string | number; height?: number; style?: React.CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      style={{ width, height, ...style }}
    />
  );
}

export function SkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-card" style={{ flex: '1 1 200px' }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12 }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height={16} style={{ flex: 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="fade-in"
      style={{
        padding: '16px 20px',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 12,
        color: '#ef4444',
        fontSize: 14,
        textAlign: 'center',
      }}
    >
      ⚠ {message}
    </div>
  );
}

export function EmptyState({ icon = '📭', title, description }: {
  icon?: string; title: string; description?: string;
}) {
  return (
    <div
      className="fade-in"
      style={{
        padding: 40,
        textAlign: 'center',
        color: 'var(--color-text-muted)',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {description && <div style={{ fontSize: 13 }}>{description}</div>}
    </div>
  );
}
