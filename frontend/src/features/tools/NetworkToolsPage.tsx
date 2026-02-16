import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  toolPing, toolTraceroute, toolArp, toolMac, toolCapture,
  toolListHosts, toolListBridges, toolListInterfaces, getTopology,
} from '../../api/endpoints';

/* ═══════════════════════════════════════════════════════════════
   Network Tools — Ping, Traceroute, ARP, MAC, Packet Capture
   ═══════════════════════════════════════════════════════════════ */

type Tool = 'ping' | 'traceroute' | 'arp' | 'mac' | 'capture';

interface CapturePacket {
  raw: string; timestamp?: string; src_mac?: string; dst_mac?: string;
  ethertype?: string; src_ip?: string; dst_ip?: string;
  protocol: string; length?: number; info: string;
}

interface HistoryEntry {
  id: number;
  tool: Tool;
  source: string;
  target: string;
  success: boolean;
  output: string;
  summary?: Record<string, unknown>;
  entries?: { port: string; vlan: string; mac: string; age: string; source?: string }[];
  packets?: CapturePacket[];
  timestamp: Date;
}

const TOOL_META: Record<Tool, { icon: string; label: string; color: string }> = {
  ping:       { icon: '🏓', label: 'Ping',       color: '#22c55e' },
  traceroute: { icon: '🗺️', label: 'Traceroute', color: '#3b82f6' },
  arp:        { icon: '📋', label: 'ARP Table',  color: '#f59e0b' },
  mac:        { icon: '📟', label: 'MAC Table',  color: '#8b5cf6' },
  capture:    { icon: '🦈', label: 'Capture',    color: '#ef4444' },
};

const PROTO_COLORS: Record<string, string> = {
  ICMP: '#22c55e', TCP: '#3b82f6', UDP: '#f59e0b',
  ARP: '#a855f7', STP: '#6b7280', LLDP: '#64748b', other: '#94a3b8',
};

