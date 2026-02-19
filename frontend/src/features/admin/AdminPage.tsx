import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuditLogs, clearAuditLogs, getUsers, createUserApi, updateUserApi, deleteUserApi, getMe } from '../../api/endpoints';
import { ErrorBanner, SkeletonTable } from '../../components/Shared';
import { useState } from 'react';

/* ── Audit Log Tab ── */
function AuditLogTab() {
  const [filter, setFilter] = useState({ user: '', action: '', resource: '' });
  const [page, setPage] = useState(0);
  const limit = 30;

  const logs = useQuery({
    queryKey: ['audit-logs', filter, page],
    queryFn: () => getAuditLogs({
      limit,
      offset: page * limit,
      ...(filter.user ? { user: filter.user } : {}),
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.resource ? { resource: filter.resource } : {}),
    }).then(r => r.data),
    refetchInterval: 10_000,
  });

  const qc = useQueryClient();
  const clearMut = useMutation({
    mutationFn: () => clearAuditLogs().then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-logs'] }),
  });

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Filter by user..."
          value={filter.user}
          onChange={e => { setFilter(f => ({ ...f, user: e.target.value })); setPage(0); }}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13, width: 140 }}
        />
        <input
          placeholder="Filter by action..."
          value={filter.action}
          onChange={e => { setFilter(f => ({ ...f, action: e.target.value })); setPage(0); }}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13, width: 140 }}
        />
        <input
          placeholder="Filter by resource..."
          value={filter.resource}
          onChange={e => { setFilter(f => ({ ...f, resource: e.target.value })); setPage(0); }}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13, width: 140 }}
        />
        <button
          onClick={() => clearMut.mutate()}
          disabled={clearMut.isPending}
          style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: '1px solid #ef444444', background: '#ef444410', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {clearMut.isPending ? 'Clearing...' : '🗑 Clear All'}
        </button>
      </div>

      {/* Table */}
      {logs.isLoading ? <SkeletonTable rows={8} cols={6} /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                {['Time', 'User', 'Role', 'Action', 'Resource', 'Detail', 'IP'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(logs.data?.entries ?? []).map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>{e.user}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <RoleBadge role={e.role} />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <ActionBadge action={e.action} />
                  </td>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12 }}>{e.resource}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--color-text-muted)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.detail}</td>
                  <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{e.ip}</td>
                </tr>
              ))}
              {(logs.data?.entries ?? []).length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No audit entries</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          Total: {logs.data?.total ?? 0} entries
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={paginationBtnStyle}>← Prev</button>
          <span style={{ fontSize: 12, padding: '4px 8px', color: 'var(--color-text-muted)' }}>Page {page + 1}</span>
          <button disabled={(logs.data?.entries?.length ?? 0) < limit} onClick={() => setPage(p => p + 1)} style={paginationBtnStyle}>Next →</button>
        </div>
      </div>

      {logs.isError && <ErrorBanner message="Failed to load audit logs" />}
    </div>
  );
}

