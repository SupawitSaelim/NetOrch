import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../stores/authStore';

export default function Header() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const systemMode = useAppStore((s) => s.systemMode);
  const { isAuthenticated, username, logout } = useAuthStore();

  return (
    <header
      style={{
        height: 56,
        background: 'var(--color-bg-card)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={toggleSidebar}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text)',
            fontSize: 20,
            cursor: 'pointer',
          }}
        >
          ☰
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          🔷 NetOrch
        </h1>
        <span
          style={{
            background: systemMode === 'dc' ? '#3b82f6' : '#f59e0b',
            color: '#fff',
            padding: '2px 10px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {systemMode} mode
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {isAuthenticated ? (
          <>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
              {username}
            </span>
            <button
              onClick={logout}
              style={{
                background: 'var(--color-danger)',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Not logged in
          </span>
        )}
      </div>
    </header>
  );
}
