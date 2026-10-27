import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../utils/db';
import { authenticate } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { User } from '../types';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;
const SESSION_TTL_HOURS = parseInt(process.env.SESSION_TTL_HOURS || '24');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/v1/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password, totp_code } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await queryOne<User>(
      'SELECT * FROM users WHERE (username = $1 OR email = $1) AND is_active = true',
      [username]
    );
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await auditLog(req, 'login_failed', 'user', user.id, { username });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.totp_enabled) {
      if (!totp_code) {
        return res.status(200).json({ require_totp: true });
      }
      const verified = speakeasy.totp.verify({
        secret: user.totp_secret!,
        encoding: 'base32',
        token: totp_code,
        window: 1,
      });
      if (!verified) {
        return res.status(401).json({ error: 'Invalid TOTP code' });
      }
    }

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      || req.socket.remoteAddress;
    const token = jwt.sign({ userId: user.id, sessionId }, JWT_SECRET, {
      expiresIn: SESSION_TTL_HOURS * 3600,
    });
    const tokenHash = await bcrypt.hash(token.split('.')[2], 8);

    await query(
      `INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, user.id, tokenHash, ip, req.headers['user-agent'], expiresAt]
    );
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await auditLog(req, 'login', 'user', user.id);

    res.cookie('adp_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: expiresAt,
    });

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        totp_enabled: user.totp_enabled,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.adp_token;
    if (token) {
      const payload = jwt.decode(token) as { sessionId: string };
      if (payload?.sessionId) {
        await query('UPDATE sessions SET revoked = true WHERE id = $1', [payload.sessionId]);
      }
    }
    await auditLog(req, 'logout', 'user', req.user!.id);
    res.clearCookie('adp_token');
    return res.json({ message: 'Logged out' });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, (req: Request, res: Response) => {
  const u = req.user!;
  res.json({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    totp_enabled: u.totp_enabled,
    last_login: u.last_login,
  });
});

// GET /api/v1/auth/sessions
router.get('/sessions', authenticate, async (req: Request, res: Response) => {
  const sessions = await query(
    'SELECT id, ip_address, user_agent, created_at, expires_at FROM sessions WHERE user_id = $1 AND revoked = false AND expires_at > NOW()',
    [req.user!.id]
  );
  res.json(sessions);
});

// DELETE /api/v1/auth/sessions/:id
router.delete('/sessions/:id', authenticate, async (req: Request, res: Response) => {
  await query(
    'UPDATE sessions SET revoked = true WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.id]
  );
  await auditLog(req, 'revoke_session', 'session', req.params.id);
  res.json({ message: 'Session revoked' });
});

// POST /api/v1/auth/totp/setup
router.post('/totp/setup', authenticate, async (req: Request, res: Response) => {
  const secret = speakeasy.generateSecret({
    name: `ADP (${req.user!.username})`,
    length: 20,
  });
  await query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret.base32, req.user!.id]);
  const qr = await QRCode.toDataURL(secret.otpauth_url!);
  res.json({ secret: secret.base32, qr, otpauth: secret.otpauth_url });
});

// POST /api/v1/auth/totp/verify
router.post('/totp/verify', authenticate, async (req: Request, res: Response) => {
  const { code } = req.body;
  const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [req.user!.id]);
  if (!user?.totp_secret) {
    return res.status(400).json({ error: 'TOTP not set up' });
  }
  const ok = speakeasy.totp.verify({
    secret: user.totp_secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
  if (!ok) return res.status(400).json({ error: 'Invalid code' });
  await query('UPDATE users SET totp_enabled = true WHERE id = $1', [req.user!.id]);
  await auditLog(req, 'totp_enabled', 'user', req.user!.id);
  return res.json({ message: 'TOTP enabled' });
});

// DELETE /api/v1/auth/totp
router.delete('/totp', authenticate, async (req: Request, res: Response) => {
  await query('UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1', [req.user!.id]);
  await auditLog(req, 'totp_disabled', 'user', req.user!.id);
  return res.json({ message: 'TOTP disabled' });
});

// POST /api/v1/auth/change-password
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'Current and new password (min 8 chars) required' });
    }
    const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [req.user!.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user!.id]);
    await auditLog(req, 'password_changed', 'user', req.user!.id);
    return res.json({ message: 'Password changed' });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
