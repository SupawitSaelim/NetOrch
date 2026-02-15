import { create } from 'zustand';

interface AppState {
  sidebarOpen: boolean;
  systemMode: 'dc' | 'wan';
  toggleSidebar: () => void;
  setSystemMode: (mode: 'dc' | 'wan') => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  systemMode: 'dc',
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSystemMode: (mode) => set({ systemMode: mode }),
}));
