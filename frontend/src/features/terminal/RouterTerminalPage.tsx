import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export default function RouterTerminalPage() {
  const { routerName } = useParams<{ routerName: string }>();
  const termRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [connected, setConnected] = useState(false);
  const [disconnected, setDisconnected] = useState(false);

  const connect = useCallback(() => {
    if (!routerName) return;

    setDisconnected(false);

    // Cleanup previous
    if (wsRef.current) wsRef.current.close();
    if (termInstance.current) termInstance.current.dispose();

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#22c55e',
        selectionBackground: 'rgba(34,197,94,0.3)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e2e8f0',
      },
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    fitAddon.current = fit;
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    if (termRef.current) {
      term.open(termRef.current);
      fit.fit();
    }

    termInstance.current = term;

    // Open WebSocket with netns param — always vtysh
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    const port = window.location.port;
    const url = `${protocol}://${host}:${port}/api/v1/ws/terminal?shell=vtysh&netns=${routerName}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setConnected(true);
      term.focus();
    };

    ws.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(evt.data));
      } else {
        term.write(evt.data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setDisconnected(true);
      term.dispose();
      termInstance.current = null;
    };

    ws.onerror = () => {
      setConnected(false);
      setDisconnected(true);
    };

    wsRef.current = ws;

    // Forward keystrokes to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    term.onBinary((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const buf = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) buf[i] = data.charCodeAt(i);
        ws.send(buf);
      }
    });
  }, [routerName]);

  useEffect(() => {
    connect();

    const handleResize = () => fitAddon.current?.fit();
    window.addEventListener('resize', handleResize);

    // Set page title
    if (routerName) document.title = `${routerName} — CLI`;

    return () => {
      window.removeEventListener('resize', handleResize);
      wsRef.current?.close();
      termInstance.current?.dispose();
    };
  }, [routerName, connect]);

  if (!routerName) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        No router specified.
      </div>
    );
  }

  // Disconnected: clean empty page with reconnect option
  if (disconnected) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#0f172a',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
      }}>
        <div style={{ color: '#64748b', fontSize: 14 }}>
          Connection to <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{routerName}</span> closed.
        </div>
        <button
          onClick={connect}
          style={{
            padding: '8px 24px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)',
            background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: 13,
            fontWeight: 600, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.1)'; }}
        >
          Reconnect
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f172a', overflow: 'hidden' }}>
      {/* Minimal top bar — just router name + status dot */}
      <div style={{
        height: 32, display: 'flex', alignItems: 'center', padding: '0 12px',
        background: '#0f172a', borderBottom: '1px solid rgba(34,197,94,0.15)',
        fontSize: 12, color: '#64748b', gap: 8, userSelect: 'none',
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: connected ? '#22c55e' : '#ef4444',
          boxShadow: connected ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
        }} />
        <span style={{ color: '#94a3b8', fontWeight: 600 }}>{routerName}</span>
        <span style={{ color: '#475569' }}>vtysh</span>
      </div>

      {/* Terminal fills remaining space */}
      <div
        ref={termRef}
        style={{ width: '100%', height: 'calc(100vh - 32px)', overflow: 'hidden' }}
      />
    </div>
  );
}
