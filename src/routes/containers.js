import { Router } from 'express';
import Container from '../models/Container.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import Notification from '../models/Notification.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

const recordAuditLog = async (userId, userName, action, entity, entityId, oldVal, newVal, details) => {
  try {
    await AuditLog.create({
      userId,
      userName,
      action,
      entity,
      entityId,
      oldValues: oldVal,
      newValues: newVal,
      details
    });
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
};

// GET /api/containers - list all containers with live capacity & loaded items
router.get('/', authenticate, async (req, res) => {
  try {
    const [containers, products] = await Promise.all([
      Container.find().sort({ createdAt: -1 }),
      Product.find({ status: 'approved' })
    ]);

    const result = containers.map(container => {
      let calculatedUsedCuft = 0;
      const loadedProducts = (container.loadedProducts || []).map(lp => {
        const product = products.find(p => p._id.toString() === lp.productId.toString());
        const qty = lp.quantity || 0;
        const unitCuft = product ? (product.cuft || 0) : 0;
        const totalCuft = Number((qty * unitCuft).toFixed(2));
        calculatedUsedCuft += totalCuft;

        return {
          productId: product ? product._id.toString() : lp.productId.toString(),
          model: product ? product.model : 'Unknown',
          description: product ? product.description : '',
          company: product ? product.company : '',
          quantity: qty,
          unitCuft,
          totalCuft
        };
      });

      const capacity = Number(container.capacityCuft || 2400);
      const usedCuft = Number(calculatedUsedCuft.toFixed(2));
      const remainingCuft = Number(Math.max(0, capacity - usedCuft).toFixed(2));

      return {
        id: container._id.toString(),
        name: container.name,
        container_number: container.containerNumber,
        capacity_cuft: capacity,
        used_cuft: usedCuft,
        remaining_cuft: remainingCuft,
        status: container.status,
        departure_date: container.departureDate,
        arrival_date: container.arrivalDate,
        notes: container.notes,
        loadedProducts
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/containers - admin creates container
router.post('/', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, container_number, capacity_cuft, departure_date, arrival_date, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Container name is required' });

    const newContainer = await Container.create({
      name,
      containerNumber: container_number || `CONT-${Date.now().toString().slice(-6)}`,
      capacityCuft: Number(capacity_cuft || 2400),
      usedCuft: 0,
      status: 'draft',
      departureDate: departure_date || null,
      arrivalDate: arrival_date || null,
      notes: notes || '',
      loadedProducts: []
    });

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'container_created',
      'containers',
      newContainer._id.toString(),
      null,
      newContainer.toObject(),
      { name: newContainer.name, capacity: newContainer.capacityCuft }
    );

    res.status(201).json({ id: newContainer._id.toString(), ...newContainer.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/containers/:id/assign - manual product assignment to container
router.post('/:id/assign', authenticate, adminOnly, async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ error: 'Container not found' });

    const { assignments } = req.body;
    if (!Array.isArray(assignments)) {
      return res.status(400).json({ error: 'Assignments array is required' });
    }

    const oldLoaded = [...container.loadedProducts];
    const products = await Product.find();

    const updatedLoaded = [];
    let calculatedUsedCuft = 0;

    assignments.forEach(item => {
      const qty = Number(item.quantity) || 0;
      if (qty > 0) {
        updatedLoaded.push({
          productId: item.productId,
          quantity: qty
        });

        const product = products.find(p => p._id.toString() === item.productId.toString());
        if (product) {
          calculatedUsedCuft += (qty * (product.cuft || 0));
        }
      }
    });

    container.loadedProducts = updatedLoaded;
    container.usedCuft = Number(calculatedUsedCuft.toFixed(2));
    await container.save();

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'container_assigned',
      'containers',
      container._id.toString(),
      { loadedProducts: oldLoaded },
      { loadedProducts: updatedLoaded, usedCuft: container.usedCuft },
      { containerName: container.name, totalItems: updatedLoaded.length }
    );

    res.json({
      message: 'Products assigned to container successfully',
      container: {
        id: container._id.toString(),
        ...container.toObject(),
        remaining_cuft: Number(Math.max(0, container.capacityCuft - container.usedCuft).toFixed(2))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/containers/:id/status - update container status
router.patch('/:id/status', authenticate, adminOnly, async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ error: 'Container not found' });

    const { status, arrival_date, departure_date } = req.body;
    const validStatuses = ['draft', 'loaded', 'at_sea', 'arrived', 'completed'];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const oldStatus = container.status;
    if (status) container.status = status;
    if (arrival_date) container.arrivalDate = arrival_date;
    if (departure_date) container.departureDate = departure_date;
    await container.save();

    if (status === 'arrived' && oldStatus !== 'arrived') {
      const staffList = await User.find({ role: 'staff' });
      for (const staff of staffList) {
        await Notification.create({
          userId: staff._id,
          title: 'Container Arrived!',
          message: `${container.name} has arrived at the warehouse. Distribution is now open.`,
          read: false
        });
      }
    }

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'container_status_changed',
      'containers',
      container._id.toString(),
      { status: oldStatus },
      { status: container.status },
      { containerName: container.name, from: oldStatus, to: container.status }
    );

    res.json({ message: `Container status updated to ${container.status}`, container });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
