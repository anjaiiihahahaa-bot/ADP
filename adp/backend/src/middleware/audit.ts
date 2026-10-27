import { Request, Response, NextFunction } from 'express';
import { query } from '../utils/db';

export async function auditLog(
  req: Request,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      || req.socket.remoteAddress;
    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user?.id || null, action, resourceType, resourceId || null, ip, JSON.stringify(details || {})]
    );
  } catch {
    // audit failure should not block the request
  }
}
