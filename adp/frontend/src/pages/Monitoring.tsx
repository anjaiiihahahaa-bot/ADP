import React, { useState, useEffect, useRef } from 'react';
import { Cpu, HardDrive, MemoryStick, Network, Clock, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { monitoringApi } from '../lib/api';
import { format } from 'date-fns';
import clsx from 'clsx';

interface Metric {
  cpu_usage: number; mem_used: number; mem_total: number;
  disk_used: number; disk_total: number;
  net_rx: number; net_tx: number;
  uptime: number; load_avg: number[];
  os_name?: string; hostname?: string;
  processes?: { pid: number; name: string; cpu: number; mem: number }[];
}

interface HistPoint { timestamp: string; cpu_usage: number; mem_used: number; mem_total: number; }

const RANGES = [
  { label: '1h', value: 60 },
  { label: '6h', value: 360 },
  { label: '24h', value: 1440 },
  { label: '7d', value: 10080 },
];

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={clsx('text-[var(--text-muted)]', color)}>{icon}</span>
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

function pct(used: number, total: number) {
  if (!total) return 0;
  return Math.round((used / total) * 100);
}

function fmtBytes(gb: number) {
  if (gb >= 1) return gb.toFixed(1) + ' GB';
  return (gb * 1024).toFixed(0) + ' MB';
}

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Monitoring() {
  const [current, setCurrent] = useState<Metric | null>(null);
  const [history, setHistory] = useState<HistPoint[]>([]);
  const [range, setRange] = useState(60);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadCurrent = async () => {
    try {
      const res = await monitoringApi.current();
      setCurrent(res.data);
    } catch {}
  };

  const loadHistory = async (mins: number) => {
    try {
      const to = new Date();
      const from = new Date(to.getTime() - mins * 60 * 1000);
      const res = await monitoringApi.history(from.toISOString(), to.toISOString());
      setHistory(res.data);
    } catch {}
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.allSettled([loadCurrent(), loadHistory(range)]);
      setLoading(false);
    })();
  }, [range]);

  useEffect(() => {
    intervalRef.current = setInterval(loadCurrent, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const chartData = history.map((h) => ({
    time: format(new Date(h.timestamp), range > 1440 ? 'MM/dd HH:mm' : 'HH:mm'),
    CPU: Math.round(h.cpu_usage || 0),
    RAM: pct(h.mem_used || 0, h.mem_total || 1),
  }));

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Refresh + range */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          {RANGES.map((r) => (
            <button key={r.value} onClick={() => setRange(r.value)}
              className={clsx('px-3 py-1.5 text-xs font-medium', range === r.value ? 'bg-accent-500 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]')}>
              {r.label}
            </button>
          ))}
        </div>
        <button onClick={() => loadCurrent()} className="icon-btn ml-auto" title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      ) : current ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Cpu size={16} />} label="CPU" value={`${Math.round(current.cpu_usage || 0)}%`}
            sub={current.load_avg ? `Load: ${current.load_avg.map(l => l.toFixed(2)).join(' ')}` : undefined} color="text-blue-400" />
          <StatCard icon={<MemoryStick size={16} />} label="RAM"
            value={`${pct(current.mem_used, current.mem_total)}%`}
            sub={`${fmtBytes((current.mem_used || 0) / 1024)} / ${fmtBytes((current.mem_total || 0) / 1024)}`}
            color="text-violet-400" />
          <StatCard icon={<HardDrive size={16} />} label="Disk"
            value={`${pct(current.disk_used, current.disk_total)}%`}
            sub={`${fmtBytes((current.disk_used || 0) / 1024)} / ${fmtBytes((current.disk_total || 0) / 1024)}`}
            color="text-amber-400" />
          <StatCard icon={<Clock size={16} />} label="Uptime"
            value={fmtUptime(current.uptime || 0)}
            sub={current.os_name} color="text-emerald-400" />
          <StatCard icon={<Network size={16} />} label="RX"
            value={`${((current.net_rx || 0) / 1024 / 1024).toFixed(1)} MB/s`} color="text-cyan-400" />
          <StatCard icon={<Network size={16} />} label="TX"
            value={`${((current.net_tx || 0) / 1024 / 1024).toFixed(1)} MB/s`} color="text-pink-400" />
          <div className="col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">Host</p>
            <p className="font-semibold">{current.hostname || '—'}</p>
            <p className="text-xs text-[var(--text-muted)]">{current.os_name}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">No metrics available</p>
      )}

      {/* Charts */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-4">CPU & RAM History</h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-8">No history data for this range</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ram" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} unit="%" />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text)', fontSize: 11 }}
                itemStyle={{ color: 'var(--text-muted)', fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="CPU" stroke="#6366f1" fill="url(#cpu)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="RAM" stroke="#8b5cf6" fill="url(#ram)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Process list */}
      {current?.processes && current.processes.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-semibold">Top Processes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                  <th className="text-left px-4 py-2">PID</th>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-right px-4 py-2">CPU%</th>
                  <th className="text-right px-4 py-2">MEM%</th>
                </tr>
              </thead>
              <tbody>
                {current.processes.slice(0, 15).map((p) => (
                  <tr key={p.pid} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                    <td className="px-4 py-2 text-xs text-[var(--text-muted)] font-mono">{p.pid}</td>
                    <td className="px-4 py-2 text-xs truncate max-w-[200px]">{p.name}</td>
                    <td className="px-4 py-2 text-right text-xs">{(p.cpu || 0).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right text-xs">{(p.mem || 0).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
