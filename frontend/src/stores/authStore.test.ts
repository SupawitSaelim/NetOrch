import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      token: null,
      username: null,
      role: 'viewer',
      isAuthenticated: false,
    });
  });

  it('starts unauthenticated', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.username).toBeNull();
  });

  it('login sets token/username/role and persists to localStorage', () => {
    useAuthStore.getState().login('tok123', 'admin', 'admin');
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('tok123');
    expect(state.username).toBe('admin');
    expect(state.role).toBe('admin');
    expect(localStorage.getItem('token')).toBe('tok123');
    expect(localStorage.getItem('username')).toBe('admin');
    expect(localStorage.getItem('role')).toBe('admin');
  });

  it('logout clears state and localStorage', () => {
    useAuthStore.getState().login('tok', 'user');
    useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('defaults role to viewer', () => {
    useAuthStore.getState().login('tok', 'user');
    expect(useAuthStore.getState().role).toBe('viewer');
  });
});
