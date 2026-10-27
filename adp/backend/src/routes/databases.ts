import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { query, queryOne, getDbEngine } from '../utils/db';
import { authenticate, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { Database } from '../types';
import crypto from 'crypto';

const router = Router();
router.use(authenticate, requireRole('admin'));
const execAsync = promisify(exec);

function genDbCredentials(userId: string, suffix: string) {
  const hash = crypto.createHash('sha256').update(userId + suffix).digest('hex').substring(0, 8);
  return {
    dbName: `adp_u${hash}`,
    dbUser: `adp_u${hash}`,
    dbPass: crypto.randomBytes(20).toString('base64url'),
  };
}

async function execDb(sql: string): Promise<void> {
  const engine = getDbEngine();
  if (engine === 'postgresql') {
    await execAsync(`psql -U ${process.env.DB_ADMIN_USER || 'postgres'} -c "${sql.replace(/"/g, '\\"')}"`);
  } else {
    await execAsync(`mysql -u ${process.env.DB_ADMIN_USER || 'root'} -p${process.env.DB_ADMIN_PASS || ''} -e "${sql.replace(/"/g, '\\"')}"`);
  }
}

// GET /api/v1/databases
router.get('/', async (req: Request, res: Response) => {
  const dbs = await query<Database>('SELECT * FROM databases ORDER BY created_at DESC');
  res.json(dbs);
});

// POST /api/v1/databases
router.post('/', async (req: Request, res: Response) => {
  try {
    const { owner_id, name } = req.body;
    if (!owner_id) return res.status(400).json({ error: 'owner_id required' });
    const { dbName, dbUser, dbPass } = genDbCredentials(owner_id, name || uuidv4());
    const engine = getDbEngine();
    const port = engine === 'postgresql' ? 5432 : 3306;

    if (engine === 'postgresql') {
      await execAsync(`createuser -U postgres ${dbUser} 2>/dev/null || true`);
      await execDb(`ALTER USER "${dbUser}" WITH PASSWORD '${dbPass}'`);
      await execAsync(`createdb -U postgres -O ${dbUser} ${dbName} 2>/dev/null || true`);
      await execDb(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`);
    } else {
      await execDb(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
      await execDb(`CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}'`);
      await execDb(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost'`);
      await execDb(`FLUSH PRIVILEGES`);
    }

    const id = uuidv4();
    await query(
      'INSERT INTO databases (id, name, owner_id, engine, host, port, db_username) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, dbName, owner_id, engine, 'localhost', port, dbUser]
    );
    await auditLog(req, 'create_database', 'database', id, { owner_id, engine });

    return res.status(201).json({
      id, name: dbName, engine, host: 'localhost', port,
      username: dbUser, password: dbPass, // one-time display
      message: 'Database created. Save credentials — password is shown once.',
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/v1/databases/:id
router.get('/:id', async (req: Request, res: Response) => {
  const db = await queryOne<Database>('SELECT * FROM databases WHERE id = $1', [req.params.id]);
  if (!db) return res.status(404).json({ error: 'Not found' });
  return res.json(db);
});

// DELETE /api/v1/databases/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const { confirm } = req.body;
  if (confirm !== 'DELETE') return res.status(400).json({ error: 'Confirm with "DELETE"' });
  const db = await queryOne<Database>('SELECT * FROM databases WHERE id = $1', [req.params.id]);
  if (!db) return res.status(404).json({ error: 'Not found' });
  try {
    if (getDbEngine() === 'postgresql') {
      await execDb(`DROP DATABASE IF EXISTS "${db.name}"`);
      await execDb(`DROP USER IF EXISTS "${db.db_username}"`);
    } else {
      await execDb(`DROP DATABASE IF EXISTS \`${db.name}\``);
      await execDb(`DROP USER IF EXISTS '${db.db_username}'@'localhost'`);
    }
  } catch (err) { /* log but continue */ }
  await query('DELETE FROM databases WHERE id = $1', [req.params.id]);
  await auditLog(req, 'delete_database', 'database', req.params.id);
  return res.json({ message: 'Database deleted' });
});

// POST /api/v1/databases/:id/reset-password
router.post('/:id/reset-password', async (req: Request, res: Response) => {
  const db = await queryOne<Database>('SELECT * FROM databases WHERE id = $1', [req.params.id]);
  if (!db) return res.status(404).json({ error: 'Not found' });
  const newPass = crypto.randomBytes(20).toString('base64url');
  if (getDbEngine() === 'postgresql') {
    await execDb(`ALTER USER "${db.db_username}" WITH PASSWORD '${newPass}'`);
  } else {
    await execDb(`ALTER USER '${db.db_username}'@'localhost' IDENTIFIED BY '${newPass}'`);
  }
  await auditLog(req, 'reset_db_password', 'database', req.params.id);
  return res.json({ password: newPass, message: 'Password reset. Save immediately.' });
});

export default router;
