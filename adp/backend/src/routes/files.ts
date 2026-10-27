import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import multer from 'multer';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { query, queryOne } from '../utils/db';
import { authenticate, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { Project } from '../types';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate);

const PROJECT_ROOT = process.env.PROJECT_ROOT || '/opt/adp/projects';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || String(100 * 1024 * 1024));
const MAX_ZIP_ENTRIES = 10000;
const MAX_ZIP_SIZE = 500 * 1024 * 1024; // 500MB

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    const project = await queryOne<Project>('SELECT * FROM projects WHERE id = $1', [req.params.projectId]);
    if (!project) return cb(new Error('Project not found'), '');
    const dest = safePath(project.working_directory, (req.query.path as string) || '');
    if (!dest) return cb(new Error('Invalid path'), '');
    cb(null, dest);
  },
  filename: (_req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

function safePath(projectRoot: string, relativePath: string): string | null {
  const resolved = path.resolve(projectRoot, relativePath.replace(/^\/+/, ''));
  if (!resolved.startsWith(path.resolve(projectRoot))) return null;
  return resolved;
}

async function getProject(req: Request, res: Response): Promise<Project | null> {
  const project = await queryOne<Project>('SELECT * FROM projects WHERE id = $1', [req.params.projectId]);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return null; }
  if (req.user!.role === 'user' && project.owner_id !== req.user!.id) {
    res.status(403).json({ error: 'Access denied' }); return null;
  }
  return project;
}

// GET /api/v1/projects/:projectId/files
router.get('/:projectId/files', async (req: Request, res: Response) => {
  const project = await getProject(req, res);
  if (!project) return;
  const dir = safePath(project.working_directory, (req.query.path as string) || '');
  if (!dir) return res.status(400).json({ error: 'Invalid path' });
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const items = await Promise.all(entries.map(async (e) => {
      const fullPath = path.join(dir, e.name);
      let size = 0;
      let mtime = new Date();
      try {
        const stat = await fs.stat(fullPath);
        size = stat.size;
        mtime = stat.mtime;
      } catch { /* skip */ }
      return {
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        size,
        mtime,
        path: path.join((req.query.path as string) || '/', e.name),
      };
    }));
    return res.json(items);
  } catch {
    return res.status(500).json({ error: 'Cannot read directory' });
  }
});

// GET /api/v1/projects/:projectId/files/read
router.get('/:projectId/files/read', async (req: Request, res: Response) => {
  const project = await getProject(req, res);
  if (!project) return;
  const filePath = safePath(project.working_directory, (req.query.path as string) || '');
  if (!filePath) return res.status(400).json({ error: 'Invalid path' });
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return res.status(400).json({ error: 'Is a directory' });
    if (stat.size > 5 * 1024 * 1024) return res.status(413).json({ error: 'File too large for preview' });
    const content = await fs.readFile(filePath, 'utf-8');
    return res.json({ content, size: stat.size, mtime: stat.mtime });
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
});

// POST /api/v1/projects/:projectId/files/write
router.post('/:projectId/files/write', requireRole('operator'), async (req: Request, res: Response) => {
  const project = await getProject(req, res);
  if (!project) return;
  const filePath = safePath(project.working_directory, req.body.path || '');
  if (!filePath) return res.status(400).json({ error: 'Invalid path' });
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, req.body.content || '', 'utf-8');
    await auditLog(req, 'write_file', 'file', undefined, { project_id: project.id, path: req.body.path });
    return res.json({ message: 'Saved' });
  } catch {
    return res.status(500).json({ error: 'Write failed' });
  }
});

// POST /api/v1/projects/:projectId/files/upload
router.post('/:projectId/files/upload', requireRole('operator'),
  upload.array('files', 50),
  async (req: Request, res: Response) => {
    await auditLog(req, 'upload_files', 'file', undefined, { project_id: req.params.projectId });
    return res.json({ message: 'Uploaded', count: (req.files as Express.Multer.File[])?.length || 0 });
  }
);

// GET /api/v1/projects/:projectId/files/download
router.get('/:projectId/files/download', async (req: Request, res: Response) => {
  const project = await getProject(req, res);
  if (!project) return;
  const filePath = safePath(project.working_directory, (req.query.path as string) || '');
  if (!filePath) return res.status(400).json({ error: 'Invalid path' });
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}.zip"`);
      res.setHeader('Content-Type', 'application/zip');
      const archive = archiver('zip');
      archive.pipe(res);
      archive.directory(filePath, path.basename(filePath));
      await archive.finalize();
    } else {
      res.download(filePath);
    }
  } catch {
    return res.status(404).json({ error: 'Not found' });
  }
});

// POST /api/v1/projects/:projectId/files/mkdir
router.post('/:projectId/files/mkdir', requireRole('operator'), async (req: Request, res: Response) => {
  const project = await getProject(req, res);
  if (!project) return;
  const dirPath = safePath(project.working_directory, req.body.path || '');
  if (!dirPath) return res.status(400).json({ error: 'Invalid path' });
  await fs.mkdir(dirPath, { recursive: true });
  return res.json({ message: 'Created' });
});

