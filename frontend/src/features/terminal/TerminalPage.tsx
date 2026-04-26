import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

type Shell = 'vtysh' | 'bash';

export default function TerminalPage() {
  const termRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [shell, setShell] = useState<Shell>('vtysh');
  const [connected, setConnected] = useState(false);

  const connect = (selectedShell: Shell) => {
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
        cursor: '#3b82f6',
        selectionBackground: 'rgba(59,130,246,0.3)',
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
    term.writeln(`\x1b[1;34m● Connecting to VM (${selectedShell})...\x1b[0m\r\n`);

    // Open WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    const port = window.location.port;
    const token = localStorage.getItem('token');
    const url = `${protocol}://${host}:${port}/api/v1/ws/terminal?shell=${selectedShell}&token=${token}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setConnected(true);
      term.writeln(`\x1b[1;32m● Connected!\x1b[0m\r\n`);
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
      term.writeln(`\r\n\x1b[1;31m● Disconnected\x1b[0m`);
    };

    ws.onerror = () => {
      term.writeln(`\r\n\x1b[1;31m● Connection error\x1b[0m`);
    };

    wsRef.current = ws;

    // Forward keystrokes to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    // Handle binary input (paste, etc.)
    term.onBinary((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const buf = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) buf[i] = data.charCodeAt(i);
        ws.send(buf);
      }
    });
  };

  useEffect(() => {
    connect(shell);

    const handleResize = () => fitAddon.current?.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      wsRef.current?.close();
      termInstance.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShellChange = (newShell: Shell) => {
    setShell(newShell);
    connect(newShell);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Terminal</h2>
        <div style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
          {(['vtysh', 'bash'] as Shell[]).map((s) => (
            <button
              key={s}
              onClick={() => handleShellChange(s)}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: shell === s ? 'var(--color-primary)' : 'var(--color-bg-card)',
                color: shell === s ? '#fff' : 'var(--color-text)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connected ? 'var(--color-success)' : 'var(--color-danger)',
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'var(--color-text-muted)' }}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <button
            onClick={() => connect(shell)}
            style={{
              marginLeft: 8,
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card)',
              color: 'var(--color-text)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reconnect
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={termRef}
        style={{
          flex: 1,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          background: '#0f172a',
        }}
      />

      {/* Help bar */}
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: 'var(--color-text-muted)',
          display: 'flex',
          gap: 16,
        }}
      >
        <span>💡 <b>vtysh</b>: Cisco-like CLI — <code>show ip route</code>, <code>show ip bgp summary</code>, <code>configure terminal</code></span>
        <span>💡 <b>bash</b>: Linux shell — <code>ovs-vsctl show</code>, <code>ip addr</code>, <code>ping</code></span>
      </div>
    </div>
  );
}
