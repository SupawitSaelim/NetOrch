import { NavLink, useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { useState, useEffect } from 'react';
import logo40 from '../../assets/logo-40.png';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  children?: { path: string; label: string; icon: string }[];
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  {
    path: '/topology',
    label: 'Topology',
    icon: '🌐',
    children: [
      { path: '/topology', label: 'Canvas', icon: '🗺️' },
      { path: '/topology/details', label: 'Nodes & Links', icon: '📋' },
    ],
  },
  { path: '/routing', label: 'Routing', icon: '🛣️' },
  { path: '/routers', label: 'Routers', icon: '🔀' },
  { path: '/flows', label: 'SDN Flows', icon: '📡' },
  { path: '/monitoring', label: 'Monitoring', icon: '📈' },
  { path: '/terminal', label: 'Terminal', icon: '💻' },
  { path: '/tools', label: 'Net Tools', icon: '🏓' },
  { path: '/labs', label: 'Labs', icon: '🧪' },
  { path: '/learn', label: 'Learn', icon: '📚' },
  { path: '/advanced', label: 'Advanced', icon: '⚡' },
  { path: '/settings', label: 'Connection', icon: '⚙️' },
  { path: '/admin', label: 'Admin', icon: '🔒' },
];

export default function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const location = useLocation();
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);

  // Auto-expand topology menu when on topology routes
  useEffect(() => {
    if (location.pathname.startsWith('/topology')) setExpandedMenu('/topology');
  }, [location.pathname]);

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
      {/* Sidebar Logo / Branding */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarOpen ? 'flex-start' : 'center',
          gap: 10,
          padding: sidebarOpen ? '8px 20px 20px' : '8px 0 20px',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: 8,
        }}
      >
        <img
          src={logo40}
          alt="NetOrch"
          width={sidebarOpen ? 32 : 28}
          height={sidebarOpen ? 32 : 28}
          style={{ borderRadius: 6, transition: 'all 0.2s ease' }}
        />
        {sidebarOpen && (
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
            NetOrch
          </span>
        )}
      </div>

      {navItems.map((item) => {
        const isTopLevel = !item.children;
        const isExpanded = expandedMenu === item.path;
        const isParentActive = location.pathname.startsWith(item.path) && item.path !== '/';

        if (isTopLevel) {
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
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
          );
        }

        // Menu with children (sub-menu)
        return (
          <div key={item.path}>
            <button
              onClick={() => setExpandedMenu(isExpanded ? null : item.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px', width: '100%', border: 'none', cursor: 'pointer',
                color: isParentActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: 14, fontWeight: isParentActive ? 600 : 400,
                background: isParentActive ? 'rgba(59,130,246,0.1)' : 'transparent',
                borderLeft: isParentActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                transition: 'all 0.15s ease', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {sidebarOpen && (
                <>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  <span style={{ fontSize: 10, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </>
              )}
            </button>
            {sidebarOpen && isExpanded && item.children!.map((child) => (
              <NavLink
                key={child.path}
                to={child.path}
                end
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 20px 9px 44px',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  textDecoration: 'none', fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                  transition: 'all 0.15s ease',
                })}
              >
                <span style={{ fontSize: 14 }}>{child.icon}</span>
                <span>{child.label}</span>
              </NavLink>
            ))}
          </div>
        );
      })}
    </aside>
  );
}
