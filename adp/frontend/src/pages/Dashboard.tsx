import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu, MemoryStick, HardDrive, Wifi, Clock,
  Server, Database, Users, Activity, AlertTriangle,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { monitoringApi, serversApi } from '../lib/api';
import StatusBadge from '../components/ui/StatusBadge';
import { format } from 'date-fns';

interface Metrics {
  cpu: { load: number; cores: number } | null;
  memory: { used: number; total: number; percent: string } | null;
  disk: { fs: string; mount: string; used: number; size: number; percent: number }[] | null;
  network: { iface: string; rx_sec: number; tx_sec: number }[] | null;
  os: { platform: string; distro: string; uptime: number; hostname: string } | null;
}

function fmt(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(2) + ' GB';
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [history, setHistory] = useState<Record<string, number>[]>([]);
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [m, h, p] = await Promise.allSettled([
        monitoringApi.current(),
        monitoringApi.history(6),
        serversApi.list(),
      ]);
      if (m.status === 'fulfilled') setMetrics(m.value.data);
      if (h.status === 'fulfilled') {
        setHistory(h.value.data.map((r: Record<string, unknown>) => ({
          time: format(new Date(r.recorded_at as string), 'HH:mm'),
          cpu: parseFloat(r.cpu as string || '0'),
          mem: r.mem_total ? (Number(r.mem_used) / Number(r.mem_total) * 100) : 0,
        })));
      }
      if (p.status === 'fulfilled') setProjects(p.value.data);
    } catch {
      setError('Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const runningCount = projects.filter((p) => p.status === 'running').length;
  const failedCount = projects.filter((p) => p.status === 'failed').length;

  if (loading) return (
    <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="skeleton h-24 rounded-xl" />
      ))}
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      {error && (
        <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-400/10 border border-amber-400/20 px-4 py-3 rounded-lg">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Cpu size={20} />}
          label="CPU"
          value={metrics?.cpu ? `${metrics.cpu.load.toFixed(1)}%` : '—'}
          sub={metrics?.cpu ? `${metrics.cpu.cores} cores` : 'unavailable'}
          color="text-violet-400"
        />
        <StatCard
          icon={<MemoryStick size={20} />}
          label="Memory"
          value={metrics?.memory ? `${metrics.memory.percent}%` : '—'}
          sub={metrics?.memory ? `${fmt(metrics.memory.used)} / ${fmt(metrics.memory.total)}` : 'unavailable'}
          color="text-cyan-400"
        />
        <StatCard
          icon={<HardDrive size={20} />}
          label="Disk"
          value={metrics?.disk?.[0] ? `${metrics.disk[0].percent?.toFixed(1)}%` : '—'}
          sub={metrics?.disk?.[0] ? `${fmt(metrics.disk[0].used)} / ${fmt(metrics.disk[0].size)}` : 'unavailable'}
          color="text-emerald-400"
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Uptime"
          value={metrics?.os ? fmtUptime(metrics.os.uptime) : '—'}
          sub={metrics?.os?.hostname || 'unavailable'}
          color="text-amber-400"
        />
        <StatCard
          icon={<Server size={20} />}
          label="Running"
          value={String(runningCount)}
          sub={`${projects.length} total projects`}
          color="text-emerald-400"
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="Failed"
          value={String(failedCount)}
          sub="need attention"
          color={failedCount > 0 ? 'text-red-400' : 'text-[var(--text-muted)]'}
        />
        <StatCard
          icon={<Wifi size={20} />}
          label="Network"
          value={metrics?.network?.[0] ? `↓${fmt(metrics.network[0].rx_sec)}/s` : '—'}
          sub={metrics?.network?.[0] ? `↑${fmt(metrics.network[0].tx_sec)}/s` : 'unavailable'}
          color="text-blue-400"
        />
        <StatCard
          icon={<Activity size={20} />}
          label="OS"
          value={metrics?.os?.distro?.split(' ')[0] || '—'}
          sub={metrics?.os?.platform || 'unavailable'}
          color="text-[var(--text-muted)]"
        />
      </div>

      {/* Charts */}
      {history.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard title="CPU Usage %" data={history} dataKey="cpu" color="#818cf8" />
          <ChartCard title="Memory Usage %" data={history} dataKey="mem" color="#22d3ee" />
        </div>
      )}

      {/* Recent projects */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="font-semibold text-sm">Recent Projects</h2>
          <Link to="/servers" className="text-xs text-accent-400 hover:underline">View all</Link>
        </div>
        {projects.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">No projects yet</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {projects.slice(0, 5).map((p) => (
              <div key={p.id as string} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name as string}</p>
                  <p className="text-xs text-[var(--text-muted)]">{p.runtime as string} · port {p.port as string || '—'}</p>
                </div>
                <StatusBadge status={p.status as string} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="text-xl font-bold text-[var(--text)]">{value}</p>
      <p className="text-xs font-medium text-[var(--text-muted)] mt-0.5">{label}</p>
      <p className="text-xs text-[var(--text-muted)] truncate">{sub}</p>
    </div>
  );
}

function ChartCard({ title, data, dataKey, color }: {
  title: string; data: Record<string, number>[]; dataKey: string; color: string;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <h3 className="text-sm font-medium mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} />
          <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8', fontSize: 11 }}
            itemStyle={{ color: color, fontSize: 11 }}
          />
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#g-${dataKey})`} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
