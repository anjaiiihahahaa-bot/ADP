import React from 'react';
import clsx from 'clsx';

type Status = 'running' | 'stopped' | 'starting' | 'stopping' | 'failed' | 'unknown';

const config: Record<Status, { label: string; dot: string; text: string }> = {
  running:  { label: 'Running',  dot: 'bg-emerald-500', text: 'text-emerald-400' },
  stopped:  { label: 'Stopped',  dot: 'bg-slate-500',   text: 'text-slate-400' },
  starting: { label: 'Starting', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-400' },
  stopping: { label: 'Stopping', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-400' },
  failed:   { label: 'Failed',   dot: 'bg-red-500',     text: 'text-red-400' },
  unknown:  { label: 'Unknown',  dot: 'bg-slate-600',   text: 'text-slate-500' },
};

export default function StatusBadge({ status }: { status: Status | string }) {
  const s = config[status as Status] || config.unknown;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', s.text)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', s.dot)} />
      {s.label}
    </span>
  );
}
