import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../utils/db';
import { authenticate, requireRole } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { User } from '../types';

const router = Router();
router.use(authenticate);

// GET /api/v1/users
router.get('/', requireRole('admin'), async (req: Request, res: Response) => {
  const users = await query<User>(
    'SELECT id, username, email, role, is_active, totp_enabled, created_at, last_login FROM users ORDER BY created_at DESC'
  );
  res.json(users);
});

// POST /api/v1/users
router.post('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { username, email, password, role = 'user' } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, password required' });
    }
    const exists = await queryOne('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (exists) return res.status(409).json({ error: 'Username or email already taken' });

    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    await query(
      'INSERT INTO users (id, username, email, password_hash, role) VALUES ($1,$2,$3,$4,$5)',
      [id, username, email, hash, role]
    );
    await auditLog(req, 'create_user', 'user', id, { username, role });
    return res.status(201).json({ id, username, email, role });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /api/v1/users/:id
router.get('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  const user = await queryOne<User>(
    'SELECT id, username, email, role, is_active, totp_enabled, created_at, last_login FROM users WHERE id = $1',
    [req.params.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

// PATCH /api/v1/users/:id
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  const { role, is_active } = req.body;
  const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const updates: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (role !== undefined) { updates.push(`role = $${i++}`); vals.push(role); }
  if (is_active !== undefined) { updates.push(`is_active = $${i++}`); vals.push(is_active); }
  updates.push(`updated_at = NOW()`);
  vals.push(req.params.id);

  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, vals);
  await auditLog(req, 'update_user', 'user', req.params.id, { role, is_active });
  return res.json({ message: 'Updated' });
});

// POST /api/v1/users/:id/reset-password
router.post('/:id/reset-password', requireRole('admin'), async (req: Request, res: Response) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const hash = await bcrypt.hash(new_password, 12);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.params.id]);
  await query('UPDATE sessions SET revoked = true WHERE user_id = $1', [req.params.id]);
  await auditLog(req, 'reset_password', 'user', req.params.id);
  return res.json({ message: 'Password reset, all sessions revoked' });
});

// DELETE /api/v1/users/:id
router.delete('/:id', requireRole('super_admin'), async (req: Request, res: Response) => {
  const { confirm } = req.body;
  if (confirm !== 'DELETE') return res.status(400).json({ error: 'Confirm deletion with "DELETE"' });
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await query('DELETE FROM users WHERE id = $1', [req.params.id]);
  await auditLog(req, 'delete_user', 'user', req.params.id);
  return res.json({ message: 'User deleted' });
});

export default router;
