import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFlows, getSwitches, addFlow, deleteFlow, login as loginApi } from '../../api/endpoints';
import { SkeletonTable, ErrorBanner } from '../../components/Shared';
import { useAuthStore } from '../../stores/authStore';
import { useState, useMemo } from 'react';

/* ───── style helpers ───── */
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
const modal: React.CSSProperties = {
  background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
  borderRadius: 12, padding: 24, minWidth: 380, maxWidth: 540,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13,
  border: '1px solid var(--color-border)', background: 'var(--color-bg)',
  color: 'var(--color-text)', boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = {
  background: 'var(--color-primary)', color: '#fff', border: 'none',
  padding: '8px 20px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13,
};
const btnSecondary: React.CSSProperties = {
  ...btnPrimary, background: 'transparent', border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
};
const btnDanger: React.CSSProperties = {
  background: 'var(--color-danger)', color: '#fff', border: 'none',
  padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
};

/* helper: format match dict into readable pills */
const MatchPills = ({ match }: { match: Record<string, unknown> }) => (
  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
    {Object.entries(match).map(([k, v]) => (
      <span key={k} style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
        fontFamily: 'monospace', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
      }}>
        {v === true || v === 'true' ? k : `${k}=${v}`}
      </span>
    ))}
    {Object.keys(match).length === 0 && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>any</span>}
  </div>
);

/* helper: format actions list */
const formatAction = (a: any) => typeof a === 'string' ? a : `${a.type ?? ''}${a.port !== undefined && a.port !== '' ? ':' + a.port : ''}`;