/* ── User Management Tab ── */
function UserManagementTab() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => getUsers().then(r => r.data) });
  const me = useQuery({ queryKey: ['me'], queryFn: () => getMe().then(r => r.data) });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer', display_name: '' });
  const [editUser, setEditUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ role: '', password: '', display_name: '' });

  const createMut = useMutation({
    mutationFn: () => createUserApi(form).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowForm(false); setForm({ username: '', password: '', role: 'viewer', display_name: '' }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ username, data }: { username: string; data: any }) => updateUserApi(username, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditUser(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (username: string) => deleteUserApi(username).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const isAdmin = me.data?.role === 'admin';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          Logged in as <strong>{me.data?.username}</strong> · Role: <RoleBadge role={me.data?.role ?? ''} />
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(!showForm)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--color-primary)', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {showForm ? 'Cancel' : '+ Add User'}
          </button>
        )}
      </div>

      {/* Create user form */}
      {showForm && (
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Username</label>
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inputStyle}>
              <option value="viewer">Viewer</option>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Display Name</label>
            <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} style={inputStyle} />
          </div>
          <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.username || !form.password}
            style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', height: 32 }}>
            {createMut.isPending ? 'Creating...' : 'Create'}
          </button>
          {createMut.isError && <span style={{ color: '#ef4444', fontSize: 12 }}>{(createMut.error as any)?.response?.data?.detail ?? 'Error'}</span>}
        </div>
      )}

      {/* Users table */}
      {users.isLoading ? <SkeletonTable rows={4} cols={4} /> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              {['Username', 'Display Name', 'Role', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(users.data?.users ?? []).map(u => (
              <tr key={u.username} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                  {u.username}
                  {u.username === me.data?.username && <span style={{ fontSize: 10, color: 'var(--color-primary)', marginLeft: 6 }}>(you)</span>}
                </td>
                <td style={{ padding: '8px 10px', color: 'var(--color-text-muted)' }}>{u.display_name}</td>
                <td style={{ padding: '8px 10px' }}>
                  {editUser === u.username ? (
                    <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} style={{ ...inputStyle, width: 100 }}>
                      <option value="viewer">Viewer</option>
                      <option value="operator">Operator</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <RoleBadge role={u.role} />
                  )}
                </td>
                <td style={{ padding: '8px 10px' }}>
                  {isAdmin && u.username !== me.data?.username && (
                    editUser === u.username ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => updateMut.mutate({ username: u.username, data: { role: editForm.role || undefined, password: editForm.password || undefined } })}
                          style={{ ...smallBtnStyle, background: '#22c55e20', color: '#22c55e', borderColor: '#22c55e44' }}>Save</button>
                        <button onClick={() => setEditUser(null)}
                          style={{ ...smallBtnStyle, background: 'var(--color-bg)', color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setEditUser(u.username); setEditForm({ role: u.role, password: '', display_name: u.display_name }); }}
                          style={{ ...smallBtnStyle, background: '#3b82f620', color: '#3b82f6', borderColor: '#3b82f644' }}>Edit</button>
                        <button onClick={() => { if (confirm(`Delete user "${u.username}"?`)) deleteMut.mutate(u.username); }}
                          style={{ ...smallBtnStyle, background: '#ef444420', color: '#ef4444', borderColor: '#ef444444' }}>Delete</button>
                      </div>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {users.isError && <ErrorBanner message="Failed to load users. You may not have admin access." />}
    </div>
  );
}

/* ── Main Page ── */
export default function AdminPage() {
  const [tab, setTab] = useState<'audit' | 'users'>('audit');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Administration</h2>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Audit trail, user management & access control
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[['audit', '📋 Audit Log'], ['users', '👥 Users & Roles']] .map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as any)}
            style={{
              padding: '8px 20px', borderRadius: 8, border: '1px solid ' + (tab === key ? 'var(--color-primary)' : 'var(--color-border)'),
              background: tab === key ? 'var(--color-primary)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--color-text)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'audit' ? <AuditLogTab /> : <UserManagementTab />}
    </div>
  );
}

/* ── Helpers ── */
function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = { admin: '#ef4444', operator: '#f59e0b', viewer: '#3b82f6' };
  const c = colors[role] ?? '#94a3b8';
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 10, background: c + '15', color: c }}>
      {role}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  let color = '#3b82f6';
  if (action.includes('delete') || action.includes('clear')) color = '#ef4444';
  else if (action.includes('create') || action.includes('login')) color = '#22c55e';
  else if (action.includes('update')) color = '#f59e0b';
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: color + '10', color }}>
      {action}
    </span>
  );
}

const paginationBtnStyle: React.CSSProperties = { padding: '4px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 12, cursor: 'pointer' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 };
const inputStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13, width: 140 };
const smallBtnStyle: React.CSSProperties = { padding: '3px 10px', borderRadius: 6, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer' };
