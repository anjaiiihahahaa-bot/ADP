import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { query } from '../utils/db';
import { Project } from '../types';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

export interface ProcessStatus {
  status: Project['status'];
  pid?: number;
  uptime?: number;
  restarts?: number;
  cpu?: number;
  memory?: number;
  exit_code?: number;
}

const ALLOWED_RUNTIMES: Record<string, string[]> = {
  nodejs: ['node', 'ts-node', 'npx'],
  python: ['python3', 'python', 'uvicorn', 'gunicorn'],
  php: ['php'],
  static: ['npx', 'python3'],
};

function sanitizeCommand(cmd: string, runtime: string): boolean {
  const allowed = ALLOWED_RUNTIMES[runtime] || [];
  const parts = cmd.trim().split(/\s+/);
  if (parts.length === 0) return false;
  const base = path.basename(parts[0]);
  return allowed.includes(base);
}

export async function startProject(project: Project): Promise<void> {
  if (!project.start_command) throw new Error('No start command configured');
  if (!sanitizeCommand(project.start_command, project.runtime)) {
    throw new Error(`Command not allowed for runtime ${project.runtime}`);
  }

  const pm2Name = `adp_${project.id}`;
  const envStr = Object.entries(project.env_vars || {})
    .map(([k, v]) => `--env ${k}="${v.replace(/"/g, '\\"')}"`)
    .join(' ');

  const cmd = [
    'pm2', 'start', project.start_command.split(' ')[0],
    '--name', pm2Name,
    '--cwd', project.working_directory,
    '--restart-delay', '5000',
    '--max-restarts', String(project.max_restarts),
    project.restart_policy === 'never' ? '--no-autorestart' : '',
    project.start_command.split(' ').slice(1).length > 0
      ? `-- ${project.start_command.split(' ').slice(1).join(' ')}`
      : '',
  ].filter(Boolean).join(' ');

  await execAsync(cmd, { cwd: project.working_directory });
  await query(
    'UPDATE projects SET status = $1, pm2_name = $2, updated_at = NOW() WHERE id = $3',
    ['starting', pm2Name, project.id]
  );

  // Wait and verify
  await new Promise((r) => setTimeout(r, 2000));
  const status = await getProjectStatus(project.id);
  await query('UPDATE projects SET status = $1, pid = $2 WHERE id = $3', [
    status.status, status.pid || null, project.id,
  ]);
}

export async function stopProject(projectId: string): Promise<void> {
  const project = await query<Project>('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project[0]) throw new Error('Project not found');
  const pm2Name = project[0].pm2_name || `adp_${projectId}`;
  await execAsync(`pm2 stop ${pm2Name}`);
  await query("UPDATE projects SET status = 'stopped', pid = NULL WHERE id = $1", [projectId]);
}

export async function restartProject(projectId: string): Promise<void> {
  const project = await query<Project>('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project[0]) throw new Error('Project not found');
  const pm2Name = project[0].pm2_name || `adp_${projectId}`;
  await execAsync(`pm2 restart ${pm2Name}`);
  await query("UPDATE projects SET status = 'starting', updated_at = NOW() WHERE id = $1", [projectId]);
}

export async function deleteProject(projectId: string): Promise<void> {
  const project = await query<Project>('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project[0]) return;
  const pm2Name = project[0].pm2_name || `adp_${projectId}`;
  try { await execAsync(`pm2 delete ${pm2Name}`); } catch { /* not running */ }
  await query('DELETE FROM projects WHERE id = $1', [projectId]);
}

export async function getProjectStatus(projectId: string): Promise<ProcessStatus> {
  const pm2Name = `adp_${projectId}`;
  try {
    const { stdout } = await execAsync(`pm2 jlist`);
    const list = JSON.parse(stdout);
    const proc = list.find((p: Record<string, unknown>) => p.name === pm2Name);
    if (!proc) return { status: 'stopped' };

    const pm2Status = proc.pm2_env?.status as string;
    const statusMap: Record<string, Project['status']> = {
      online: 'running',
      stopped: 'stopped',
      stopping: 'stopping',
      launching: 'starting',
      errored: 'failed',
    };

    return {
      status: statusMap[pm2Status] || 'unknown',
      pid: proc.pid || undefined,
      uptime: proc.pm2_env?.pm_uptime
        ? Math.floor((Date.now() - proc.pm2_env.pm_uptime) / 1000)
        : undefined,
      restarts: proc.pm2_env?.restart_time,
      cpu: proc.monit?.cpu,
      memory: proc.monit?.memory,
      exit_code: proc.pm2_env?.exit_code,
    };
  } catch {
    return { status: 'unknown' };
  }
}

export async function getProjectLogs(
  projectId: string,
  lines = 100,
  type: 'out' | 'err' | 'all' = 'all'
): Promise<string[]> {
  const pm2Name = `adp_${projectId}`;
  try {
    const { stdout } = await execAsync(
      `pm2 logs ${pm2Name} --lines ${lines} --nostream${type === 'err' ? ' --err' : type === 'out' ? ' --out' : ''}`
    );
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export async function checkPortConflict(port: number, excludeProjectId?: string): Promise<boolean> {
  const existing = await query<{ id: string }>(
    'SELECT id FROM projects WHERE port = $1' + (excludeProjectId ? ' AND id != $2' : ''),
    excludeProjectId ? [port, excludeProjectId] : [port]
  );
  if (existing.length > 0) return true;
  try {
    const { stdout } = await execAsync(`ss -tlnp 2>/dev/null | grep ':${port} ' || true`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function syncAllStatuses(): Promise<void> {
  const projects = await query<Project>("SELECT * FROM projects WHERE status NOT IN ('stopped')");
  for (const p of projects) {
    try {
      const status = await getProjectStatus(p.id);
      await query('UPDATE projects SET status = $1, pid = $2 WHERE id = $3', [
        status.status, status.pid || null, p.id,
      ]);
    } catch (err) {
      logger.error('Failed to sync project status', { projectId: p.id, err });
    }
  }
}
