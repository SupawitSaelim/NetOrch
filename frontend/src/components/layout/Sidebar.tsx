import { NavLink } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/topology', label: 'Topology', icon: '🌐' },
  { path: '/routing', label: 'Routing', icon: '🛣️' },
  { path: '/flows', label: 'SDN Flows', icon: '📡' },
  { path: '/monitoring', label: 'Monitoring', icon: '📈' },
];

export default function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  return (
    <aside
      style={{
        width: sidebarOpen ? 220 : 64,
        minHeight: '100vh',
        background: 'var(--color-bg-sidebar)',
        borderRight: '1px solid var(--color-border)',
        transition: 'width 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 16,
      }}
    >
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 20px',
            color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: isActive ? 600 : 400,
            background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
            borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
            transition: 'all 0.15s ease',
          })}
        >
          <span style={{ fontSize: 18 }}>{item.icon}</span>
          {sidebarOpen && <span>{item.label}</span>}
        </NavLink>
      ))}
    </aside>
  );
}
