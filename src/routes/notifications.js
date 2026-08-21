import { Router } from 'express';
import Notification from '../models/Notification.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/notifications - user notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 });
    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({
      notifications: notifications.map(n => ({
        id: n._id.toString(),
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.read,
        link: n.link,
        created_at: n.createdAt
      })),
      unreadCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read - mark single as read
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const notif = await Notification.findOne({ _id: req.params.id, userId: req.user.id });
    if (notif) {
      notif.read = true;
      await notif.save();
    }
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/mark-all-read - mark all as read
router.post('/mark-all-read', authenticate, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id }, { $set: { read: true } });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
