import { Router } from 'express';
import User from '../models/User.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

// GET /api/staff - list all staff members
router.get('/', authenticate, async (req, res) => {
  try {
    const staff = await User.find({ role: 'staff' }).select('-password').sort({ name: 1 });
    res.json(staff.map(s => ({ id: s._id.toString(), ...s.toObject() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/staff - admin adds staff member
router.post('/', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, email, phone, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: 'User with this email already exists' });

    const newStaff = await User.create({
      name,
      email: email.toLowerCase().trim(),
      phone: phone || '',
      role: role || 'staff',
      password: 'password123'
    });

    res.status(201).json({ id: newStaff._id.toString(), ...newStaff.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/staff/:id - admin updates staff
router.put('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const staff = await User.findById(req.params.id);
    if (!staff) return res.status(404).json({ error: 'Staff member not found' });

    const { name, email, phone, role } = req.body;
    if (name) staff.name = name;
    if (email) staff.email = email.toLowerCase().trim();
    if (phone !== undefined) staff.phone = phone;
    if (role) staff.role = role;

    await staff.save();
    res.json({ id: staff._id.toString(), ...staff.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/staff/:id - admin removes staff
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Staff member not found' });
    res.json({ message: 'Staff member deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
