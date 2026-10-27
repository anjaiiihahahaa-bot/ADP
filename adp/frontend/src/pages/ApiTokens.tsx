import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Eye, EyeOff } from 'lucide-react';
import { tokenApi } from '../lib/api';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import clsx from 'clsx';

interface Token {
  id: string; name: string; prefix: string; scopes: string[];
  created_at: string; last_used?: string; expires_at?: string;
}

const ALL_SCOPES = [
  'servers:read', 'servers:write',
  'files:read', 'files:write',
  'databases:read', 'databases:write',
  'monitoring:read',
  'users:read', 'users:write',
  'audit:read',
];

export default function ApiTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Token | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({ name: '', scopes: [] as string[], expires_days: '' });

  const load = async () => {
    try {
      const res = await tokenApi.list();
      setTokens(res.data);
    } catch { toast.error('Failed to load tokens'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleScope = (scope: string) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope],
    }));
  };

  const selectAll = () => setForm((f) => ({ ...f, scopes: f.scopes.length === ALL_SCOPES.length ? [] : [...ALL_SCOPES] }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.scopes.length === 0) {
      toast.error('Name and at least one scope required');
      return;
    }
    try {
      const payload: Record<string, unknown> = { name: form.name, scopes: form.scopes };
      if (form.expires_days) payload.expires_days = parseInt(form.expires_days);
      const res = await tokenApi.create(payload);
      setNewToken(res.data.token);
      setCreating(false);
      setForm({ name: '', scopes: [], expires_days: '' });
      load();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Create failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await tokenApi.revoke(deleteTarget.id);
      toast.success('Token revoked');
      setDeleteTarget(null);
      load();
    } catch { toast.error('Revoke failed'); }
    finally { setDeleting(false); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copied'); };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">{tokens.length} tokens</p>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> New Token
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-muted)] text-sm">No API tokens</div>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div key={t.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{t.name}</p>
                    <span className="text-xs font-mono text-[var(--text-muted)] bg-[var(--surface-2)] px-2 py-0.5 rounded">{t.prefix}…</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.scopes.map((s) => (
                      <span key={s} className="text-xs bg-accent-500/10 text-accent-400 px-1.5 py-0.5 rounded">{s}</span>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    Created {format(new Date(t.created_at), 'MMM d, yyyy')}
                    {t.last_used && ` · Last used ${format(new Date(t.last_used), 'MMM d')}`}
                    {t.expires_at && ` · Expires ${format(new Date(t.expires_at), 'MMM d, yyyy')}`}
                  </p>
                </div>
                <button onClick={() => setDeleteTarget(t)} className="icon-btn p-1.5 text-red-400 flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Create API Token">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">Token name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" placeholder="My app" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Scopes</label>
              <button type="button" onClick={selectAll} className="text-xs text-accent-400 hover:underline">
                {form.scopes.length === ALL_SCOPES.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_SCOPES.map((s) => (
                <label key={s} className={clsx('flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg cursor-pointer border',
                  form.scopes.includes(s) ? 'bg-accent-500/10 border-accent-500/40 text-accent-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]')}>
                  <input type="checkbox" className="hidden" checked={form.scopes.includes(s)} onChange={() => toggleScope(s)} />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Expires in (days, optional)</label>
            <input type="number" min="1" max="365" value={form.expires_days}
              onChange={(e) => setForm({ ...form, expires_days: e.target.value })}
              className="input w-full" placeholder="Never (leave blank)" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      </Modal>

      {/* New token reveal modal */}
      <Modal open={!!newToken} onClose={() => setNewToken('')} title="Token Created — Save Now!" size="sm">
        <div className="bg-amber-400/10 border border-amber-400/30 rounded-lg p-3 mb-4 text-xs text-amber-300">
          This token is shown once. Copy it now.
        </div>
        <div className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-3 py-2 font-mono text-xs break-all">
          <span className="flex-1">{showToken ? newToken : '•'.repeat(Math.min(newToken.length, 40))}</span>
          <button onClick={() => setShowToken(!showToken)} className="icon-btn p-1 flex-shrink-0">
            {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button onClick={() => copy(newToken)} className="icon-btn p-1 flex-shrink-0">
            <Copy size={13} />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => { setNewToken(''); setShowToken(false); }} className="btn-primary">Done</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Revoke Token"
        message={`Revoke token "${deleteTarget?.name}"? Any service using it will lose access.`}
        confirmLabel="Revoke"
        danger loading={deleting}
      />
    </div>
  );
}
