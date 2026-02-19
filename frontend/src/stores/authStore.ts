import { create } from 'zustand';

interface AuthState {
  token: string | null;
  username: string | null;
  role: string;
  isAuthenticated: boolean;
  login: (token: string, username: string, role?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  username: localStorage.getItem('username'),
  role: localStorage.getItem('role') || 'viewer',
  isAuthenticated: !!localStorage.getItem('token'),
  login: (token, username, role = 'viewer') => {
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    localStorage.setItem('role', role);
    set({ token, username, role, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    set({ token: null, username: null, role: 'viewer', isAuthenticated: false });
  },
}));
