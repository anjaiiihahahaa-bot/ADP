import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Shield, ShieldOff, Key } from 'lucide-react';
import { usersApi } from '../lib/api';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import clsx from 'clsx';

interface User {
  id: string; username: string; email: string;
  role: string; is_active: boolean; totp_enabled: boolean;
  created_at: string; last_login?: string;
}

const ROLES = ['super_admin', 'admin', 'operator', 'user'];
const roleColor: Record<string, string> = {
  super_admin: 'text-red-400 bg-red-400/10',
  admin: 'text-amber-400 bg-amber-400/10',
  operator: 'text-blue-400 bg-blue-400/10',
  user: 'text-[var(--text-muted)] bg-[var(--surface-2)]',
};

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' });

  const load = async () => {
    try {
      const res = await usersApi.list();
      setUsers(res.data);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await usersApi.create(form);
      toast.success('User created');
      setCreating(false);
      setForm({ username: '', email: '', password: '', role: 'user' });
      load();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Create failed');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    try {
      await usersApi.update(editTarget.id, {
        role: editTarget.role,
        is_active: editTarget.is_active,
      });
      toast.success('Updated');
      setEditTarget(null);
      load();
    } catch { toast.error('Update failed'); }
  };

  const toggleActive = async (user: User) => {
    try {
      await usersApi.update(user.id, { is_active: !user.is_active });
      toast.success(user.is_active ? 'User deactivated' : 'User activated');
      load();
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await usersApi.delete(deleteTarget.id);
      toast.success('User deleted');
      setDeleteTarget(null);
      load();
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(false); }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword) return;
    try {
      await usersApi.resetPassword(resetTarget.id, newPassword);
      toast.success('Password reset, all sessions revoked');
      setResetTarget(null);
      setNewPassword('');
    } catch { toast.error('Reset failed'); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">{users.length} users</p>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> New User
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Role</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Last Login</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Status</th>
                  <th className="px-4 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.username}</p>
                      <p className="text-xs text-[var(--text-muted)]">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={clsx('text-xs px-2 py-0.5 rounded font-medium', roleColor[u.role])}>
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)] hidden md:table-cell">
                      {u.last_login ? format(new Date(u.last_login), 'MMM d, HH:mm') : 'Never'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={clsx('text-xs', u.is_active ? 'text-emerald-400' : 'text-red-400')}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {u.totp_enabled && <span className="ml-2 text-xs text-accent-400">2FA</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditTarget({ ...u })} className="icon-btn p-1.5" title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => setResetTarget(u)} className="icon-btn p-1.5" title="Reset password">
                          <Key size={13} />
                        </button>
                        <button onClick={() => toggleActive(u)}
                          className={clsx('icon-btn p-1.5', u.is_active ? 'text-amber-400' : 'text-emerald-400')}
                          title={u.is_active ? 'Deactivate' : 'Activate'}>
                          {u.is_active ? <ShieldOff size={13} /> : <Shield size={13} />}
                        </button>
                        <button onClick={() => setDeleteTarget(u)} className="icon-btn p-1.5 text-red-400" title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create */}
      <Modal open={creating} onClose={() => setCreating(false)} title="New User" size="sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <div><label className="label">Username</label>
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input w-full" /></div>
          <div><label className="label">Email</label>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input w-full" /></div>
          <div><label className="label">Password (min 8 chars)</label>
            <input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input w-full" /></div>
          <div><label className="label">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input w-full">
              {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select></div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </Modal>

      {/* Edit */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit User" size="sm">
        {editTarget && (
          <form onSubmit={handleEdit} className="space-y-4">
            <div><label className="label">Role</label>
              <select value={editTarget.role} onChange={(e) => setEditTarget({ ...editTarget, role: e.target.value })} className="input w-full">
                {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select></div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={editTarget.is_active}
                onChange={(e) => setEditTarget({ ...editTarget, is_active: e.target.checked })} />
              Active
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditTarget(null)} className="btn-ghost">Cancel</button>
              <button type="submit" className="btn-primary">Save</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reset password */}
      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title="Reset Password" size="sm">
        <p className="text-sm text-[var(--text-muted)] mb-3">
          Resetting password for <strong>{resetTarget?.username}</strong> will revoke all their sessions.
        </p>
        <input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          className="input w-full mb-4" placeholder="New password (min 8 chars)" />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setResetTarget(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleResetPassword} className="btn-primary">Reset</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message={`Delete user "${deleteTarget?.username}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger loading={deleting}
      />
    </div>
  );
}
