import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../utils/db';
import { authenticate } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { ApiToken } from '../types';

const router = Router();
router.use(authenticate);

const VALID_SCOPES = [
  'servers:read', 'servers:write', 'files:read', 'files:write',
  'databases:read', 'databases:write', 'users:read', 'users:write',
  'monitoring:read', 'logs:read',
];

// GET /api/v1/tokens
router.get('/', async (req: Request, res: Response) => {
  const tokens = await query<ApiToken>(
    'SELECT id, name, token_prefix, scopes, expires_at, last_used, created_at, revoked FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user!.id]
  );
  res.json(tokens);
});

// POST /api/v1/tokens
router.post('/', async (req: Request, res: Response) => {
  const { name, scopes, expires_in_days } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const requestedScopes: string[] = scopes || [];
  const invalidScopes = requestedScopes.filter((s: string) => !VALID_SCOPES.includes(s));
  if (invalidScopes.length) return res.status(400).json({ error: `Invalid scopes: ${invalidScopes.join(', ')}` });

  const rawToken = 'adp_' + crypto.randomBytes(32).toString('base64url');
  const prefix = rawToken.substring(0, 12);
  const hash = await bcrypt.hash(rawToken, 10);
  const expiresAt = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86400 * 1000)
    : null;

  const id = uuidv4();
  await query(
    'INSERT INTO api_tokens (id, user_id, name, token_hash, token_prefix, scopes, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, req.user!.id, name, hash, prefix, requestedScopes, expiresAt]
  );

  await auditLog(req, 'create_api_token', 'api_token', id, { name, scopes: requestedScopes });
  return res.status(201).json({
    id, name, prefix, scopes: requestedScopes, expires_at: expiresAt,
    token: rawToken,
    message: 'Token shown once. Store it securely.',
  });
});

// DELETE /api/v1/tokens/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await query(
    'UPDATE api_tokens SET revoked = true WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.id]
  );
  await auditLog(req, 'revoke_api_token', 'api_token', req.params.id);
  return res.json({ message: 'Token revoked' });
});

export default router;
