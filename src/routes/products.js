import { Router } from 'express';
import Product from '../models/Product.js';
import AuditLog from '../models/AuditLog.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

// Helper to record audit log
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

// GET /api/products - list all approved products with company/search filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { company, search } = req.query;
    const filter = { status: 'approved' };

    if (company && company !== 'All') {
      filter.company = new RegExp(`^${company}$`, 'i');
    }

    if (search) {
      const q = new RegExp(search, 'i');
      filter.$or = [
        { model: q },
        { description: q },
        { company: q }
      ];
    }

    const products = await Product.find(filter).sort({ company: 1, model: 1 });
    res.json(products.map(p => ({ id: p._id.toString(), ...p.toObject() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/companies - list unique companies
router.get('/companies', authenticate, async (req, res) => {
  try {
    const companies = await Product.distinct('company', { status: 'approved' });
    res.json(companies.sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/favorites - get logged in user's favorite product IDs
router.get('/favorites', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('favorites');
    const favorites = (user?.favorites || []).map(f => f.toString());
    res.json(favorites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/favorite - toggle favorite on/off
router.post('/:id/favorite', authenticate, async (req, res) => {
  try {
    const productId = req.params.id;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.favorites = user.favorites || [];
    const index = user.favorites.findIndex(f => f.toString() === productId);
    let isFavorite = false;

    if (index >= 0) {
      user.favorites.splice(index, 1);
      isFavorite = false;
    } else {
      user.favorites.push(productId);
      isFavorite = true;
    }

    await user.save();
    res.json({
      success: true,
      isFavorite,
      favorites: user.favorites.map(f => f.toString()),
      message: isFavorite ? 'Added to favorites' : 'Removed from favorites'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/pending - admin pending approval queue
router.get('/pending', authenticate, adminOnly, async (req, res) => {
  try {
    const pending = await Product.find({ status: 'pending' })
      .populate('requestedBy', 'name email')
      .sort({ createdAt: -1 });

    const enriched = pending.map(p => ({
      id: p._id.toString(),
      ...p.toObject(),
      requested_by_name: p.requestedBy?.name || 'Salesperson',
      requested_qty: p.requestedQty || 1
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products - admin creates new product directly
router.post('/', authenticate, adminOnly, async (req, res) => {
  try {
    const { company, model, description, cuft, weight, category, notes } = req.body;
    if (!company || !model || !description || cuft === undefined) {
      return res.status(400).json({ error: 'Company, model, description, and cuft are required.' });
    }

    const newProduct = await Product.create({
      company: company.toUpperCase().trim(),
      model: model.toUpperCase().trim(),
      description: description.trim(),
      cuft: Number(cuft),
      weight: Number(weight || 0),
      category: category || 'General',
      notes: notes || '',
      status: 'approved'
    });

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'product_created',
      'products',
      newProduct._id.toString(),
      null,
      newProduct.toObject(),
      { message: `Admin created new product ${newProduct.model}` }
    );

    res.status(201).json({ id: newProduct._id.toString(), ...newProduct.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/request - staff requests new product
router.post('/request', authenticate, async (req, res) => {
  try {
    const { company, model, description, quantity } = req.body;
    if (!company || !model || !description) {
      return res.status(400).json({ error: 'Company, model, and description are required.' });
    }

    const requestedProduct = await Product.create({
      company: company.toUpperCase().trim(),
      model: model.toUpperCase().trim(),
      description: description.trim(),
      cuft: 0,
      weight: 0,
      category: 'Pending Review',
      notes: `Requested qty: ${quantity || 1}`,
      requestedQty: Number(quantity || 1),
      status: 'pending',
      requestedBy: req.user.id
    });

    // Notify Admins
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await Notification.create({
        userId: admin._id,
        title: 'New Product Approval Request',
        message: `${req.user.name} requested approval for ${requestedProduct.company} ${requestedProduct.model} (${requestedProduct.description})`,
        read: false
      });
    }

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'product_requested',
      'products',
      requestedProduct._id.toString(),
      null,
      requestedProduct.toObject(),
      { quantity: requestedProduct.requestedQty }
    );

    res.status(201).json({ id: requestedProduct._id.toString(), ...requestedProduct.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id - admin updates product
router.put('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const oldProduct = product.toObject();
    const { company, model, description, cuft, weight, category, notes } = req.body;

    if (company) product.company = company.toUpperCase().trim();
    if (model) product.model = model.toUpperCase().trim();
    if (description) product.description = description.trim();
    if (cuft !== undefined) product.cuft = Number(cuft);
    if (weight !== undefined) product.weight = Number(weight);
    if (category) product.category = category;
    if (notes !== undefined) product.notes = notes;

    await product.save();

    // If cuft changed, synchronize existing orders containing this product
    if (cuft !== undefined && Number(cuft) !== oldProduct.cuft) {
      try {
        const affectedOrders = await Order.find({ 'items.productId': product._id });
        for (const order of affectedOrders) {
          let orderModified = false;
          order.items.forEach(item => {
            if (item.productId.toString() === product._id.toString()) {
              item.unitCuft = Number(cuft);
              orderModified = true;
            }
          });
          if (orderModified) {
            order.totalCuft = Number(order.items.reduce((s, i) => s + ((Number(i.quantity) || 0) * (i.unitCuft || 0)), 0).toFixed(2));
            await order.save();
          }
        }
      } catch (err) {
        console.warn('Order cuft sync error:', err.message);
      }
    }

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'product_updated',
      'products',
      product._id.toString(),
      oldProduct,
      product.toObject(),
      { message: `Updated details for ${product.model}` }
    );

    res.json({ id: product._id.toString(), ...product.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/approve - admin approves pending product
router.post('/:id/approve', authenticate, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { cuft, weight, category, notes, description } = req.body;
    if (cuft === undefined || cuft === null || Number(cuft) <= 0) {
      return res.status(400).json({ error: 'Valid Cubic Feet (Cuft) is required to approve product.' });
    }

    const oldProduct = product.toObject();
    product.status = 'approved';
    product.cuft = Number(cuft);
    if (weight !== undefined) product.weight = Number(weight);
    if (category) product.category = category;
    if (notes) product.notes = notes;
    if (description) product.description = description;

    await product.save();

    // Notify requester
    if (product.requestedBy) {
      await Notification.create({
        userId: product.requestedBy,
        title: 'Product Approved',
        message: `Your request for ${product.model} (${product.description}) has been approved and added to the master database.`,
        read: false
      });
    }

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'product_approved',
      'products',
      product._id.toString(),
      oldProduct,
      product.toObject(),
      { cuft: product.cuft }
    );

    res.json({ message: 'Product approved and added to master database', product: { id: product._id.toString(), ...product.toObject() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/reject - admin rejects pending product
router.post('/:id/reject', authenticate, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    product.status = 'rejected';
    await product.save();

    if (product.requestedBy) {
      await Notification.create({
        userId: product.requestedBy,
        title: 'Product Request Rejected',
        message: `Your request for ${product.model} was not approved.`,
        read: false
      });
    }

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'product_rejected',
      'products',
      product._id.toString(),
      { status: 'pending' },
      { status: 'rejected' },
      { reason: req.body.reason || 'Rejected by admin' }
    );

    res.json({ message: 'Product rejected', product: { id: product._id.toString(), ...product.toObject() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id - admin deletes product
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'product_deleted',
      'products',
      req.params.id,
      deleted.toObject(),
      null,
      { model: deleted.model }
    );

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
