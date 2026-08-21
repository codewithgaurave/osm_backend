import { Router } from 'express';
import Order from '../models/Order.js';
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

// GET /api/orders/matrix - Excel grid view (Products x Staff)
router.get('/matrix', authenticate, async (req, res) => {
  try {
    const { company, search, staffId } = req.query;

    const productFilter = { status: 'approved' };
    if (company && company !== 'All') {
      productFilter.company = new RegExp(`^${company}$`, 'i');
    }
    if (search) {
      const q = new RegExp(search, 'i');
      productFilter.$or = [{ model: q }, { description: q }, { company: q }];
    }

    const staffFilter = { role: 'staff' };
    if (staffId && staffId !== 'All') {
      staffFilter._id = staffId;
    }

    const [products, staffList, orders] = await Promise.all([
      Product.find(productFilter).sort({ company: 1, model: 1 }),
      User.find(staffFilter).sort({ name: 1 }),
      Order.find({ status: { $ne: 'draft' } })
    ]);

    const matrix = products.map(product => {
      const row = {
        id: product._id.toString(),
        model: product.model,
        description: product.description,
        company: product.company,
        cuft: product.cuft || 0,
        total: 0,
        totalCuft: 0
      };

      staffList.forEach(staff => {
        const staffOrders = orders.filter(o => o.staffId.toString() === staff._id.toString());
        let staffQty = 0;
        staffOrders.forEach(o => {
          const item = o.items.find(i => i.productId.toString() === product._id.toString());
          if (item) staffQty += Number(item.quantity || 0);
        });

        row[staff._id.toString()] = staffQty;
        row.total += staffQty;
      });

      row.totalCuft = Number((row.total * (product.cuft || 0)).toFixed(2));
      return row;
    });

    res.json({
      matrix,
      staff: staffList.map(s => ({ id: s._id.toString(), name: s.name, email: s.email })),
      totalProducts: matrix.length,
      grandTotalQty: matrix.reduce((sum, r) => sum + r.total, 0),
      grandTotalCuft: Number(matrix.reduce((sum, r) => sum + r.totalCuft, 0).toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/company-view - View by Supplier
router.get('/company-view', authenticate, async (req, res) => {
  try {
    const { company } = req.query;
    const targetCompany = company || 'PREMIER';

    const [products, staffList, orders] = await Promise.all([
      Product.find({ status: 'approved', company: new RegExp(`^${targetCompany}$`, 'i') }),
      User.find({ role: 'staff' }),
      Order.find({ status: { $ne: 'draft' } })
    ]);

    const result = products.map(product => {
      const buyers = [];
      let totalQty = 0;

      staffList.forEach(staff => {
        const staffOrders = orders.filter(o => o.staffId.toString() === staff._id.toString());
        let qty = 0;
        staffOrders.forEach(o => {
          const item = o.items.find(i => i.productId.toString() === product._id.toString());
          if (item) qty += Number(item.quantity || 0);
        });

        if (qty > 0) {
          buyers.push({ staffId: staff._id.toString(), staffName: staff.name, quantity: qty });
          totalQty += qty;
        }
      });

      return {
        productId: product._id.toString(),
        model: product.model,
        description: product.description,
        cuft: product.cuft,
        totalQty,
        totalCuft: Number((totalQty * (product.cuft || 0)).toFixed(2)),
        buyers
      };
    });

    res.json({
      company: targetCompany,
      products: result,
      totalCompanyQty: result.reduce((sum, p) => sum + p.totalQty, 0),
      totalCompanyCuft: Number(result.reduce((sum, p) => sum + p.totalCuft, 0).toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/staff-view/:staffId - Staff breakdown
router.get('/staff-view/:staffId', authenticate, async (req, res) => {
  try {
    const staff = await User.findById(req.params.staffId);
    if (!staff) return res.status(404).json({ error: 'Staff member not found' });

    const orders = await Order.find({ staffId: staff._id }).populate('items.productId');

    const breakdownByCompany = {};
    let totalQty = 0;
    let totalCuft = 0;

    orders.forEach(order => {
      order.items.forEach(item => {
        const product = item.productId;
        if (!product) return;

        if (!breakdownByCompany[product.company]) {
          breakdownByCompany[product.company] = [];
        }

        const itemCuft = Number(((item.quantity || 0) * (product.cuft || 0)).toFixed(2));
        breakdownByCompany[product.company].push({
          productId: product._id.toString(),
          model: product.model,
          description: product.description,
          quantity: item.quantity,
          unitCuft: product.cuft,
          totalCuft: itemCuft
        });

        totalQty += Number(item.quantity || 0);
        totalCuft += itemCuft;
      });
    });

    res.json({
      staff: { id: staff._id.toString(), name: staff.name, email: staff.email },
      breakdown: breakdownByCompany,
      totalQuantity: totalQty,
      totalCubicFeet: Number(totalCuft.toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/cell-update - Direct Excel cell update with Audit History
router.post('/cell-update', authenticate, async (req, res) => {
  try {
    const { productId, staffId, quantity } = req.body;
    const targetStaffId = req.user.role === 'admin' ? staffId : req.user.id;
    const targetQty = Number(quantity) || 0;

    const [product, staff] = await Promise.all([
      Product.findById(productId),
      User.findById(targetStaffId)
    ]);

    if (!product || !staff) {
      return res.status(404).json({ error: 'Product or staff not found' });
    }

    // Find or create active order for this staff
    let order = await Order.findOne({ staffId: targetStaffId });
    if (!order) {
      order = await Order.create({
        orderNumber: `ORD-${Date.now().toString().slice(-4)}`,
        staffId: targetStaffId,
        status: 'submitted',
        items: []
      });
    }

    // Check item existence
    const itemIndex = order.items.findIndex(i => i.productId.toString() === productId);
    const oldQty = itemIndex >= 0 ? order.items[itemIndex].quantity : 0;

    if (targetQty <= 0) {
      if (itemIndex >= 0) {
        order.items.splice(itemIndex, 1);
      }
    } else if (itemIndex >= 0) {
      order.items[itemIndex].quantity = targetQty;
      order.items[itemIndex].unitCuft = product.cuft || 0;
    } else {
      order.items.push({
        productId: product._id,
        quantity: targetQty,
        unitCuft: product.cuft || 0
      });
    }

    // Recalculate totals
    order.totalQuantity = order.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    order.totalCuft = Number(order.items.reduce((s, i) => s + ((Number(i.quantity) || 0) * (i.unitCuft || 0)), 0).toFixed(2));
    await order.save();

    // Record Audit Log
    if (oldQty !== targetQty) {
      await recordAuditLog(
        req.user.id,
        req.user.name,
        'order_cell_updated',
        'order_items',
        productId,
        { product: `${product.model} (${product.description})`, staff: staff.name, quantity: oldQty },
        { product: `${product.model} (${product.description})`, staff: staff.name, quantity: targetQty },
        { change: `${oldQty} → ${targetQty}`, staffName: staff.name, model: product.model }
      );
    }

    res.json({ message: 'Order cell updated', productId, staffId: targetStaffId, quantity: targetQty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/submit - staff submits order
router.post('/submit', authenticate, async (req, res) => {
  try {
    const staffId = req.user.id;
    const order = await Order.findOne({ staffId, status: 'draft' });

    if (!order) {
      return res.status(400).json({ error: 'No draft order to submit' });
    }

    const orderNumber = `ORD-${Date.now().toString().slice(-4)}`;
    order.status = 'submitted';
    order.orderNumber = orderNumber;
    await order.save();

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'order_submitted',
      'orders',
      orderNumber,
      { status: 'draft' },
      { status: 'submitted' },
      { orderNumber }
    );

    res.json({ message: 'Order submitted successfully', orderNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/status - admin updates order lifecycle status (7 stages)
router.patch('/:id/status', authenticate, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const validStages = ['draft', 'submitted', 'approved', 'ordered', 'packed', 'loaded', 'arrived', 'completed'];

    if (!validStages.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStages.join(', ')}` });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const oldStatus = order.status;
    order.status = status;
    await order.save();

    // Notify staff member
    await Notification.create({
      userId: order.staffId,
      title: 'Order Status Update',
      message: `Order ${order.orderNumber || order._id} status changed to ${status.toUpperCase()}.`,
      read: false
    });

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'order_status_changed',
      'orders',
      order._id.toString(),
      { status: oldStatus },
      { status },
      { orderNumber: order.orderNumber, from: oldStatus, to: status }
    );

    res.json({ message: `Order status updated to ${status}`, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders - list orders
router.get('/', authenticate, async (req, res) => {
  try {
    const filter = req.user.role !== 'admin' ? { staffId: req.user.id } : {};
    const orders = await Order.find(filter).populate('staffId', 'name email').sort({ createdAt: -1 });

    const enriched = orders.map(o => ({
      id: o._id.toString(),
      orderNumber: o.orderNumber,
      status: o.status,
      date: o.date,
      staffName: o.staffId?.name || 'Unknown',
      itemCount: o.items.length,
      totalQuantity: o.totalQuantity,
      totalCuft: o.totalCuft
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
