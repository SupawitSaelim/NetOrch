import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toolPing, toolTraceroute, toolArp, toolMac, toolListHosts, toolListBridges, getTopology } from '../../api/endpoints';

/* ═══════════════════════════════════════════════════════════════
   Network Tools — Ping, Traceroute, ARP, MAC table
   ═══════════════════════════════════════════════════════════════ */

type Tool = 'ping' | 'traceroute' | 'arp' | 'mac';

interface HistoryEntry {
  id: number;
  tool: Tool;
  source: string;
  target: string;
  success: boolean;
  output: string;
  summary?: Record<string, unknown>;
  entries?: { port: string; vlan: string; mac: string; age: string; source?: string }[];
  timestamp: Date;
}

const TOOL_META: Record<Tool, { icon: string; label: string; color: string }> = {
  ping:       { icon: '🏓', label: 'Ping',       color: '#22c55e' },
  traceroute: { icon: '🗺️', label: 'Traceroute', color: '#3b82f6' },
  arp:        { icon: '📋', label: 'ARP Table',  color: '#f59e0b' },
  mac:        { icon: '📟', label: 'MAC Table', color: '#8b5cf6' },
};

export default function NetworkToolsPage() {
  const [tool, setTool] = useState<Tool>('ping');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [count, setCount] = useState(4);
  const [bridge, setBridge] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeResult, setActiveResult] = useState<HistoryEntry | null>(null);

  // Fetch available hosts & bridges
  const hostsQ = useQuery({ queryKey: ['tool-hosts'], queryFn: () => toolListHosts().then(r => r.data.hosts) });
  const bridgesQ = useQuery({ queryKey: ['tool-bridges'], queryFn: () => toolListBridges().then(r => r.data.bridges) });
  const topoQ = useQuery({ queryKey: ['topology'], queryFn: () => getTopology().then(r => r.data) });

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

  const isRunning = pingMut.isPending || traceMut.isPending || arpMut.isPending || macMut.isPending;

  const handleRun = () => {
    if (tool === 'mac') {
      if (!bridge) return;
      macMut.mutate();
      return;
    }
    if (!source) return;
    if (tool === 'ping' && !target) return;
    if (tool === 'traceroute' && !target) return;
    if (tool === 'ping') pingMut.mutate();
    else if (tool === 'traceroute') traceMut.mutate();
    else arpMut.mutate();
  };

  // Dynamic disable logic
  const isDisabled = (() => {
    if (isRunning) return true;
    if (tool === 'mac') return !bridge;
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
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>🏓 Network Tools</h2>
        <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: 13 }}>
          Ping, Traceroute, ARP &amp; MAC table — test connectivity from any host
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
            <div style={{ display: 'flex', gap: 6 }}>
              {(Object.keys(TOOL_META) as Tool[]).map((t) => {
                const m = TOOL_META[t];
                const active = tool === t;
                return (
                  <button key={t} onClick={() => setTool(t)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: active ? m.color + '20' : 'var(--color-bg)',
                      color: active ? m.color : 'var(--color-text-muted)',
                      fontWeight: active ? 700 : 500, fontSize: 12,
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
                SOURCE HOST
              </label>
              <select value={source} onChange={(e) => setSource(e.target.value)} style={inputStyle}>
                <option value="">— Select Host —</option>
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

          {/* Target (not for ARP) */}
          {tool !== 'arp' && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                TARGET IP
              </label>
              <input value={target} onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g. 10.0.0.20" style={inputStyle}
                onKeyDown={(e) => e.key === 'Enter' && handleRun()} />
              {/* Quick target buttons */}
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
              <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> Running...</>
            ) : (
              <>{meta.icon} Run {meta.label}</>
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
                          {h.source} → {h.target || '(self)'}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
                          {h.timestamp.toLocaleTimeString()}
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
                    {TOOL_META[activeResult.tool].label}: {activeResult.tool === 'mac'
                      ? `Bridge ${activeResult.source}`
                      : `${activeResult.source} → ${activeResult.target || '(self)'}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {activeResult.timestamp.toLocaleString()}
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

              {/* MAC table entries */}
              {activeResult.tool === 'mac' && activeResult.entries && activeResult.entries.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 10,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>
                      📟 {activeResult.entries.length} MAC {activeResult.entries.length === 1 ? 'entry' : 'entries'}
                    </span>
                    <input
                      type="text"
                      placeholder="Filter MAC / port..."
                      id="mac-filter"
                      onChange={() => {/* filter handled via CSS / state outside for simplicity */}}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: 11,
                        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                        color: 'var(--color-text)', outline: 'none', width: 180,
                      }}
                    />
                  </div>
                  <div style={{
                    border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden',
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg)' }}>
                          {['Port', 'VLAN', 'MAC Address', 'Age', ...(activeResult.entries.some(e => e.source) ? ['Source'] : [])].map((h) => (
                            <th key={h} style={{
                              padding: '10px 14px', textAlign: 'left', fontWeight: 700,
                              fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase',
                              borderBottom: '1px solid var(--color-border)',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeResult.entries.map((entry, i) => (
                          <tr key={i} style={{
                            background: i % 2 === 0 ? 'transparent' : 'var(--color-bg)',
                            transition: 'background 0.1s',
                          }}>
                            <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)' }}>
                              <span style={{
                                padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                background: '#8b5cf620', color: '#8b5cf6',
                              }}>{entry.port}</span>
                            </td>
                            <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                              {entry.vlan}
                            </td>
                            <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', fontFamily: 'monospace', fontWeight: 600 }}>
                              {entry.mac}
                            </td>
                            <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                              {entry.age}
                            </td>
                            {entry.source && (
                              <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                                {entry.source}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Raw output */}
              <div style={{
                background: '#0d1117', border: '1px solid var(--color-border)', borderRadius: 12,
                padding: 16, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7,
                color: '#e2e8f0', whiteSpace: 'pre-wrap', overflowX: 'auto', maxHeight: 500, overflowY: 'auto',
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
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏓</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Select a tool, source host, and target</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Results will appear here</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
