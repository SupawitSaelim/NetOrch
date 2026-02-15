import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVRFs, createVRF, deleteVRF, configureVRFBGP, getVRFRoutes, login as loginApi } from '../../api/endpoints';
import { SkeletonTable, ErrorBanner, EmptyState } from '../../components/Shared';
import { useAuthStore } from '../../stores/authStore';
import { useState } from 'react';
import type { VRFInfo } from '../../types';

/* ───── style helpers ───── */
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
  padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)',
  padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
};
const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
  borderRadius: 12, padding: 20, position: 'relative',
};

export default function RoutersPage() {
  const queryClient = useQueryClient();
  const { isAuthenticated, login: storeLogin } = useAuthStore();

  // Queries
  const vrfs = useQuery({
    queryKey: ['vrfs'],
    queryFn: () => getVRFs().then((r) => r.data),
    refetchInterval: 15_000,
  });

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showBGP, setShowBGP] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useState<string | null>(null);
  const [loginErr, setLoginErr] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Create VRF form
  const [createName, setCreateName] = useState('');
  const [createTableId, setCreateTableId] = useState('');
  const [createErr, setCreateErr] = useState('');

  // BGP form
  const [bgpAsn, setBgpAsn] = useState('');
  const [bgpRouterId, setBgpRouterId] = useState('');
  const [bgpNetworks, setBgpNetworks] = useState('');
  const [bgpErr, setBgpErr] = useState('');

  // Login form
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('');

  // Mutations
  const createMut = useMutation({
    mutationFn: createVRF,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vrfs'] });
      setShowCreate(false);
      setCreateName('');
      setCreateTableId('');
      setCreateErr('');
    },
    onError: (e: any) => setCreateErr(e?.response?.data?.detail || 'Failed to create VRF'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteVRF,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vrfs'] }),
  });

  const bgpMut = useMutation({
    mutationFn: ({ name, data }: { name: string; data: { asn: number; router_id?: string; networks: string[] } }) =>
      configureVRFBGP(name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vrfs'] });
      setShowBGP(null);
      setBgpErr('');
    },
    onError: (e: any) => setBgpErr(e?.response?.data?.detail || 'Failed to configure BGP'),
  });

  const loginMut = useMutation({
    mutationFn: ({ u, p }: { u: string; p: string }) => loginApi(u, p),
    onSuccess: (res) => {
      storeLogin(res.data.access_token, loginUser);
      setShowLogin(false);
      setLoginErr('');
      pendingAction?.();
      setPendingAction(null);
    },
    onError: () => setLoginErr('Invalid credentials'),
  });

  // Routes query (only when showRoutes is set)
  const routesQuery = useQuery({
    queryKey: ['vrf-routes', showRoutes],
    queryFn: () => getVRFRoutes(showRoutes!).then((r) => r.data),
    enabled: !!showRoutes,
  });

  /* ───── auth gate ───── */
  const requireAuth = (action: () => void) => {
    if (isAuthenticated) { action(); return; }
    setPendingAction(() => action);
    setShowLogin(true);
  };

  const handleCreate = () => {
    if (!createName.trim()) { setCreateErr('Name is required'); return; }
    if (/\s/.test(createName)) { setCreateErr('Name cannot contain spaces'); return; }
    createMut.mutate({
      name: createName.trim(),
      table_id: createTableId ? Number(createTableId) : undefined,
    });
  };

  const handleBGPSubmit = () => {
    if (!bgpAsn || !showBGP) { setBgpErr('ASN is required'); return; }
    bgpMut.mutate({
      name: showBGP,
      data: {
        asn: Number(bgpAsn),
        router_id: bgpRouterId || undefined,
        networks: bgpNetworks ? bgpNetworks.split(',').map((n) => n.trim()).filter(Boolean) : [],
      },
    });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Virtual Routers (VRF)</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
            Manage FRRouting VRF instances — create, configure BGP, view routes
          </p>
        </div>
        <button
          style={btnPrimary}
          onClick={() => requireAuth(() => setShowCreate(true))}
        >
          + Create VRF
        </button>
      </div>

      {/* Status */}
      {vrfs.isLoading && <SkeletonTable rows={3} cols={5} />}
      {vrfs.isError && <ErrorBanner message="Failed to load VRFs" />}

      {/* VRF Cards */}
      {vrfs.data && (
        <>
          {vrfs.data.vrfs.length === 0 && (
            <EmptyState title="No VRFs" description="Create a virtual router to get started" />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {vrfs.data.vrfs.map((vrf: VRFInfo) => (
              <div key={vrf.name} style={cardStyle}>
                {/* Status badge */}
                <span
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    background: vrf.state === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: vrf.state === 'active' ? 'var(--color-success)' : 'var(--color-danger)',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 20,
                  }}
                >
                  {vrf.state}
                </span>

                {/* VRF Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 32 }}>🔀</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{vrf.name}</h3>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Table ID: {vrf.table_id ?? 'auto'}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <div
                    style={{
                      background: 'var(--color-bg)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{vrf.routes}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Routes</div>
                  </div>
                  <div
                    style={{
                      background: 'var(--color-bg)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{vrf.interfaces.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Interfaces</div>
                  </div>
                </div>

                {/* Interfaces */}
                {vrf.interfaces.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>Interfaces</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {vrf.interfaces.map((iface) => (
                        <span
                          key={iface}
                          style={{
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: 11,
                            fontFamily: 'monospace',
                          }}
                        >
                          {iface}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={btnSecondary} onClick={() => setShowRoutes(vrf.name)}>
                    View Routes
                  </button>
                  <button
                    style={btnSecondary}
                    onClick={() => requireAuth(() => { setShowBGP(vrf.name); setBgpAsn(''); setBgpRouterId(''); setBgpNetworks(''); setBgpErr(''); })}
                  >
                    Configure BGP
                  </button>
                  {vrf.name !== 'default' && (
                    <button
                      style={btnDanger}
                      onClick={() =>
                        requireAuth(() => {
                          if (confirm(`Delete VRF "${vrf.name}"?`)) deleteMut.mutate(vrf.name);
                        })
                      }
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ───── Create VRF Modal ───── */}
      {showCreate && (
        <div style={overlay} onClick={() => setShowCreate(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px' }}>Create Virtual Router (VRF)</h3>
            {createErr && <div style={{ color: 'var(--color-danger)', marginBottom: 12, fontSize: 13 }}>{createErr}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>VRF Name *</label>
                <input style={inputStyle} placeholder="e.g. customer-a" value={createName} onChange={(e) => setCreateName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Table ID (optional)</label>
                <input style={inputStyle} type="number" placeholder="Auto-assign" value={createTableId} onChange={(e) => setCreateTableId(e.target.value)} />
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Linux routing table ID. Leave blank for auto.</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button style={btnSecondary} onClick={() => setShowCreate(false)}>Cancel</button>
              <button style={btnPrimary} onClick={handleCreate} disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── BGP Config Modal ───── */}
      {showBGP && (
        <div style={overlay} onClick={() => setShowBGP(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px' }}>Configure BGP — VRF "{showBGP}"</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-muted)' }}>
              Set up BGP routing within this virtual router
            </p>
            {bgpErr && <div style={{ color: 'var(--color-danger)', marginBottom: 12, fontSize: 13 }}>{bgpErr}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>AS Number *</label>
                <input style={inputStyle} type="number" placeholder="65001" value={bgpAsn} onChange={(e) => setBgpAsn(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Router ID</label>
                <input style={inputStyle} placeholder="10.0.0.1" value={bgpRouterId} onChange={(e) => setBgpRouterId(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Networks (comma-separated)</label>
                <input style={inputStyle} placeholder="10.0.0.0/24, 192.168.1.0/24" value={bgpNetworks} onChange={(e) => setBgpNetworks(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button style={btnSecondary} onClick={() => setShowBGP(null)}>Cancel</button>
              <button style={btnPrimary} onClick={handleBGPSubmit} disabled={bgpMut.isPending}>
                {bgpMut.isPending ? 'Configuring...' : 'Apply BGP Config'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Routes Modal ───── */}
      {showRoutes && (
        <div style={overlay} onClick={() => setShowRoutes(null)}>
          <div style={{ ...modal, maxWidth: 640, maxHeight: '70vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px' }}>Routes — VRF "{showRoutes}"</h3>
            {routesQuery.isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Loading routes...</p>}
            {routesQuery.isError && <p style={{ color: 'var(--color-danger)' }}>Failed to load routes</p>}
            {routesQuery.data && (
              <div>
                {routesQuery.data.total === 0 && routesQuery.data.routes_raw ? (
                  <pre
                    style={{
                      background: 'var(--color-bg)',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    {routesQuery.data.routes_raw}
                  </pre>
                ) : (
                  <pre
                    style={{
                      background: 'var(--color-bg)',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(routesQuery.data.routes, null, 2)}
                  </pre>
                )}
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                  Total entries: {routesQuery.data.total}
                </p>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={btnSecondary} onClick={() => setShowRoutes(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Login Modal ───── */}
      {showLogin && (
        <div style={overlay} onClick={() => setShowLogin(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px' }}>🔐 Authentication Required</h3>
            {loginErr && <div style={{ color: 'var(--color-danger)', marginBottom: 12, fontSize: 13 }}>{loginErr}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input style={inputStyle} placeholder="Username" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} />
              <input style={inputStyle} type="password" placeholder="Password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loginMut.mutate({ u: loginUser, p: loginPass })} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button style={btnSecondary} onClick={() => setShowLogin(false)}>Cancel</button>
              <button style={btnPrimary} onClick={() => loginMut.mutate({ u: loginUser, p: loginPass })} disabled={loginMut.isPending}>
                {loginMut.isPending ? 'Logging in...' : 'Login'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