export default function NetworkToolsPage() {
  const [tool, setTool] = useState<Tool>('ping');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [count, setCount] = useState(4);
  const [bridge, setBridge] = useState('');
  // Capture-specific state
  const [captureIface, setCaptureIface] = useState('any');
  const [captureFilter, setCaptureFilter] = useState('');
  const [captureCount, setCaptureCount] = useState(20);
  const [captureTimeout, setCaptureTimeout] = useState(10);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeResult, setActiveResult] = useState<HistoryEntry | null>(null);

  // Fetch available hosts & bridges
  const hostsQ = useQuery({ queryKey: ['tool-hosts'], queryFn: () => toolListHosts().then(r => r.data.hosts) });
  const bridgesQ = useQuery({ queryKey: ['tool-bridges'], queryFn: () => toolListBridges().then(r => r.data.bridges) });
  const topoQ = useQuery({ queryKey: ['topology'], queryFn: () => getTopology().then(r => r.data) });

  // Fetch interfaces for selected source (capture mode)
  const ifaceQ = useQuery({
    queryKey: ['tool-interfaces', source],
    queryFn: () => toolListInterfaces(source || undefined).then(r => r.data.interfaces),
    enabled: tool === 'capture',
  });

  // Reset interface when source changes
  useEffect(() => { setCaptureIface('any'); }, [source]);

  // Build source options: netns hosts + topology hosts
  const hostOptions = (() => {
    const set = new Set<string>();
    hostsQ.data?.forEach(h => set.add(h));
    topoQ.data?.nodes?.filter(n => n.type === 'host').forEach(n => set.add(n.name));
    return [...set].sort();
  })();

  // Get IPs for quick target selection
  const hostIPs = (() => {
    const map: Record<string, string> = {};
    topoQ.data?.nodes?.forEach(n => {
      if (n.metadata?.ip) map[n.name] = n.metadata.ip as string;
    });
    return map;
  })();

  const addToHistory = (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    const newEntry: HistoryEntry = { ...entry, id: Date.now(), timestamp: new Date() };
    setHistory(prev => [newEntry, ...prev].slice(0, 50));
    setActiveResult(newEntry);
  };

  // Mutations
  const pingMut = useMutation({
    mutationFn: () => toolPing({ source, target, count }),
    onSuccess: (r) => addToHistory({ tool: 'ping', source, target, success: r.data.success, output: r.data.output, summary: r.data.summary as Record<string, unknown> }),
    onError: (e: any) => addToHistory({ tool: 'ping', source, target, success: false, output: e?.response?.data?.detail ?? e.message }),
  });

  const traceMut = useMutation({
    mutationFn: () => toolTraceroute({ source, target }),
    onSuccess: (r) => addToHistory({ tool: 'traceroute', source, target, success: r.data.success, output: r.data.output }),
    onError: (e: any) => addToHistory({ tool: 'traceroute', source, target, success: false, output: e?.response?.data?.detail ?? e.message }),
  });

  const arpMut = useMutation({
    mutationFn: () => toolArp({ source }),
    onSuccess: (r) => addToHistory({ tool: 'arp', source, target: '', success: r.data.success, output: r.data.output }),
    onError: (e: any) => addToHistory({ tool: 'arp', source, target: '', success: false, output: e?.response?.data?.detail ?? e.message }),
  });

  const macMut = useMutation({
    mutationFn: () => toolMac({ bridge }),
    onSuccess: (r) => addToHistory({ tool: 'mac', source: bridge, target: '', success: r.data.success, output: r.data.output, entries: r.data.entries }),
    onError: (e: any) => addToHistory({ tool: 'mac', source: bridge, target: '', success: false, output: e?.response?.data?.detail ?? e.message }),
  });

  const captureMut = useMutation({
    mutationFn: () => toolCapture({ source, interface: captureIface, filter: captureFilter, count: captureCount, timeout: captureTimeout }),
    onSuccess: (r) => addToHistory({
      tool: 'capture', source: source || '(vm-root)', target: `${captureIface} ${captureFilter}`.trim(),
      success: r.data.success, output: r.data.output, packets: r.data.packets,
      summary: r.data.summary as Record<string, unknown>,
    }),
    onError: (e: any) => addToHistory({
      tool: 'capture', source: source || '(vm-root)', target: captureIface,
      success: false, output: e?.response?.data?.detail ?? e.message,
    }),
  });

  const isRunning = pingMut.isPending || traceMut.isPending || arpMut.isPending || macMut.isPending || captureMut.isPending;

  const handleRun = () => {
    if (tool === 'mac') { if (!bridge) return; macMut.mutate(); return; }
    if (tool === 'capture') { captureMut.mutate(); return; }
    if (!source) return;
    if (tool === 'ping' && !target) return;
    if (tool === 'traceroute' && !target) return;
    if (tool === 'ping') pingMut.mutate();
    else if (tool === 'traceroute') traceMut.mutate();
    else arpMut.mutate();
  };

  const isDisabled = (() => {
    if (isRunning) return true;
    if (tool === 'mac') return !bridge;
    if (tool === 'capture') return false;
    if (tool === 'arp') return !source;
    return !source || !target;
  })();

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px', borderRadius: 10, fontSize: 13,
    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
    color: 'var(--color-text)', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const meta = TOOL_META[tool];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>🛠️ Network Tools</h2>
        <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: 13 }}>
          Ping, Traceroute, ARP, MAC table &amp; Packet Capture
        </p>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Left: Controls ── */}
        <div style={{
          width: 340, minWidth: 340, background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)', borderRadius: 14, padding: 20,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Tool selector */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>TOOL</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(TOOL_META) as Tool[]).map((t) => {
                const m = TOOL_META[t];
                const active = tool === t;
                return (
                  <button key={t} onClick={() => setTool(t)}
                    style={{
                      flex: '1 1 60px', padding: '10px 6px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: active ? m.color + '20' : 'var(--color-bg)',
                      color: active ? m.color : 'var(--color-text-muted)',
                      fontWeight: active ? 700 : 500, fontSize: 11,
                      outline: active ? `2px solid ${m.color}40` : 'none',
                      transition: 'all 0.15s',
                    }}>
                    {m.icon}<br />{m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Source (hide for MAC table) */}
          {tool !== 'mac' && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                {tool === 'capture' ? 'NAMESPACE (optional)' : 'SOURCE HOST'}
              </label>
              <select value={source} onChange={(e) => setSource(e.target.value)} style={inputStyle}>
                <option value="">{tool === 'capture' ? '— VM Root —' : '— Select Host —'}</option>
                {hostOptions.map((h) => (
                  <option key={h} value={h}>{h}{hostIPs[h] ? ` (${hostIPs[h]})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Bridge selector (MAC table only) */}
          {tool === 'mac' && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                OVS BRIDGE
              </label>
              <select value={bridge} onChange={(e) => setBridge(e.target.value)} style={inputStyle}>
                <option value="">— Select Bridge —</option>
                {(bridgesQ.data ?? []).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              {bridgesQ.isLoading && (
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>Loading bridges...</div>
              )}
              {bridgesQ.data?.length === 0 && !bridgesQ.isLoading && (
                <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>No OVS bridges found</div>
              )}
            </div>
          )}

          {/* Capture-specific fields */}
          {tool === 'capture' && (
            <>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                  INTERFACE
                </label>
                <select value={captureIface} onChange={(e) => setCaptureIface(e.target.value)} style={inputStyle}>
                  <option value="any">any (all interfaces)</option>
                  {(ifaceQ.data ?? []).filter(i => i.name !== 'lo').map((iface) => (
                    <option key={iface.name} value={iface.name}>
                      {iface.name} ({iface.state}{iface.addresses.length > 0 ? ` — ${iface.addresses[0]}` : ''})
                    </option>
                  ))}
                </select>
                {ifaceQ.isLoading && (
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>Loading interfaces...</div>
                )}
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                  BPF FILTER (optional)
                </label>
                <input value={captureFilter} onChange={(e) => setCaptureFilter(e.target.value)}
                  placeholder='e.g. "icmp", "port 80", "host 10.0.0.1"' style={inputStyle}
                  onKeyDown={(e) => e.key === 'Enter' && handleRun()} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {['icmp', 'arp', 'tcp', 'udp', 'port 80', 'not arp'].map((f) => (
                    <button key={f} onClick={() => setCaptureFilter(f)}
                      style={{
                        padding: '2px 8px', borderRadius: 6, border: '1px solid var(--color-border)',
                        fontSize: 10, cursor: 'pointer',
                        background: captureFilter === f ? '#ef444420' : 'var(--color-bg)',
                        color: captureFilter === f ? '#ef4444' : 'var(--color-text-muted)',
                      }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                    PACKETS
                  </label>
                  <input type="number" min={1} max={100} value={captureCount}
                    onChange={(e) => setCaptureCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                    style={{ ...inputStyle, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                    TIMEOUT (s)
                  </label>
                  <input type="number" min={1} max={30} value={captureTimeout}
                    onChange={(e) => setCaptureTimeout(Math.min(30, Math.max(1, Number(e.target.value))))}
                    style={{ ...inputStyle, width: '100%' }} />
                </div>
              </div>
            </>
          )}

          {/* Target (ping/traceroute only) */}
          {(tool === 'ping' || tool === 'traceroute') && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                TARGET IP
              </label>
              <input value={target} onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g. 10.0.0.20" style={inputStyle}
                onKeyDown={(e) => e.key === 'Enter' && handleRun()} />
              {Object.keys(hostIPs).length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                  {Object.entries(hostIPs)
                    .filter(([name]) => name !== source)
                    .map(([name, ip]) => (
                      <button key={name} onClick={() => setTarget(ip.split('/')[0])}
                        style={{
                          padding: '3px 8px', borderRadius: 6, border: '1px solid var(--color-border)',
                          fontSize: 10, cursor: 'pointer', background: target === ip.split('/')[0] ? meta.color + '20' : 'var(--color-bg)',
                          color: target === ip.split('/')[0] ? meta.color : 'var(--color-text-muted)',
                        }}>
                        {name} ({ip.split('/')[0]})
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Count (ping only) */}
          {tool === 'ping' && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                COUNT
              </label>
              <input type="number" min={1} max={20} value={count}
                onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                style={{ ...inputStyle, width: 80 }} />
            </div>
          )}

          {/* Run button */}
          <button onClick={handleRun}
            disabled={isDisabled}
            style={{
              padding: '12px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: meta.color, color: '#fff', fontSize: 14, fontWeight: 700,
              opacity: isDisabled ? 0.4 : 1,
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            {isRunning ? (
              <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> {tool === 'capture' ? 'Capturing...' : 'Running...'}</>
            ) : (
              <>{meta.icon} {tool === 'capture' ? 'Start Capture' : `Run ${meta.label}`}</>
            )}
          </button>

          {/* History */}
          {history.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, display: 'block' }}>
                HISTORY ({history.length})
              </label>
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {history.map((h) => {
                  const hm = TOOL_META[h.tool];
                  const isActive = activeResult?.id === h.id;
                  return (
                    <button key={h.id} onClick={() => setActiveResult(h)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                        borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                        background: isActive ? hm.color + '15' : 'transparent',
                        transition: 'all 0.15s',
                      }}>
                      <span style={{ fontSize: 12 }}>{hm.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text)' }}>
                          {h.tool === 'capture' ? `${h.source} @ ${h.target}` : `${h.source} → ${h.target || '(self)'}`}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
                          {h.timestamp.toLocaleTimeString()}
                          {h.tool === 'capture' && h.packets ? ` · ${h.packets.length} pkts` : ''}
                        </div>
                      </div>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: h.success ? '#22c55e' : '#ef4444',
                      }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Output ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeResult ? (
            <div>
              {/* Result header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
                padding: '14px 18px', borderRadius: 12,
                background: activeResult.success ? '#22c55e10' : '#ef444410',
                border: `1px solid ${activeResult.success ? '#22c55e30' : '#ef444430'}`,
              }}>
                <span style={{ fontSize: 24 }}>{TOOL_META[activeResult.tool].icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {activeResult.tool === 'mac'
                      ? `MAC Table: Bridge ${activeResult.source}`
                      : activeResult.tool === 'capture'
                        ? `Capture: ${activeResult.source} @ ${activeResult.target}`
                        : `${TOOL_META[activeResult.tool].label}: ${activeResult.source} → ${activeResult.target || '(self)'}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {activeResult.timestamp.toLocaleString()}
                    {activeResult.tool === 'capture' && activeResult.packets
                      ? ` · ${activeResult.packets.length} packets`
                      : ''}
                  </div>
                </div>
                <span style={{
                  padding: '4px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: activeResult.success ? '#22c55e20' : '#ef444420',
                  color: activeResult.success ? '#22c55e' : '#ef4444',
                }}>
                  {activeResult.success ? '✓ Success' : '✗ Failed'}
                </span>
              </div>

              {/* Ping summary cards */}
              {activeResult.tool === 'ping' && activeResult.summary && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Transmitted', value: activeResult.summary.transmitted, color: '#3b82f6' },
                    { label: 'Received', value: activeResult.summary.received, color: '#22c55e' },
                    { label: 'Loss', value: activeResult.summary.loss_pct != null ? `${activeResult.summary.loss_pct}%` : '—', color: Number(activeResult.summary.loss_pct) > 0 ? '#ef4444' : '#22c55e' },
                    { label: 'Avg RTT', value: activeResult.summary.rtt_avg != null ? `${activeResult.summary.rtt_avg} ms` : '—', color: '#f59e0b' },
                    { label: 'Min RTT', value: activeResult.summary.rtt_min != null ? `${activeResult.summary.rtt_min} ms` : '—', color: '#22c55e' },
                    { label: 'Max RTT', value: activeResult.summary.rtt_max != null ? `${activeResult.summary.rtt_max} ms` : '—', color: '#ef4444' },
                  ].map((s) => (
                    <div key={s.label} style={{
                      flex: '1 1 100px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                      borderRadius: 10, padding: '12px 14px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{String(s.value ?? '—')}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Capture summary cards */}
              {activeResult.tool === 'capture' && activeResult.summary && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Captured', value: activeResult.summary.captured ?? activeResult.packets?.length ?? 0, color: '#ef4444' },
                    { label: 'Received', value: activeResult.summary.received ?? '—', color: '#3b82f6' },
                    { label: 'Dropped', value: activeResult.summary.dropped ?? 0, color: Number(activeResult.summary.dropped) > 0 ? '#f59e0b' : '#22c55e' },
                  ].map((s) => (
                    <div key={s.label} style={{
                      flex: '1 1 100px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                      borderRadius: 10, padding: '12px 14px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{String(s.value ?? '—')}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                  {/* Protocol breakdown */}
                  {activeResult.packets && activeResult.packets.length > 0 && (() => {
                    const protos: Record<string, number> = {};
                    activeResult.packets!.forEach(p => { protos[p.protocol] = (protos[p.protocol] || 0) + 1; });
                    return Object.entries(protos).sort((a, b) => b[1] - a[1]).map(([proto, cnt]) => (
                      <div key={proto} style={{
                        flex: '1 1 80px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                        borderRadius: 10, padding: '12px 14px', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: PROTO_COLORS[proto] || '#94a3b8' }}>{cnt}</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>{proto}</div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* Capture packet table */}
              {activeResult.tool === 'capture' && activeResult.packets && activeResult.packets.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>
                    🦈 {activeResult.packets.length} {activeResult.packets.length === 1 ? 'packet' : 'packets'} captured
                  </div>
                  <div style={{
                    border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden',
                    maxHeight: 420, overflowY: 'auto',
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                          {['#', 'Time', 'Protocol', 'Source', 'Destination', 'Length', 'Info'].map((h) => (
                            <th key={h} style={{
                              padding: '8px 10px', textAlign: 'left', fontWeight: 700,
                              fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase',
                              borderBottom: '1px solid var(--color-border)',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeResult.packets.map((pkt, i) => {
                          const protoColor = PROTO_COLORS[pkt.protocol] || PROTO_COLORS.other;
                          return (
                            <tr key={i} style={{
                              background: i % 2 === 0 ? 'transparent' : 'var(--color-bg)',
                              cursor: 'default',
                            }} title={pkt.raw}>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: 10 }}>
                                {i + 1}
                              </td>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: 10, color: 'var(--color-text-muted)' }}>
                                {pkt.timestamp || '—'}
                              </td>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)' }}>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                                  background: protoColor + '20', color: protoColor,
                                }}>{pkt.protocol}</span>
                              </td>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: 10 }}>
                                {pkt.src_ip || pkt.src_mac || '—'}
                              </td>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: 10 }}>
                                {pkt.dst_ip || pkt.dst_mac || '—'}
                              </td>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: 10, color: 'var(--color-text-muted)' }}>
                                {pkt.length ?? '—'}
                              </td>
                              <td style={{
                                padding: '6px 10px', borderBottom: '1px solid var(--color-border)',
                                fontSize: 10, color: 'var(--color-text-muted)',
                                maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {pkt.info}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* MAC table entries */}
              {activeResult.tool === 'mac' && activeResult.entries && activeResult.entries.length > 0 && (() => {
                const hasEndpoint = activeResult.entries.some((e: any) => e.endpoint && e.endpoint !== '—');
                const hasPortName = activeResult.entries.some((e: any) => e.port_name);
                const hasSource = activeResult.entries.some((e: any) => e.source);
                const headers = ['Port', ...(hasPortName ? ['Port Name'] : []), ...(hasEndpoint ? ['Endpoint'] : []), 'VLAN', 'MAC Address', 'Age', ...(hasSource ? ['Source'] : [])];
                return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>
                    📟 {activeResult.entries.length} MAC {activeResult.entries.length === 1 ? 'entry' : 'entries'}
                  </div>
                  <div style={{
                    border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden',
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg)' }}>
                          {headers.map((h) => (
                            <th key={h} style={{
                              padding: '10px 14px', textAlign: 'left', fontWeight: 700,
                              fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase',
                              borderBottom: '1px solid var(--color-border)',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeResult.entries.map((entry: any, i: number) => (
                          <tr key={i} style={{
                            background: i % 2 === 0 ? 'transparent' : 'var(--color-bg)',
                          }}>
                            <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)' }}>
                              <span style={{
                                padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                background: '#8b5cf620', color: '#8b5cf6',
                              }}>{entry.port}</span>
                            </td>
                            {hasPortName && (
                              <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-muted)' }}>
                                {entry.port_name || '—'}
                              </td>
                            )}
                            {hasEndpoint && (
                              <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)' }}>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                  background: '#22c55e20', color: '#22c55e',
                                }}>{entry.endpoint || '—'}</span>
                              </td>
                            )}
                            <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                              {entry.vlan}
                            </td>
                            <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', fontFamily: 'monospace', fontWeight: 600 }}>
                              {entry.mac}
                            </td>
                            <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                              {entry.age}
                            </td>
                            {hasSource && (
                              <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                                {entry.source || ''}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                );
              })()}

              {/* Raw output */}
              <div style={{
                background: '#0d1117', border: '1px solid var(--color-border)', borderRadius: 12,
                padding: 16, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7,
                color: '#e2e8f0', whiteSpace: 'pre-wrap', overflowX: 'auto', maxHeight: 400, overflowY: 'auto',
              }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>RAW OUTPUT</div>
                {activeResult.output || activeResult.summary?.toString() || 'No output'}
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: 400, color: 'var(--color-text-muted)', textAlign: 'center',
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🛠️</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Select a tool and configure parameters</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Results will appear here</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
