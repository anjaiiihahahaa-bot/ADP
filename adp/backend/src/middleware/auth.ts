import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../utils/db';
import { User, ApiToken } from '../types';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface JwtPayload {
  userId: string;
  sessionId: string;
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Try cookie session first
    const token = req.cookies?.adp_token;
    if (token) {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
      const session = await queryOne<{ revoked: boolean; expires_at: Date }>(
        'SELECT revoked, expires_at FROM sessions WHERE id = $1',
        [payload.sessionId]
      );
      if (!session || session.revoked || new Date(session.expires_at) < new Date()) {
        res.status(401).json({ error: 'Session expired or revoked' });
        return;
      }
      const user = await queryOne<User>(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [payload.userId]
      );
      if (!user) {
        res.status(401).json({ error: 'User not found or inactive' });
        return;
      }
      req.user = user;
      next();
      return;
    }

    // Try API token (Bearer)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer adp_')) {
      const rawToken = authHeader.split(' ')[1];
      const prefix = rawToken.substring(0, 12);
      const tokens = await query<ApiToken>(
        'SELECT * FROM api_tokens WHERE token_prefix = $1 AND revoked = false AND (expires_at IS NULL OR expires_at > NOW())',
        [prefix]
      );
      for (const apiToken of tokens) {
        const match = await bcrypt.compare(rawToken, apiToken.token_hash);
        if (match) {
          await query('UPDATE api_tokens SET last_used = NOW() WHERE id = $1', [apiToken.id]);
          const user = await queryOne<User>(
            'SELECT * FROM users WHERE id = $1 AND is_active = true',
            [apiToken.user_id]
          );
          if (user) {
            req.user = user;
            req.apiToken = apiToken;
            next();
            return;
          }
        }
      }
    }

    res.status(401).json({ error: 'Authentication required' });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: User['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const hierarchy: Record<User['role'], number> = {
      super_admin: 4, admin: 3, operator: 2, user: 1,
    };
    const userLevel = hierarchy[req.user.role];
    const requiredLevel = Math.min(...roles.map((r) => hierarchy[r]));
    if (userLevel < requiredLevel) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
