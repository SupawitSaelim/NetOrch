import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useAppStore } from '../../stores/appStore';
import { useEffect, useState } from 'react';

export default function Layout() {
  const { status: wsStatus } = useWebSocket();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useKeyboardShortcuts();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-close sidebar on mobile
  useEffect(() => {
    if (isMobile && sidebarOpen) toggleSidebar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <div style={{
        ...(isMobile ? {
          position: 'fixed',
          left: sidebarOpen ? 0 : -240,
          top: 0,
          bottom: 0,
          zIndex: 50,
          transition: 'left 0.25s ease',
        } : {}),
      }}>
        <Sidebar />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header wsStatus={wsStatus} />
        <main className="fade-in" style={{ flex: 1, padding: isMobile ? 12 : 24, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
