import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';

/**
 * Global keyboard shortcuts:
 *   Cmd/Ctrl+K  → Toggle sidebar
 *   Cmd/Ctrl+D  → Dashboard
 *   Cmd/Ctrl+T  → Topology
 *   Cmd/Ctrl+L  → Labs
 *   Cmd/Ctrl+M  → Monitoring
 *   Cmd/Ctrl+\  → Toggle theme
 *   Escape      → Close modals / unfocus
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Don't intercept when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key.toLowerCase()) {
        case 'k':
          e.preventDefault();
          toggleSidebar();
          break;
        case 'd':
          e.preventDefault();
          navigate('/');
          break;
        case 't':
          e.preventDefault();
          navigate('/topology');
          break;
        case 'l':
          e.preventDefault();
          navigate('/labs');
          break;
        case 'm':
          e.preventDefault();
          navigate('/monitoring');
          break;
        case '\\':
          e.preventDefault();
          toggleTheme();
          break;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, toggleSidebar, toggleTheme]);
}
