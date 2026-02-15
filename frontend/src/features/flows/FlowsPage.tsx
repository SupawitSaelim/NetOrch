import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFlows, getSwitches, addFlow, deleteFlow, login as loginApi } from '../../api/endpoints';
import { SkeletonTable, ErrorBanner, EmptyState } from '../../components/Shared';
import { useAuthStore } from '../../stores/authStore';
import { useState } from 'react';

/* ───── inline modal style helpers ───── */
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
const modal: React.CSSProperties = {
  background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
  borderRadius: 12, padding: 24, minWidth: 360, maxWidth: 520,
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
const btnDanger: React.CSSProperties = {
  background: 'var(--color-danger)', color: '#fff', border: 'none',
  padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
};

export default function FlowsPage() {
  const queryClient = useQueryClient();
  const { isAuthenticated, login: storeLogin } = useAuthStore();

  // data queries
  const flows = useQuery({
    queryKey: ['flows'],
    queryFn: () => getFlows().then((r) => r.data),
    refetchInterval: 15_000,
  });
  const switches = useQuery({
    queryKey: ['switches'],
    queryFn: () => getSwitches().then((r) => r.data),
    refetchInterval: 15_000,
  });

  // modals
  const [showAdd, setShowAdd] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginErr, setLoginErr] = useState('');

  // add-flow form state
  const [addDpid, setAddDpid] = useState('');
  const [addPriority, setAddPriority] = useState('100');
  const [addMatchStr, setAddMatchStr] = useState('');
  const [addActionsStr, setAddActionsStr] = useState('OUTPUT:1');
  const [addErr, setAddErr] = useState('');

  // login form state
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('');

  // mutations
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
      storeLogin(res.data.access_token, loginUser);
      setShowLogin(false);
      setShowAdd(true);
      setLoginErr('');
    },
    onError: () => setLoginErr('Invalid credentials'),
  });

  /* parse user-friendly match/actions strings */
  const parseMatch = (s: string): Record<string, unknown> => {
    const m: Record<string, unknown> = {};
    s.split(',').forEach((part) => {
      const [k, v] = part.split('=').map((x) => x.trim());
      if (k && v) m[k] = isNaN(Number(v)) ? v : Number(v);
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
    if (!addDpid) { setAddErr('Select a switch'); return; }
    addMut.mutate({
      dpid: addDpid,
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
    setAddDpid(switches.data?.switches[0]?.dpid || '');
    setShowAdd(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>SDN Flows</h2>
        <button style={btnPrimary} onClick={openAddModal}>+ Add Flow</button>
      </div>

      {flows.isLoading && <SkeletonTable rows={4} cols={5} />}
      {flows.isError && <ErrorBanner message="Failed to load flow data." />}
      {!flows.isLoading && !flows.isError && !flows.data?.flows?.length && (
        <EmptyState icon="🔄" title="No flows" description="No OpenFlow rules found. Click + Add Flow to create one." />
      )}

      {/* Switches */}
      {!switches.isLoading && (
        <div className="fade-in" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Switches</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {switches.data?.switches.map((sw) => (
              <div key={sw.dpid} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, minWidth: 200 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{sw.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{sw.dpid}</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>
                  <span style={{ color: sw.connected ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
                    {sw.connected ? '● Connected' : '○ Disconnected'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Ports: {sw.ports.length}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flow Table */}
      {(flows.data?.flows?.length ?? 0) > 0 && (
        <div className="fade-in" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Flow Rules {flows.data && `(${flows.data.total})`}
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>ID</th>
                <th style={{ padding: 8 }}>Switch</th>
                <th style={{ padding: 8 }}>Priority</th>
                <th style={{ padding: 8 }}>Match</th>
                <th style={{ padding: 8 }}>Actions</th>
                <th style={{ padding: 8 }}>Packets</th>
                <th style={{ padding: 8 }}>Bytes</th>
                <th style={{ padding: 8, width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {flows.data?.flows.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 8, fontFamily: 'monospace', color: 'var(--color-primary)' }}>{f.id}</td>
                  <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>{f.dpid}</td>
                  <td style={{ padding: 8 }}>{f.priority}</td>
                  <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>
                    {Object.entries(f.match).map(([k, v]) => `${k}=${v}`).join(', ')}
                  </td>
                  <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>
                    {f.actions.map((a: any, i: number) => {
                      const label = typeof a === 'string' ? a : `${a.type ?? ''}${a.port ? ':' + a.port : ''}`;
                      return <span key={i}>{i > 0 ? ', ' : ''}{label}</span>;
                    })}
                  </td>
                  <td style={{ padding: 8 }}>{f.packet_count.toLocaleString()}</td>
                  <td style={{ padding: 8 }}>{f.byte_count.toLocaleString()}</td>
                  <td style={{ padding: 8 }}>
                    <button style={btnDanger} onClick={() => handleDelete(f.id)} disabled={delMut.isPending}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Login Modal */}
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
              <input style={inputStyle} type="password" placeholder="Password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loginMut.mutate({ u: loginUser, p: loginPass })} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button style={{ ...btnPrimary, background: 'var(--color-border)' }} onClick={() => setShowLogin(false)}>Cancel</button>
                <button style={btnPrimary} onClick={() => loginMut.mutate({ u: loginUser, p: loginPass })} disabled={loginMut.isPending}>
                  {loginMut.isPending ? 'Logging in…' : 'Login'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Flow Modal */}
      {showAdd && (
        <div style={overlay} onClick={() => setShowAdd(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>➕ Add Flow Rule</h3>
            {addErr && <div style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{addErr}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13 }}>Switch (DPID)
                <select style={{ ...inputStyle, marginTop: 4 }} value={addDpid} onChange={(e) => setAddDpid(e.target.value)}>
                  {switches.data?.switches.map((sw) => (
                    <option key={sw.dpid} value={sw.dpid}>{sw.name} ({sw.dpid})</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>Priority
                <input style={{ ...inputStyle, marginTop: 4 }} type="number" value={addPriority} onChange={(e) => setAddPriority(e.target.value)} />
              </label>
              <label style={{ fontSize: 13 }}>Match (comma-separated, e.g. <code>in_port=1,eth_type=2048</code>)
                <input style={{ ...inputStyle, marginTop: 4 }} placeholder="in_port=1,eth_type=2048" value={addMatchStr} onChange={(e) => setAddMatchStr(e.target.value)} />
              </label>
              <label style={{ fontSize: 13 }}>Actions (comma-separated, e.g. <code>OUTPUT:2</code>)
                <input style={{ ...inputStyle, marginTop: 4 }} placeholder="OUTPUT:2" value={addActionsStr} onChange={(e) => setAddActionsStr(e.target.value)} />
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button style={{ ...btnPrimary, background: 'var(--color-border)' }} onClick={() => setShowAdd(false)}>Cancel</button>
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
