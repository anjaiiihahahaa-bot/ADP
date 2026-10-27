import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import pty from 'node-pty';
import { query, queryOne } from '../utils/db';
import { User, Project } from '../types';
import { logger } from '../utils/logger';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET!;
const PROJECT_ROOT = process.env.PROJECT_ROOT || '/opt/adp/projects';

interface AuthedWS extends WebSocket {
  user?: User;
  projectId?: string;
  pingTimeout?: NodeJS.Timeout;
}

export function initWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws: AuthedWS, req: IncomingMessage) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const type = url.searchParams.get('type'); // 'terminal' | 'logs'
    const projectId = url.searchParams.get('project');

    // Authenticate
    try {
      const payload = jwt.verify(token || '', JWT_SECRET) as { userId: string; sessionId: string };
      const session = await queryOne<{ revoked: boolean }>(
        'SELECT revoked FROM sessions WHERE id = $1 AND expires_at > NOW()', [payload.sessionId]
      );
      if (!session || session.revoked) { ws.close(4001, 'Unauthorized'); return; }
      const user = await queryOne<User>('SELECT * FROM users WHERE id = $1 AND is_active = true', [payload.userId]);
      if (!user) { ws.close(4001, 'Unauthorized'); return; }
      ws.user = user;
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Heartbeat
    ws.pingTimeout = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);

    ws.on('close', () => clearInterval(ws.pingTimeout));

    if (type === 'terminal' && projectId) {
      await handleTerminal(ws, projectId);
    } else if (type === 'logs' && projectId) {
      await handleLogs(ws, projectId);
    } else if (type === 'metrics') {
      handleMetrics(ws);
    } else {
      ws.close(4000, 'Unknown type');
    }
  });
}

async function handleTerminal(ws: AuthedWS, projectId: string): Promise<void> {
  if (!['super_admin', 'admin', 'operator'].includes(ws.user!.role)) {
    ws.close(4003, 'Not authorized for terminal');
    return;
  }
  const project = await queryOne<Project>('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project) { ws.close(4004, 'Project not found'); return; }

  const workDir = project.working_directory;
  if (!workDir.startsWith(path.resolve(PROJECT_ROOT))) {
    ws.close(4003, 'Access denied');
    return;
  }

  // Determine shell user (never root for non-super-admin)
  const shellUser = ws.user!.role === 'super_admin' ? undefined : process.env.SHELL_USER || 'adp';

  const ptyProcess = pty.spawn('/bin/bash', [], {
    name: 'xterm-256color',
    cols: 80, rows: 24,
    cwd: workDir,
    env: { ...process.env, HOME: workDir, TERM: 'xterm-256color' },
    uid: shellUser ? undefined : undefined, // systemd handles user isolation
  });

  ptyProcess.onData((data: string) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'data', data }));
  });

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
    ws.close();
  });

  ws.on('message', (msg: Buffer) => {
    try {
      const m = JSON.parse(msg.toString());
      if (m.type === 'data') ptyProcess.write(m.data);
      else if (m.type === 'resize') ptyProcess.resize(m.cols, m.rows);
    } catch { /* ignore */ }
  });

  ws.on('close', () => {
    try { ptyProcess.kill(); } catch { /* ignore */ }
  });
}

async function handleLogs(ws: AuthedWS, projectId: string): Promise<void> {
  const { execFile } = await import('child_process');
  const pm2Name = `adp_${projectId}`;
  let closed = false;

  ws.send(JSON.stringify({ type: 'info', message: 'Streaming logs...' }));

  const child = execFile('pm2', ['logs', pm2Name, '--lines', '50', '--raw'], {});

  child.stdout?.on('data', (data: Buffer) => {
    if (!closed && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'log', stream: 'stdout', data: data.toString() }));
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    if (!closed && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'log', stream: 'stderr', data: data.toString() }));
    }
  });

  ws.on('close', () => {
    closed = true;
    child.kill();
  });
}

function handleMetrics(ws: AuthedWS): void {
  let closed = false;
  const interval = setInterval(async () => {
    if (closed || ws.readyState !== WebSocket.OPEN) {
      clearInterval(interval);
      return;
    }
    try {
      const si = await import('systeminformation');
      const [cpu, mem] = await Promise.all([si.currentLoad(), si.mem()]);
      ws.send(JSON.stringify({
        type: 'metrics',
        cpu: cpu.currentLoad,
        mem_used: mem.used,
        mem_total: mem.total,
        timestamp: Date.now(),
      }));
    } catch { /* skip */ }
  }, 2000);

  ws.on('close', () => {
    closed = true;
    clearInterval(interval);
  });
}
