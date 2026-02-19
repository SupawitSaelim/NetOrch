import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../stores/authStore';
import { login as loginApi } from '../../api/endpoints';
import { useState } from 'react';

type Props = { wsStatus?: 'connecting' | 'connected' | 'disconnected' };

const WS_COLORS = {
  connected: 'var(--color-success)',
  connecting: '#f59e0b',
  disconnected: 'var(--color-danger)',
} as const;

const WS_TOOLTIPS: Record<string, string> = {
  connected: 'WebSocket connected — real-time topology & monitoring updates are streaming live',
  connecting: 'WebSocket connecting — attempting to establish real-time connection to backend…',
  disconnected: 'WebSocket disconnected — no live updates, data refreshes on interval only',
};

export default function Header({ wsStatus = 'disconnected' }: Props) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const systemMode = useAppStore((s) => s.systemMode);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const { isAuthenticated, username, logout, login } = useAuthStore();
  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

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
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            fontSize: 16,
            cursor: 'pointer',
            borderRadius: 8,
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        {/* Live WebSocket indicator */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'help', position: 'relative' }}
          title={WS_TOOLTIPS[wsStatus]}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: WS_COLORS[wsStatus],
              display: 'inline-block',
              animation: wsStatus === 'connected' ? 'status-pulse 2s infinite' : undefined,
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            {wsStatus === 'connected' ? 'Live' : wsStatus}
          </span>
        </div>
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
          <button
            onClick={() => setShowLogin(true)}
            style={{
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🔐 Login
          </button>
        )}
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          }}
          onClick={() => setShowLogin(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
              borderRadius: 16, padding: 28, width: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            }}
          >
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>🔐 Login to NetOrch</h3>
            {loginError && (
              <div style={{ background: '#ef444420', border: '1px solid #ef444444', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#ef4444', marginBottom: 12 }}>
                {loginError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Username</label>
                <input
                  autoFocus
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  placeholder="admin"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && document.getElementById('login-pw')?.focus()}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Password</label>
                <input
                  id="login-pw"
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="••••••••"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      setLoginLoading(true); setLoginError('');
                      try {
                        const res = await loginApi(loginForm.username, loginForm.password);
                        login(res.data.access_token, loginForm.username, res.data.role);
                        setShowLogin(false); setLoginForm({ username: '', password: '' });
                      } catch (err: any) {
                        setLoginError(err?.response?.data?.detail ?? 'Login failed');
                      } finally { setLoginLoading(false); }
                    }
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowLogin(false); setLoginError(''); }}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text)',
                }}
              >Cancel</button>
              <button
                disabled={loginLoading || !loginForm.username || !loginForm.password}
                onClick={async () => {
                  setLoginLoading(true); setLoginError('');
                  try {
                    const res = await loginApi(loginForm.username, loginForm.password);
                    login(res.data.access_token, loginForm.username, res.data.role);
                    setShowLogin(false); setLoginForm({ username: '', password: '' });
                  } catch (err: any) {
                    setLoginError(err?.response?.data?.detail ?? 'Login failed');
                  } finally { setLoginLoading(false); }
                }}
                style={{
                  padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: 'var(--color-primary)', border: 'none', color: '#fff',
                  opacity: loginLoading || !loginForm.username || !loginForm.password ? 0.5 : 1,
                }}
              >{loginLoading ? 'Logging in…' : 'Login'}</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
