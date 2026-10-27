import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { auditApi } from '../lib/api';
import { format } from 'date-fns';
import clsx from 'clsx';

interface AuditLog {
  id: string; action: string; resource_type: string;
  resource_id?: string; user_id: string; username?: string;
  ip_address?: string; details?: unknown; created_at: string;
}

const RESOURCE_TYPES = ['', 'project', 'file', 'database', 'user', 'api_token', 'auth', 'backup'];
const ACTION_COLORS: Record<string, string> = {
  create: 'text-emerald-400', delete: 'text-red-400', update: 'text-amber-400',
  login: 'text-blue-400', logout: 'text-[var(--text-muted)]', start: 'text-emerald-400',
  stop: 'text-amber-400', restart: 'text-blue-400', upload: 'text-accent-400',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action: '', resource_type: '' });
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditApi.list({
        page, limit,
        action: filters.action || undefined,
        resource_type: filters.resource_type || undefined,
      });
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch {}
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.ceil(total / limit);

  const getActionColor = (action: string) => {
    const key = Object.keys(ACTION_COLORS).find((k) => action.toLowerCase().includes(k));
    return key ? ACTION_COLORS[key] : 'text-[var(--text)]';
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="text-[var(--text-muted)] flex-shrink-0" />
          <input
            value={filters.action}
            onChange={(e) => { setFilters((f) => ({ ...f, action: e.target.value })); setPage(1); }}
            className="bg-transparent outline-none text-sm flex-1"
            placeholder="Filter by action..."
          />
        </div>
        <select
          value={filters.resource_type}
          onChange={(e) => { setFilters((f) => ({ ...f, resource_type: e.target.value })); setPage(1); }}
          className="input py-2"
        >
          {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t || 'All resources'}</option>)}
        </select>
        <p className="text-xs text-[var(--text-muted)] ml-auto">{total} entries</p>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
        ) : logs.length === 0 ? (
          <p className="text-center py-12 text-sm text-[var(--text-muted)]">No audit logs</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                  <th className="text-left px-4 py-3">Time</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">Action</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Resource</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">IP</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                    <td className="px-4 py-2.5 text-xs text-[var(--text-muted)] whitespace-nowrap">
                      {format(new Date(log.created_at), 'MMM d HH:mm:ss')}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{log.username || log.user_id.slice(0, 8)}</td>
                    <td className={clsx('px-4 py-2.5 text-xs font-medium', getActionColor(log.action))}>
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-muted)] hidden sm:table-cell">
                      <span className="bg-[var(--surface-2)] px-1.5 py-0.5 rounded">{log.resource_type}</span>
                      {log.resource_id && <span className="ml-1 opacity-60">{log.resource_id.slice(0, 8)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-muted)] font-mono hidden md:table-cell">
                      {log.ip_address || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-muted)] hidden lg:table-cell max-w-[200px]">
                      {log.details ? (
                        <span className="truncate block">{JSON.stringify(log.details).slice(0, 60)}</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-xs text-[var(--text-muted)]">Page {page} of {pages}</p>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => setPage(page - 1)} className="icon-btn p-1.5 disabled:opacity-40">
              <ChevronLeft size={15} />
            </button>
            <button disabled={page === pages} onClick={() => setPage(page + 1)} className="icon-btn p-1.5 disabled:opacity-40">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
