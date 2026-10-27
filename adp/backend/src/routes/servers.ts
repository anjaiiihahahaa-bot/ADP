import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { query, queryOne } from '../utils/db';
import { authenticate, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { Project } from '../types';
import {
  startProject, stopProject, restartProject, deleteProject,
  getProjectStatus, getProjectLogs, checkPortConflict
} from '../services/processManager';

const router = Router();
router.use(authenticate);

const PROJECT_ROOT = process.env.PROJECT_ROOT || '/opt/adp/projects';

// GET /api/v1/servers
router.get('/', async (req: Request, res: Response) => {
  const isAdmin = ['super_admin', 'admin', 'operator'].includes(req.user!.role);
  const projects = isAdmin
    ? await query<Project>('SELECT * FROM projects ORDER BY created_at DESC')
    : await query<Project>('SELECT * FROM projects WHERE owner_id = $1 ORDER BY created_at DESC', [req.user!.id]);
  res.json(projects);
});

// POST /api/v1/servers
router.post('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, description, runtime, entry_file, start_command, port, domain, env_vars, restart_policy, max_restarts } = req.body;
    if (!name || !runtime) return res.status(400).json({ error: 'name and runtime required' });

    if (port) {
      const conflict = await checkPortConflict(port);
      if (conflict) return res.status(409).json({ error: `Port ${port} already in use` });
    }

    const id = uuidv4();
    const workingDir = path.join(PROJECT_ROOT, id);
    await fs.mkdir(workingDir, { recursive: true });

    await query(
      `INSERT INTO projects (id, name, description, owner_id, runtime, entry_file, start_command,
        working_directory, port, domain, env_vars, restart_policy, max_restarts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, name, description || null, req.user!.id, runtime, entry_file || null, start_command || null,
        workingDir, port || null, domain || null, JSON.stringify(env_vars || {}),
        restart_policy || 'on-failure', max_restarts || 5]
    );

    await auditLog(req, 'create_project', 'project', id, { name, runtime });
    return res.status(201).json({ id, name, working_directory: workingDir });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET /api/v1/servers/:id
router.get('/:id', async (req: Request, res: Response) => {
  const project = await queryOne<Project>('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (req.user!.role === 'user' && project.owner_id !== req.user!.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const status = await getProjectStatus(project.id);
  return res.json({ ...project, live_status: status });
});

// PATCH /api/v1/servers/:id
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  const project = await queryOne<Project>('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const { name, description, runtime, entry_file, start_command, port, domain, env_vars, restart_policy, max_restarts } = req.body;

  if (port && port !== project.port) {
    const conflict = await checkPortConflict(port, project.id);
    if (conflict) return res.status(409).json({ error: `Port ${port} already in use` });
  }

  await query(
    `UPDATE projects SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      runtime = COALESCE($3, runtime),
      entry_file = COALESCE($4, entry_file),
      start_command = COALESCE($5, start_command),
      port = COALESCE($6, port),
      domain = COALESCE($7, domain),
      env_vars = COALESCE($8, env_vars),
      restart_policy = COALESCE($9, restart_policy),
      max_restarts = COALESCE($10, max_restarts),
      updated_at = NOW()
    WHERE id = $11`,
    [name, description, runtime, entry_file, start_command,
      port, domain, env_vars ? JSON.stringify(env_vars) : null,
      restart_policy, max_restarts, req.params.id]
  );
  await auditLog(req, 'update_project', 'project', req.params.id);
  return res.json({ message: 'Updated' });
});

// POST /api/v1/servers/:id/start
router.post('/:id/start', requireRole('operator'), async (req: Request, res: Response) => {
  const project = await queryOne<Project>('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  if (!project) return res.status(404).json({ error: 'Not found' });
  try {
    await startProject(project);
    await auditLog(req, 'start_project', 'project', project.id);
    return res.json({ message: 'Start initiated' });
  } catch (err: unknown) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/v1/servers/:id/stop
router.post('/:id/stop', requireRole('operator'), async (req: Request, res: Response) => {
  try {
    await stopProject(req.params.id);
    await auditLog(req, 'stop_project', 'project', req.params.id);
    return res.json({ message: 'Stopped' });
  } catch (err: unknown) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/v1/servers/:id/restart
router.post('/:id/restart', requireRole('operator'), async (req: Request, res: Response) => {
  try {
    await restartProject(req.params.id);
    await auditLog(req, 'restart_project', 'project', req.params.id);
    return res.json({ message: 'Restart initiated' });
  } catch (err: unknown) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

// GET /api/v1/servers/:id/status
router.get('/:id/status', async (req: Request, res: Response) => {
  const status = await getProjectStatus(req.params.id);
  res.json(status);
});

// GET /api/v1/servers/:id/logs
router.get('/:id/logs', async (req: Request, res: Response) => {
  const lines = Math.min(parseInt(req.query.lines as string || '100'), 1000);
  const type = (req.query.type as 'out' | 'err' | 'all') || 'all';
  const logs = await getProjectLogs(req.params.id, lines, type);
  res.json({ logs });
});

// DELETE /api/v1/servers/:id
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  const { confirm, delete_files } = req.body;
  if (confirm !== 'DELETE') return res.status(400).json({ error: 'Confirm with "DELETE"' });

  const project = await queryOne<Project>('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  if (!project) return res.status(404).json({ error: 'Not found' });

  await deleteProject(req.params.id);

  if (delete_files) {
    try { await fs.rm(project.working_directory, { recursive: true, force: true }); } catch { /* noop */ }
  }

  await auditLog(req, 'delete_project', 'project', req.params.id, { delete_files });
  return res.json({ message: 'Project deleted' });
});

export default router;
