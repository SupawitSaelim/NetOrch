import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './appStore';

describe('appStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      sidebarOpen: true,
      systemMode: 'dc',
      wsStatus: 'disconnected',
    });
  });

  it('toggleSidebar flips state', () => {
    expect(useAppStore.getState().sidebarOpen).toBe(true);
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarOpen).toBe(false);
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarOpen).toBe(true);
  });

  it('setSystemMode updates mode', () => {
    useAppStore.getState().setSystemMode('wan');
    expect(useAppStore.getState().systemMode).toBe('wan');
    useAppStore.getState().setSystemMode('dc');
    expect(useAppStore.getState().systemMode).toBe('dc');
  });

  it('setWsStatus updates status', () => {
    useAppStore.getState().setWsStatus('connected');
    expect(useAppStore.getState().wsStatus).toBe('connected');
    useAppStore.getState().setWsStatus('connecting');
    expect(useAppStore.getState().wsStatus).toBe('connecting');
  });
});
