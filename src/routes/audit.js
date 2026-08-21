import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/audit - list audit logs with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { userId, action, entity, search } = req.query;
    const filter = {};

    if (req.user.role !== 'admin') {
      filter.userId = req.user.id;
    } else if (userId && userId !== 'All') {
      filter.userId = userId;
    }

    if (action && action !== 'All') {
      filter.action = action;
    }

    if (entity && entity !== 'All') {
      filter.entity = entity;
    }

    if (search) {
      const q = new RegExp(search, 'i');
      filter.$or = [
        { userName: q },
        { action: q },
        { entity: q }
      ];
    }

    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200);

    res.json({
      total: logs.length,
      logs: logs.map(l => ({
        id: l._id.toString(),
        user_name: l.userName,
        action: l.action,
        entity: l.entity,
        entity_id: l.entityId,
        old_values: l.oldValues,
        new_values: l.newValues,
        details: l.details,
        created_at: l.createdAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
