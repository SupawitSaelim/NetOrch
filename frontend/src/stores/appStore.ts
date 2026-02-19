import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface AppState {
  sidebarOpen: boolean;
  systemMode: 'dc' | 'wan';
  theme: Theme;
  toggleSidebar: () => void;
  setSystemMode: (mode: 'dc' | 'wan') => void;
  toggleTheme: () => void;
}

const savedTheme = (localStorage.getItem('netorch-theme') as Theme) || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  systemMode: 'dc',
  theme: savedTheme,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSystemMode: (mode) => set({ systemMode: mode }),
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('netorch-theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return { theme: next };
    }),
}));
