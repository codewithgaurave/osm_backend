import { Router } from 'express';
import Note from '../models/Note.js';
import AuditLog from '../models/AuditLog.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

// Helper for audit logging
const logAudit = async (req, action, entityId, oldValues, newValues, details) => {
  try {
    await AuditLog.create({
      userId: req.user?.id || req.user?._id,
      userName: req.user?.name || 'Admin',
      action,
      entity: 'note',
      entityId: String(entityId),
      oldValues,
      newValues,
      details
    });
  } catch (err) {
    console.error('AuditLog error in notes route:', err.message);
  }
};

// GET /api/notes - list notes with optional filtering
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, orderStatus, priority, category, search } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }
    if (orderStatus && orderStatus !== 'all') {
      query.orderStatus = orderStatus;
    }
    if (priority && priority !== 'all') {
      query.priority = priority;
    }
    if (category && category !== 'all') {
      query.category = category;
    }
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { content: searchRegex },
        { tags: searchRegex }
      ];
    }

    // Sort pinned first, then newest updated/created
    const notes = await Note.find(query)
      .sort({ pinned: -1, updatedAt: -1, createdAt: -1 })
      .populate('createdBy', 'name email role');

    const formatted = notes.map(n => ({
      id: n._id.toString(),
      _id: n._id.toString(),
      title: n.title,
      content: n.content,
      status: n.status,
      orderStatus: n.orderStatus,
      priority: n.priority,
      category: n.category,
      color: n.color || 'indigo',
      pinned: !!n.pinned,
      tags: n.tags || [],
      authorName: n.authorName || n.createdBy?.name || 'Admin',
      createdAt: n.createdAt,
      updatedAt: n.updatedAt
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notes - create new note
router.post('/', authenticate, adminOnly, async (req, res) => {
  try {
    const {
      title,
      content,
      status,
      orderStatus,
      priority,
      category,
      color,
      pinned,
      tags
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const note = await Note.create({
      title: title.trim(),
      content: content ? content.trim() : '',
      status: status || 'pending',
      orderStatus: orderStatus || 'general',
      priority: priority || 'medium',
      category: category || 'general',
      color: color || 'indigo',
      pinned: !!pinned,
      tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []),
      createdBy: req.user.id || req.user._id,
      authorName: req.user.name || 'Admin'
    });

    await logAudit(
      req,
      'note_created',
      note._id,
      null,
      { title: note.title, status: note.status, orderStatus: note.orderStatus },
      { noteId: note._id }
    );

    res.status(201).json({
      id: note._id.toString(),
      _id: note._id.toString(),
      title: note.title,
      content: note.content,
      status: note.status,
      orderStatus: note.orderStatus,
      priority: note.priority,
      category: note.category,
      color: note.color,
      pinned: note.pinned,
      tags: note.tags,
      authorName: note.authorName,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/notes/:id - full update
router.put('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const oldValues = {
      title: note.title,
      content: note.content,
      status: note.status,
      orderStatus: note.orderStatus,
      priority: note.priority,
      category: note.category,
      pinned: note.pinned
    };

    const {
      title,
      content,
      status,
      orderStatus,
      priority,
      category,
      color,
      pinned,
      tags
    } = req.body;

    if (title !== undefined) note.title = title.trim();
    if (content !== undefined) note.content = content.trim();
    if (status !== undefined) note.status = status;
    if (orderStatus !== undefined) note.orderStatus = orderStatus;
    if (priority !== undefined) note.priority = priority;
    if (category !== undefined) note.category = category;
    if (color !== undefined) note.color = color;
    if (pinned !== undefined) note.pinned = !!pinned;
    if (tags !== undefined) {
      note.tags = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean);
    }

    await note.save();

    await logAudit(
      req,
      'note_updated',
      note._id,
      oldValues,
      {
        title: note.title,
        status: note.status,
        orderStatus: note.orderStatus,
        priority: note.priority
      },
      { noteId: note._id }
    );

    res.json({
      id: note._id.toString(),
      _id: note._id.toString(),
      title: note.title,
      content: note.content,
      status: note.status,
      orderStatus: note.orderStatus,
      priority: note.priority,
      category: note.category,
      color: note.color,
      pinned: note.pinned,
      tags: note.tags,
      authorName: note.authorName,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notes/:id/status - quick update status
router.patch('/:id/status', authenticate, adminOnly, async (req, res) => {
  try {
    const { status, orderStatus } = req.body;
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const oldStatus = note.status;
    if (status) note.status = status;
    if (orderStatus) note.orderStatus = orderStatus;

    await note.save();

    await logAudit(
      req,
      'note_status_updated',
      note._id,
      { status: oldStatus },
      { status: note.status },
      { noteId: note._id }
    );

    res.json({
      id: note._id.toString(),
      _id: note._id.toString(),
      ...note.toObject()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notes/:id/pin - toggle pin
router.patch('/:id/pin', authenticate, adminOnly, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    note.pinned = !note.pinned;
    await note.save();

    res.json({
      id: note._id.toString(),
      _id: note._id.toString(),
      pinned: note.pinned
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notes/:id - remove note
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const note = await Note.findByIdAndDelete(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    await logAudit(
      req,
      'note_deleted',
      req.params.id,
      { title: note.title },
      null,
      { noteId: req.params.id }
    );

    res.json({ message: 'Note deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

