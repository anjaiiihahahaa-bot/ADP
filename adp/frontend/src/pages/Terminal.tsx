import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Terminal as TermIcon, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react';
import { serversApi } from '../lib/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface Project { id: string; name: string; }

export default function TerminalPage() {
  const [params] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(params.get('project') || '');
  const [connected, setConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<import('xterm').Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<import('xterm-addon-fit').FitAddon | null>(null);

  useEffect(() => {
    serversApi.list().then((r) => setProjects(r.data));
    return () => { wsRef.current?.close(); xtermRef.current?.dispose(); };
  }, []);

  const initTerminal = async () => {
    const { Terminal: XTerm } = await import('xterm');
    const { FitAddon } = await import('xterm-addon-fit');
    const { WebLinksAddon } = await import('xterm-addon-web-links');
    await import('xterm/css/xterm.css');

    if (xtermRef.current) { xtermRef.current.dispose(); }
    if (!termRef.current) return;

    const xterm = new XTerm({
      fontFamily: '"JetBrains Mono", Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#0f0f1a',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        selectionBackground: '#6366f140',
      },
    });
    const fit = new FitAddon();
    xterm.loadAddon(fit);
    xterm.loadAddon(new WebLinksAddon());
    xterm.open(termRef.current);
    fit.fit();
    xtermRef.current = xterm;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => { try { fit.fit(); } catch {} });
    ro.observe(termRef.current);

    return xterm;
  };

  const connect = async () => {
    if (!projectId) { toast.error('Select a project'); return; }
    const xterm = await initTerminal();
    if (!xterm) return;

    xterm.write('\x1b[33mConnecting...\x1b[0m\r\n');

    // Get JWT from cookie (proxy will forward it via query param)
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${location.host}/ws?type=terminal&project=${projectId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      xterm.write('\x1b[32mConnected\x1b[0m\r\n\r\n');
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'data') xterm.write(msg.data);
        else if (msg.type === 'exit') xterm.write(`\r\n\x1b[33mSession ended (exit ${msg.code})\x1b[0m\r\n`);
      } catch { xterm.write(e.data); }
    };

    ws.onerror = () => {
      xterm.write('\r\n\x1b[31mConnection error\x1b[0m\r\n');
    };

    ws.onclose = (e) => {
      setConnected(false);
      xterm.write(`\r\n\x1b[33mDisconnected (${e.code})\x1b[0m\r\n`);
    };

    xterm.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    xterm.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
  };

  const disconnect = () => {
    wsRef.current?.close();
    setConnected(false);
  };

  return (
    <div className={clsx('flex flex-col bg-[#0f0f1a]', fullscreen ? 'fixed inset-0 z-50' : 'h-full')}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
        <TermIcon size={15} className="text-accent-400" />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] max-w-[180px]"
        >
          <option value="">Select project...</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {!connected ? (
          <button
            onClick={connect}
            className="px-3 py-1 bg-accent-500 hover:bg-accent-600 text-white text-xs rounded-lg font-medium"
          >
            Connect
          </button>
        ) : (
          <button
            onClick={disconnect}
            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs rounded-lg"
          >
            Disconnect
          </button>
        )}

        <span className={clsx('ml-1 w-2 h-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-slate-600')} />

        <div className="ml-auto flex gap-1">
          <button onClick={() => { disconnect(); connect(); }} className="icon-btn p-1" title="Reconnect">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setFullscreen(!fullscreen)} className="icon-btn p-1">
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div ref={termRef} className="flex-1 overflow-hidden" />

      {!connected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none mt-14">
          <TermIcon size={48} className="text-[#6366f140]" />
          <p className="text-sm text-[#64748b]">Select a project and press Connect</p>
        </div>
      )}
    </div>
  );
}