export default function FlowsPage() {
  const queryClient = useQueryClient();
  const { isAuthenticated, login: storeLogin } = useAuthStore();

  /* ─── data queries ─── */
  const flows = useQuery({
    queryKey: ['flows'],
    queryFn: () => getFlows().then((r) => r.data),
    refetchInterval: 10_000,
  });
  const switches = useQuery({
    queryKey: ['switches'],
    queryFn: () => getSwitches().then((r) => r.data),
    refetchInterval: 15_000,
  });

  /* ─── selected switch ─── */
  const [selectedSw, setSelectedSw] = useState<string | null>(null);

  /* auto-select first switch when data arrives */
  const swList = switches.data?.switches ?? [];
  const activeSw = selectedSw ?? swList[0]?.dpid ?? null;

  /* flows for selected switch */
  const filteredFlows = useMemo(() => {
    if (!activeSw || !flows.data?.flows) return [];
    return flows.data.flows.filter((f) => f.dpid === activeSw);
  }, [activeSw, flows.data]);

  /* flow count per switch */
  const flowCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    (flows.data?.flows ?? []).forEach((f) => {
      map[f.dpid] = (map[f.dpid] || 0) + 1;
    });
    return map;
  }, [flows.data]);

  /* ─── modals ─── */
  const [showAdd, setShowAdd] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginErr, setLoginErr] = useState('');

  /* add-flow form state */
  const [addPriority, setAddPriority] = useState('100');
  const [addMatchStr, setAddMatchStr] = useState('');
  const [addActionsStr, setAddActionsStr] = useState('');
  const [addErr, setAddErr] = useState('');

  /* login form state */
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('');

  /* ─── mutations ─── */
  const addMut = useMutation({
    mutationFn: addFlow,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['flows'] }); setShowAdd(false); setAddErr(''); },
    onError: (e: any) => setAddErr(e?.response?.data?.detail || 'Failed to add flow'),
  });
  const delMut = useMutation({
    mutationFn: deleteFlow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
  });
  const loginMut = useMutation({
    mutationFn: ({ u, p }: { u: string; p: string }) => loginApi(u, p),
    onSuccess: (res) => {
      storeLogin(res.data.access_token, loginUser, res.data.role);
      setShowLogin(false); setShowAdd(true); setLoginErr('');
    },
    onError: () => setLoginErr('Invalid credentials'),
  });

  /* ─── parse helpers ─── */
  const parseMatch = (s: string): Record<string, unknown> => {
    const m: Record<string, unknown> = {};
    s.split(',').forEach((part) => {
      const [k, v] = part.split('=').map((x) => x.trim());
      if (k && v !== undefined) m[k] = v !== '' && !isNaN(Number(v)) ? Number(v) : v;
    });
    return m;
  };
  const parseActions = (s: string): Record<string, unknown>[] =>
    s.split(',').map((tok) => {
      const t = tok.trim();
      if (t.startsWith('OUTPUT:')) return { type: 'OUTPUT', port: Number(t.split(':')[1]) };
      if (t === 'DROP') return { type: 'DROP' };
      if (t === 'NORMAL') return { type: 'NORMAL' };
      if (t === 'FLOOD') return { type: 'FLOOD' };
      const [type, ...rest] = t.split(':');
      return { type, ...(rest.length ? { port: Number(rest[0]) } : {}) };
    });

  const handleAdd = () => {
    if (!activeSw) { setAddErr('No switch selected'); return; }
    if (!addActionsStr.trim()) { setAddErr('Actions required'); return; }
    addMut.mutate({
      dpid: activeSw,
      priority: Number(addPriority) || 100,
      match: parseMatch(addMatchStr),
      actions: parseActions(addActionsStr),
    });
  };

  const handleDelete = (id: string) => {
    if (!isAuthenticated) { setShowLogin(true); return; }
    if (confirm(`Delete flow ${id}?`)) delMut.mutate(id);
  };

  const openAddModal = () => {
    if (!isAuthenticated) { setShowLogin(true); return; }
    setAddErr('');
    setAddMatchStr('');
    setAddActionsStr('');
    setAddPriority('100');
    setShowAdd(true);
  };

  /* find selected switch object */
  const activeSwObj = swList.find((s) => s.dpid === activeSw);

  /* ─── RENDER ─── */
  return (
    <div style={{ display: 'flex', gap: 20, minHeight: 0 }}>

      {/* ===== LEFT: Switch Selector Panel ===== */}
      <div style={{ width: 240, flexShrink: 0 }}>
        <div style={{
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
          borderRadius: 12, padding: 16,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Switches
          </h3>

          {switches.isLoading && <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</div>}

          {swList.length === 0 && !switches.isLoading && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No switches found</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {swList.map((sw) => {
              const isActive = sw.dpid === activeSw;
              const flowCt = flowCountMap[sw.dpid] || 0;
              return (
                <button
                  key={sw.dpid}
                  onClick={() => setSelectedSw(sw.dpid)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: isActive ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: isActive ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-bg)',
                    transition: 'all .15s', textAlign: 'left', width: '100%',
                  }}
                >
                  {/* switch icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? 'var(--color-primary)' : 'var(--color-border)', color: isActive ? '#fff' : 'var(--color-text)',
                    fontSize: 16, fontWeight: 700, flexShrink: 0,
                  }}>
                    ⬡
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sw.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                      <span>{sw.ports.length} ports</span>
                      <span>·</span>
                      <span>{flowCt} flow{flowCt !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  {/* status dot */}
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: sw.connected ? 'var(--color-success)' : 'var(--color-danger)',
                  }} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== RIGHT: Flow Table for Selected Switch ===== */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Header bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
              {activeSwObj ? `${activeSwObj.name}` : 'SDN Flows'}
            </h2>
            {activeSwObj && (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {activeSwObj.controller || 'No controller'} · {activeSwObj.ports.length} ports · {filteredFlows.length} flow rules
              </div>
            )}
          </div>
          <button style={btnPrimary} onClick={openAddModal} disabled={!activeSw}>
            + Add Flow
          </button>
        </div>

        {/* Port info */}
        {activeSwObj && activeSwObj.ports.length > 0 && (
          <div className="fade-in" style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 16,
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginRight: 4 }}>Ports:</span>
            {activeSwObj.ports.map((p) => (
              <span key={p.port_no} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace',
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{p.port_no}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                {p.name}
              </span>
            ))}
          </div>
        )}

        {/* Loading / Error / Empty */}
        {flows.isLoading && <SkeletonTable rows={4} cols={5} />}
        {flows.isError && <ErrorBanner message="Failed to load flow data." />}

        {/* Flow Table */}
        {!flows.isLoading && !flows.isError && (
          <div className="fade-in" style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            {filteredFlows.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>No Flow Rules</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 340, margin: '0 auto' }}>
                  {activeSwObj
                    ? `${activeSwObj.name} has no OpenFlow rules yet. Click "+ Add Flow" to create one.`
                    : 'Select a switch from the left panel.'}
                </div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: 0.3 }}>Priority</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: 0.3 }}>Match</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: 0.3 }}>→ Actions</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: 0.3, textAlign: 'right' }}>Packets</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: 0.3, textAlign: 'right' }}>Bytes</th>
                    <th style={{ padding: '10px 12px', width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredFlows
                    .sort((a, b) => b.priority - a.priority)
                    .map((f) => (
                      <tr key={f.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 4,
                            fontWeight: 700, fontSize: 12, fontFamily: 'monospace',
                            background: f.priority >= 200 ? 'color-mix(in srgb, var(--color-warning) 15%, transparent)' : 'var(--color-bg)',
                            border: '1px solid var(--color-border)',
                          }}>
                            {f.priority}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <MatchPills match={f.match} />
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {f.actions.map((a: any, i: number) => (
                              <span key={i} style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
                                background: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
                                color: 'var(--color-text)',
                              }}>
                                {formatAction(a)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {f.packet_count.toLocaleString()}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {f.byte_count.toLocaleString()}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button style={btnDanger} onClick={() => handleDelete(f.id)} disabled={delMut.isPending}>
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ===== Login Modal ===== */}
      {showLogin && (
        <div style={overlay} onClick={() => setShowLogin(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>🔐 Login Required</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Authentication required to manage flows.
            </p>
            {loginErr && <div style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{loginErr}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input style={inputStyle} placeholder="Username" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} />
              <input style={inputStyle} type="password" placeholder="Password" value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loginMut.mutate({ u: loginUser, p: loginPass })}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button style={btnSecondary} onClick={() => setShowLogin(false)}>Cancel</button>
                <button style={btnPrimary} onClick={() => loginMut.mutate({ u: loginUser, p: loginPass })} disabled={loginMut.isPending}>
                  {loginMut.isPending ? 'Logging in…' : 'Login'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Add Flow Modal ===== */}
      {showAdd && (
        <div style={overlay} onClick={() => setShowAdd(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              Add Flow Rule
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Switch: <strong>{activeSwObj?.name}</strong>
            </p>
            {addErr && <div style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{addErr}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <label style={{ fontSize: 13, fontWeight: 500 }}>Priority
                <input style={{ ...inputStyle, marginTop: 4 }} type="number" value={addPriority} onChange={(e) => setAddPriority(e.target.value)} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 500 }}>Match
                <input style={{ ...inputStyle, marginTop: 4 }} placeholder="in_port=1,ip  or  arp" value={addMatchStr} onChange={(e) => setAddMatchStr(e.target.value)} />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Examples: <code style={{ background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 3 }}>in_port=1,ip</code>{' '}
                  <code style={{ background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 3 }}>arp</code>{' '}
                  <code style={{ background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 3 }}>in_port=2,eth_type=2048</code>
                </div>
              </label>

              <label style={{ fontSize: 13, fontWeight: 500 }}>Actions
                <input style={{ ...inputStyle, marginTop: 4 }} placeholder="OUTPUT:2  or  FLOOD" value={addActionsStr} onChange={(e) => setAddActionsStr(e.target.value)} />
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Examples: <code style={{ background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 3 }}>OUTPUT:2</code>{' '}
                  <code style={{ background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 3 }}>FLOOD</code>{' '}
                  <code style={{ background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 3 }}>DROP</code>{' '}
                  <code style={{ background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 3 }}>NORMAL</code>
                </div>
              </label>

              {/* Port reference */}
              {activeSwObj && activeSwObj.ports.length > 0 && (
                <div style={{
                  background: 'var(--color-bg)', borderRadius: 8, padding: '10px 12px',
                  border: '1px solid var(--color-border)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>PORT REFERENCE</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {activeSwObj.ports.map((p) => (
                      <span key={p.port_no} style={{ fontSize: 12, fontFamily: 'monospace' }}>
                        <strong style={{ color: 'var(--color-primary)' }}>{p.port_no}</strong>
                        <span style={{ color: 'var(--color-text-muted)' }}>=</span>{p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button style={btnSecondary} onClick={() => setShowAdd(false)}>Cancel</button>
                <button style={btnPrimary} onClick={handleAdd} disabled={addMut.isPending}>
                  {addMut.isPending ? 'Adding…' : 'Add Flow'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
