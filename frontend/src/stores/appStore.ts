import { create } from 'zustand';

type Theme = 'dark' | 'light';
type WSStatus = 'connecting' | 'connected' | 'disconnected';

interface AppState {
  sidebarOpen: boolean;
  systemMode: 'dc' | 'wan';
  theme: Theme;
  wsStatus: WSStatus;
  toggleSidebar: () => void;
  setSystemMode: (mode: 'dc' | 'wan') => void;
  toggleTheme: () => void;
  setWsStatus: (status: WSStatus) => void;
}

const savedTheme = (localStorage.getItem('netorch-theme') as Theme) || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  systemMode: 'dc',
  theme: savedTheme,
  wsStatus: 'disconnected',
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSystemMode: (mode) => set({ systemMode: mode }),
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('netorch-theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return { theme: next };
    }),
  setWsStatus: (status) => set({ wsStatus: status }),
}));
