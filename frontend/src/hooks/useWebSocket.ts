import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/appStore';

type WSMessage = {
  type: 'stats' | 'topology' | 'events' | 'pong';
  data?: unknown;
  timestamp?: string;
};

type WSStatus = 'connecting' | 'connected' | 'disconnected';

/** Maximum reconnect delay (60s) */
const MAX_RECONNECT_MS = 60_000;
/** Base reconnect delay (2s) */
const BASE_RECONNECT_MS = 2_000;

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WSStatus>('disconnected');
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);
  const retriesRef = useRef(0);
  const setWsStatus = useAppStore((s) => s.setWsStatus);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    // Vite dev proxy will forward /api/v1/ws
    const url = `${protocol}://${host}:${window.location.port}/api/v1/ws`;

    setStatus('connecting');
    setWsStatus('connecting');
    const socket = new WebSocket(url);

    socket.onopen = () => {
      if (!mountedRef.current) return;
      setStatus('connected');
      setWsStatus('connected');
      retriesRef.current = 0; // Reset backoff on successful connect
      // Send keepalive every 30s
      const ping = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(ping);
        }
      }, 30_000);
      (socket as any)._pingInterval = ping;
    };

    socket.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'stats':
            // Update both query keys so Dashboard + MonitoringPage both get WS data
            queryClient.setQueryData(['monitoring-stats'], msg.data);
            queryClient.setQueryData(['stats'], msg.data);
            break;
          case 'topology':
            queryClient.setQueryData(['topology'], msg.data);
            break;
          case 'events':
            // Update all event queries
            queryClient.setQueriesData({ queryKey: ['events'] }, (old: any) =>
              old ? { ...old, events: msg.data, total: (msg.data as any[]).length } : old,
            );
            break;
          case 'pong':
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    socket.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('disconnected');
      setWsStatus('disconnected');
      clearInterval((socket as any)._pingInterval);
      // Exponential backoff reconnect: 2s, 4s, 8s, 16s, 32s, 60s (max)
      const delay = Math.min(
        BASE_RECONNECT_MS * Math.pow(2, retriesRef.current),
        MAX_RECONNECT_MS,
      );
      retriesRef.current += 1;
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    socket.onerror = () => {
      socket.close();
    };

    ws.current = socket;
  }, [queryClient]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  return { status };
}
