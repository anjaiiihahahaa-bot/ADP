import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Play, Square, RotateCcw, Trash2, Settings, ExternalLink } from 'lucide-react';
import { serversApi } from '../lib/api';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import toast from 'react-hot-toast';

interface Project {
  id: string; name: string; description?: string;
  runtime: string; status: string; port?: number;
  domain?: string; created_at: string; pid?: number;
}

const RUNTIMES = ['nodejs', 'python', 'php', 'static', 'custom'];

export default function Servers() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: '', description: '', runtime: 'nodejs',
    start_command: '', port: '', domain: '',
    env_vars: '', max_restarts: '5', restart_policy: 'on-failure',
  });

  const load = async () => {
    try {
      const res = await serversApi.list();
      setProjects(res.data);
    } catch { toast.error('Failed to load servers'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading((prev) => ({ ...prev, [id]: action }));
    try {
      await serversApi[action](id);
      toast.success(`${action} initiated`);
      setTimeout(load, 2000);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || `${action} failed`);
    } finally {
      setActionLoading((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let env_vars: Record<string, string> = {};
      if (form.env_vars.trim()) {
        form.env_vars.split('\n').forEach((line) => {
          const [k, ...v] = line.split('=');
          if (k && v.length) env_vars[k.trim()] = v.join('=').trim();
        });
      }
      await serversApi.create({
        name: form.name, description: form.description, runtime: form.runtime,
        start_command: form.start_command, port: form.port ? parseInt(form.port) : undefined,
        domain: form.domain || undefined, env_vars,
        max_restarts: parseInt(form.max_restarts), restart_policy: form.restart_policy,
      });
      toast.success('Project created');
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
      await serversApi.delete(deleteTarget.id, true);
      toast.success('Project deleted');
      setDeleteTarget(null);
      load();
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(false); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">{projects.length} projects</p>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> New Project
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <p className="text-sm">No projects yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => {
            const busy = actionLoading[p.id];
            return (
              <div key={p.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{p.name}</span>
                      <StatusBadge status={p.status} />
                      <span className="text-xs bg-[var(--surface-2)] px-2 py-0.5 rounded text-[var(--text-muted)]">{p.runtime}</span>
                      {p.port && <span className="text-xs text-[var(--text-muted)]">:{p.port}</span>}
                    </div>
                    {p.description && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{p.description}</p>}
                    {p.pid && <p className="text-xs text-[var(--text-muted)]">PID: {p.pid}</p>}
                  </div>
                  {p.domain && (
                    <a href={`https://${p.domain}`} target="_blank" rel="noreferrer"
                      className="text-[var(--text-muted)] hover:text-accent-400">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <ActionBtn
                    onClick={() => handleAction(p.id, 'start')}
                    loading={busy === 'start'}
                    disabled={p.status === 'running' || !!busy}
                    icon={<Play size={13} />}
                    label="Start"
                    color="text-emerald-400 hover:bg-emerald-400/10"
                  />
                  <ActionBtn
                    onClick={() => handleAction(p.id, 'stop')}
                    loading={busy === 'stop'}
                    disabled={p.status === 'stopped' || !!busy}
                    icon={<Square size={13} />}
                    label="Stop"
                    color="text-amber-400 hover:bg-amber-400/10"
                  />
                  <ActionBtn
                    onClick={() => handleAction(p.id, 'restart')}
                    loading={busy === 'restart'}
                    disabled={!!busy}
                    icon={<RotateCcw size={13} />}
                    label="Restart"
                    color="text-blue-400 hover:bg-blue-400/10"
                  />
                  <Link
                    to={`/files?project=${p.id}`}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                  >
                    <Settings size={13} /> Files
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(p)}
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 hover:bg-red-400/10"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="New Project" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Name *">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input" placeholder="my-api" />
            </Field>
            <Field label="Runtime *">
              <select value={form.runtime} onChange={(e) => setForm({ ...form, runtime: e.target.value })} className="input">
                {RUNTIMES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Start Command">
            <input value={form.start_command} onChange={(e) => setForm({ ...form, start_command: e.target.value })}
              className="input font-mono text-xs" placeholder="node dist/index.js" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Port">
              <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })}
                className="input" placeholder="3000" />
            </Field>
            <Field label="Domain">
              <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}
                className="input" placeholder="app.example.com" />
            </Field>
          </div>
          <Field label="Environment Variables (KEY=VALUE, one per line)">
            <textarea value={form.env_vars} onChange={(e) => setForm({ ...form, env_vars: e.target.value })}
              className="input font-mono text-xs h-24 resize-none" placeholder={"NODE_ENV=production\nPORT=3000"} />
          </Field>
          <Field label="Description">
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input" placeholder="Optional" />
          </Field>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary">Create Project</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Project"
        message={`Delete "${deleteTarget?.name}" and all its files? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}

function ActionBtn({ onClick, loading, disabled, icon, label, color }: {
  onClick: () => void; loading: boolean; disabled: boolean;
  icon: React.ReactNode; label: string; color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs disabled:opacity-40 ${color}`}
    >
      {loading ? <span className="animate-spin">⟳</span> : icon} {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
