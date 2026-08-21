import { Router } from 'express';
import ContainerDistribution from '../models/ContainerDistribution.js';
import Container from '../models/Container.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import AuditLog from '../models/AuditLog.js';
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

// GET /api/distribution/matrix/:containerId - Excel-like Distribution Matrix
router.get('/matrix/:containerId', authenticate, async (req, res) => {
  try {
    const { containerId } = req.params;
    const [container, staffList, orders, distRecords] = await Promise.all([
      Container.findById(containerId),
      User.find({ role: 'staff' }).sort({ name: 1 }),
      Order.find({ status: { $ne: 'draft' } }),
      ContainerDistribution.find({ containerId })
    ]);

    if (!container) return res.status(404).json({ error: 'Container not found' });

    const loaded = container.loadedProducts || [];
    let products = [];

    if (loaded.length > 0) {
      const productIds = loaded.map(lp => lp.productId);
      products = await Product.find({ _id: { $in: productIds } });
    } else {
      products = await Product.find({ status: 'approved' });
    }

    const matrix = products.map(product => {
      const loadedEntry = loaded.find(lp => lp.productId.toString() === product._id.toString());
      const containerReceivedQty = loadedEntry ? loadedEntry.quantity : 0;

      let totalOrdered = 0;
      let totalDistributed = 0;
      const staffOrdered = {};
      const staffDistributed = {};
      const staffPending = {};

      const distRecord = distRecords.find(d => d.productId.toString() === product._id.toString());

      staffList.forEach(staff => {
        const staffOrders = orders.filter(o => o.staffId.toString() === staff._id.toString());
        let orderedQty = 0;
        staffOrders.forEach(o => {
          const item = o.items.find(i => i.productId.toString() === product._id.toString());
          if (item) orderedQty += Number(item.quantity || 0);
        });

        staffOrdered[staff._id.toString()] = orderedQty;
        totalOrdered += orderedQty;

        const distEntry = distRecord?.staffDistributions?.find(sd => sd.staffId.toString() === staff._id.toString());
        const distQty = distEntry ? Number(distEntry.quantity) : 0;
        staffDistributed[staff._id.toString()] = distQty;
        totalDistributed += distQty;

        // Pending = Ordered - Distributed
        staffPending[staff._id.toString()] = Math.max(0, orderedQty - distQty);
      });

      const remainingToDistribute = Math.max(0, containerReceivedQty - totalDistributed);

      return {
        productId: product._id.toString(),
        model: product.model,
        description: product.description,
        company: product.company,
        cuft: product.cuft || 0,
        containerReceivedQty,
        totalOrdered,
        totalDistributed,
        remainingToDistribute,
        staffOrdered,
        staffDistributed,
        staffPending
      };
    });

    res.json({
      container: {
        id: container._id.toString(),
        name: container.name,
        container_number: container.containerNumber,
        status: container.status
      },
      staff: staffList.map(s => ({ id: s._id.toString(), name: s.name })),
      matrix
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/distribution/update - Update cell distribution allocation
router.post('/update', authenticate, adminOnly, async (req, res) => {
  try {
    const { containerId, productId, staffId, quantity } = req.body;
    const targetQty = Number(quantity) || 0;

    let distRecord = await ContainerDistribution.findOne({ containerId, productId });

    if (!distRecord) {
      distRecord = new ContainerDistribution({
        containerId,
        productId,
        staffDistributions: []
      });
    }

    const staffEntryIndex = distRecord.staffDistributions.findIndex(sd => sd.staffId.toString() === staffId);
    const oldQty = staffEntryIndex >= 0 ? distRecord.staffDistributions[staffEntryIndex].quantity : 0;

    if (staffEntryIndex >= 0) {
      distRecord.staffDistributions[staffEntryIndex].quantity = targetQty;
    } else {
      distRecord.staffDistributions.push({ staffId, quantity: targetQty });
    }

    await distRecord.save();

    const [staff, product] = await Promise.all([
      User.findById(staffId),
      Product.findById(productId)
    ]);

    if (oldQty !== targetQty) {
      await recordAuditLog(
        req.user.id,
        req.user.name,
        'distribution_allocated',
        'container_distributions',
        productId,
        { staff: staff?.name, quantity: oldQty },
        { staff: staff?.name, quantity: targetQty },
        { containerId, model: product?.model, staffName: staff?.name, change: `${oldQty} → ${targetQty}` }
      );
    }

    res.json({
      message: 'Distribution quantity updated',
      containerId,
      productId,
      staffId,
      quantity: targetQty
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/distribution/pending - Pending items for salesperson
router.get('/pending', authenticate, async (req, res) => {
  try {
    const targetStaffId = req.user.role === 'admin' && req.query.staffId ? req.query.staffId : req.user.id;
    const [staff, orders, distRecords, products] = await Promise.all([
      User.findById(targetStaffId),
      Order.find({ staffId: targetStaffId }),
      ContainerDistribution.find(),
      Product.find({ status: 'approved' })
    ]);

    const productMap = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        const pId = item.productId.toString();
        productMap[pId] = (productMap[pId] || 0) + Number(item.quantity || 0);
      });
    });

    const distributedMap = {};
    distRecords.forEach(cd => {
      const entry = cd.staffDistributions.find(sd => sd.staffId.toString() === targetStaffId);
      if (entry) {
        const pId = cd.productId.toString();
        distributedMap[pId] = (distributedMap[pId] || 0) + Number(entry.quantity || 0);
      }
    });

    const pendingList = [];
    Object.keys(productMap).forEach(productId => {
      const product = products.find(p => p._id.toString() === productId);
      if (!product) return;

      const ordered = productMap[productId] || 0;
      const received = distributedMap[productId] || 0;
      const pending = Math.max(0, ordered - received);

      if (pending > 0) {
        pendingList.push({
          productId: product._id.toString(),
          model: product.model,
          description: product.description,
          company: product.company,
          ordered,
          received,
          pending,
          cuft: product.cuft || 0,
          pendingCuft: Number((pending * (product.cuft || 0)).toFixed(2))
        });
      }
    });

    res.json({
      staff: { id: staff?._id.toString(), name: staff?.name },
      pendingItems: pendingList,
      totalPendingQty: pendingList.reduce((s, i) => s + i.pending, 0),
      totalPendingCuft: Number(pendingList.reduce((s, i) => s + i.pendingCuft, 0).toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/distribution/received - Received items for salesperson
router.get('/received', authenticate, async (req, res) => {
  try {
    const targetStaffId = req.user.role === 'admin' && req.query.staffId ? req.query.staffId : req.user.id;
    const [staff, containers, distRecords, products] = await Promise.all([
      User.findById(targetStaffId),
      Container.find(),
      ContainerDistribution.find(),
      Product.find()
    ]);

    const receivedList = [];

    distRecords.forEach(cd => {
      const container = containers.find(c => c._id.toString() === cd.containerId.toString());
      const product = products.find(p => p._id.toString() === cd.productId.toString());
      const entry = cd.staffDistributions.find(sd => sd.staffId.toString() === targetStaffId);

      if (entry && entry.quantity > 0 && product) {
        receivedList.push({
          containerId: container?._id.toString(),
          containerName: container?.name || 'Container',
          containerNumber: container?.containerNumber,
          arrivalDate: container?.arrivalDate || 'Arrived',
          productId: product._id.toString(),
          model: product.model,
          description: product.description,
          company: product.company,
          quantityReceived: entry.quantity,
          cuft: product.cuft || 0,
          totalCuft: Number((entry.quantity * (product.cuft || 0)).toFixed(2))
        });
      }
    });

    res.json({
      staff: { id: staff?._id.toString(), name: staff?.name },
      receivedItems: receivedList,
      totalReceivedQty: receivedList.reduce((s, i) => s + i.quantityReceived, 0),
      totalReceivedCuft: Number(receivedList.reduce((s, i) => s + i.totalCuft, 0).toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/distribution/product-history/:productId - Product history across containers
router.get('/product-history/:productId', authenticate, async (req, res) => {
  try {
    const [product, orders, containers, distRecords] = await Promise.all([
      Product.findById(req.params.productId),
      Order.find({ status: { $ne: 'draft' } }),
      Container.find(),
      ContainerDistribution.find({ productId: req.params.productId })
    ]);

    if (!product) return res.status(404).json({ error: 'Product not found' });

    let totalOrdered = 0;
    orders.forEach(o => {
      const item = o.items.find(i => i.productId.toString() === product._id.toString());
      if (item) totalOrdered += Number(item.quantity || 0);
    });

    let totalDistributedAcrossContainers = 0;
    const containerBreakdown = containers.map(container => {
      const loadedEntry = (container.loadedProducts || []).find(
        lp => lp.productId.toString() === product._id.toString()
      );
      const distRecord = distRecords.find(d => d.containerId.toString() === container._id.toString());
      const distQty = distRecord?.staffDistributions?.reduce((s, sd) => s + Number(sd.quantity || 0), 0) || 0;

      totalDistributedAcrossContainers += distQty;

      return {
        containerId: container._id.toString(),
        containerName: container.name,
        containerNumber: container.containerNumber,
        status: container.status,
        arrivalDate: container.arrivalDate,
        loadedQuantity: loadedEntry ? loadedEntry.quantity : 0,
        distributedQuantity: distQty
      };
    });

    const stillPending = Math.max(0, totalOrdered - totalDistributedAcrossContainers);

    res.json({
      product: {
        id: product._id.toString(),
        model: product.model,
        description: product.description,
        company: product.company,
        cuft: product.cuft
      },
      totalOrdered,
      totalDistributed: totalDistributedAcrossContainers,
      stillPending,
      containers: containerBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
