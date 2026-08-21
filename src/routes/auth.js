import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'oms_production_jwt_secret_key_2026_secure';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    let user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      // Auto create demo user if not existing
      const userRole = role || (email.includes('admin') ? 'admin' : 'staff');
      const name = email.split('@')[0].replace('.', ' ').replace(/^./, str => str.toUpperCase());
      user = await User.create({
        name,
        email: email.toLowerCase().trim(),
        password: password || 'password123',
        role: userRole,
        phone: '+1234567890'
      });
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.name,
        phone: user.phone
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user._id.toString(), ...user.toObject() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email.toLowerCase().trim();
    if (phone !== undefined) user.phone = phone;
    await user.save();

    res.json({ message: 'Profile updated successfully', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const user = await User.findById(req.user.id);
    if (user) {
      user.password = newPassword;
      await user.save();
    }
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
