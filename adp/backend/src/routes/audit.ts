import { Router, Request, Response } from 'express';
import { query } from '../utils/db';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireRole('admin'));

// GET /api/v1/audit
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string || '1'));
  const limit = Math.min(100, parseInt(req.query.limit as string || '50'));
  const offset = (page - 1) * limit;
  const { action, resource_type, user_id } = req.query;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (action) { conditions.push(`action ILIKE $${i++}`); params.push(`%${action}%`); }
  if (resource_type) { conditions.push(`resource_type = $${i++}`); params.push(resource_type); }
  if (user_id) { conditions.push(`user_id = $${i++}`); params.push(user_id); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, total] = await Promise.all([
    query(
      `SELECT al.*, u.username FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where} ORDER BY al.created_at DESC LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) as count FROM audit_logs ${where}`, params),
  ]);

  res.json({
    data: rows,
    pagination: { page, limit, total: parseInt((total[0] as Record<string, string>).count), pages: Math.ceil(parseInt((total[0] as Record<string, string>).count) / limit) },
  });
});

export default router;
