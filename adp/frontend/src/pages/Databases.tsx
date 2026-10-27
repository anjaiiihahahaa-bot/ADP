import React, { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Copy, Database } from 'lucide-react';
import { dbApi, usersApi } from '../lib/api';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface Db {
  id: string; name: string; owner_id: string;
  engine: string; host: string; port: number;
  db_username: string; created_at: string;
}
interface User { id: string; username: string; }

export default function Databases() {
  const [dbs, setDbs] = useState<Db[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Db | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newCred, setNewCred] = useState<{ password: string; id: string } | null>(null);
  const [form, setForm] = useState({ owner_id: '', name: '' });

  const load = async () => {
    const [d, u] = await Promise.allSettled([dbApi.list(), usersApi.list()]);
    if (d.status === 'fulfilled') setDbs(d.value.data);
    if (u.status === 'fulfilled') setUsers(u.value.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await dbApi.create(form);
      setNewCred({ password: res.data.password, id: res.data.id });
      setCreating(false);
      load();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Create failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await dbApi.delete(deleteTarget.id);
      toast.success('Database deleted');
      setDeleteTarget(null);
      load();
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(false); }
  };

  const handleResetPassword = async (id: string) => {
    try {
      const res = await dbApi.resetPassword(id);
      setNewCred({ password: res.data.password, id });
      toast.success('Password reset');
    } catch { toast.error('Reset failed'); }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">{dbs.length} databases</p>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> New Database
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
      ) : dbs.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-muted)] text-sm">No databases yet</div>
      ) : (
        <div className="space-y-2">
          {dbs.map((db) => (
            <div key={db.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Database size={16} className="text-accent-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{db.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {db.engine} · {db.host}:{db.port} · user: {db.db_username}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Created {format(new Date(db.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleResetPassword(db.id)}
                    className="icon-btn p-1.5 text-xs" title="Reset password"
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(db)}
                    className="icon-btn p-1.5 text-red-400" title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="New Database" size="sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">Owner</label>
            <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} className="input w-full" required>
              <option value="">Select user...</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Name (optional suffix)</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input w-full" placeholder="my-app" />
          </div>
          <p className="text-xs text-[var(--text-muted)]">Credentials will be generated automatically. Save them immediately.</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </Modal>

      {/* Credentials modal */}
      <Modal open={!!newCred} onClose={() => setNewCred(null)} title="Credentials — Save Now!" size="sm">
        <div className="bg-amber-400/10 border border-amber-400/30 rounded-lg p-3 mb-4 text-xs text-amber-300">
          These credentials are shown once. Save them now.
        </div>
        {newCred && (
          <div className="space-y-2 font-mono text-sm">
            {[
              ['Password', newCred.password],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-3 py-2">
                <span className="text-xs text-[var(--text-muted)] w-20 flex-shrink-0">{label}</span>
                <span className="flex-1 truncate text-xs">{val}</span>
                <button onClick={() => copy(val)} className="icon-btn p-1"><Copy size={13} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={() => setNewCred(null)} className="btn-primary">I've saved these</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Database"
        message={`Permanently delete database "${deleteTarget?.name}"? All data will be lost.`}
        confirmLabel="Delete"
        danger loading={deleting}
      />
    </div>
  );
}