// POST /api/v1/projects/:projectId/files/rename
router.post('/:projectId/files/rename', requireRole('operator'), async (req: Request, res: Response) => {
  const project = await getProject(req, res);
  if (!project) return;
  const src = safePath(project.working_directory, req.body.from || '');
  const dst = safePath(project.working_directory, req.body.to || '');
  if (!src || !dst) return res.status(400).json({ error: 'Invalid path' });
  await fs.rename(src, dst);
  await auditLog(req, 'rename_file', 'file', undefined, { project_id: project.id, from: req.body.from, to: req.body.to });
  return res.json({ message: 'Renamed' });
});

// DELETE /api/v1/projects/:projectId/files
router.delete('/:projectId/files', requireRole('operator'), async (req: Request, res: Response) => {
  const project = await getProject(req, res);
  if (!project) return;
  const paths: string[] = Array.isArray(req.body.paths) ? req.body.paths : [req.body.path];
  if (!paths.length) return res.status(400).json({ error: 'No paths provided' });

  const results: { path: string; success: boolean; error?: string }[] = [];
  for (const p of paths) {
    const full = safePath(project.working_directory, p);
    if (!full) { results.push({ path: p, success: false, error: 'Invalid path' }); continue; }
    try {
      const stat = await fs.lstat(full);
      if (stat.isSymbolicLink()) {
        const target = await fs.readlink(full);
        const resolved = path.resolve(path.dirname(full), target);
        if (!resolved.startsWith(path.resolve(project.working_directory))) {
          results.push({ path: p, success: false, error: 'Symlink escape blocked' });
          continue;
        }
      }
      await fs.rm(full, { recursive: true, force: true });
      results.push({ path: p, success: true });
    } catch (e) {
      results.push({ path: p, success: false, error: String(e) });
    }
  }

  await auditLog(req, 'delete_files', 'file', undefined, { project_id: project.id, paths });
  return res.json({ results });
});

// POST /api/v1/projects/:projectId/files/extract
router.post('/:projectId/files/extract', requireRole('operator'), async (req: Request, res: Response) => {
  const project = await getProject(req, res);
  if (!project) return;

  const zipPath = safePath(project.working_directory, req.body.zip_path || '');
  const destPath = safePath(project.working_directory, req.body.dest_path || '');
  if (!zipPath || !destPath) return res.status(400).json({ error: 'Invalid path' });

  try {
    let entryCount = 0;
    let totalSize = 0;

    await fs.mkdir(destPath, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      createReadStream(zipPath)
        .pipe(unzipper.Parse())
        .on('entry', async (entry: unzipper.Entry) => {
          entryCount++;
          if (entryCount > MAX_ZIP_ENTRIES) {
            entry.autodrain();
            reject(new Error('Too many files in ZIP'));
            return;
          }

          const entryPath = entry.path.replace(/\.\./g, '').replace(/^\/+/, '');
          const outPath = path.join(destPath, entryPath);
          if (!outPath.startsWith(path.resolve(destPath))) {
            entry.autodrain();
            reject(new Error('ZIP slip detected'));
            return;
          }

          if (entry.type === 'Directory') {
            await fs.mkdir(outPath, { recursive: true });
            entry.autodrain();
          } else {
            await fs.mkdir(path.dirname(outPath), { recursive: true });
            const size = entry.extra?.uncompressedSize || 0;
            totalSize += size;
            if (totalSize > MAX_ZIP_SIZE) {
              entry.autodrain();
              reject(new Error('Extracted size limit exceeded'));
              return;
            }
            entry.pipe(createWriteStream(outPath));
          }
        })
        .on('finish', resolve)
        .on('error', reject);
    });

    if (req.body.delete_zip_after) {
      await fs.rm(zipPath, { force: true });
    }

    await auditLog(req, 'extract_zip', 'file', undefined, { project_id: project.id, zip: req.body.zip_path });
    return res.json({ message: 'Extracted', entries: entryCount, delete_zip: !!req.body.delete_zip_after });
  } catch (err: unknown) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/v1/projects/:projectId/files/zip
router.post('/:projectId/files/zip', requireRole('operator'), async (req: Request, res: Response) => {
  const project = await getProject(req, res);
  if (!project) return;

  const sources: string[] = (req.body.paths || []).map((p: string) => safePath(project.working_directory, p)).filter(Boolean);
  const dest = safePath(project.working_directory, req.body.dest || '');
  if (!dest || sources.length === 0) return res.status(400).json({ error: 'Invalid paths' });

  const archive = archiver('zip', { zlib: { level: 6 } });
  const output = createWriteStream(dest);
  archive.pipe(output);

  for (const src of sources) {
    const stat = await fs.stat(src).catch(() => null);
    if (!stat) continue;
    if (stat.isDirectory()) archive.directory(src, path.basename(src));
    else archive.file(src, { name: path.basename(src) });
  }

  await archive.finalize();
  return res.json({ message: 'Created', dest: req.body.dest });
});

export default router;
