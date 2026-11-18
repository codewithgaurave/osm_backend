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
    if (company && company !== 'All' && company !== 'undefined' && company !== 'null') {
      productFilter.company = new RegExp(`^${company.trim()}$`, 'i');
    }
    if (search && search !== 'undefined' && search !== 'null' && search.trim() !== '') {
      const q = new RegExp(search.trim(), 'i');
      productFilter.$or = [{ model: q }, { description: q }, { company: q }];
    }

    const staffFilter = { role: 'staff' };
    if (staffId && staffId !== 'All' && staffId !== 'undefined' && staffId !== 'null') {
      staffFilter._id = staffId;
    }

    const [products, staffList, orders] = await Promise.all([
      Product.find(productFilter).sort({ company: 1, model: 1 }),
      User.find(staffFilter).sort({ name: 1 }),
      Order.find({})
    ]);

    // For each staff member, find their single active order to show in the matrix.
    // Active order = unsent draft first; if none, the most recent unsent order.
    // We do NOT sum across all batches — that would inflate quantities.
    const activeOrderByStaff = {};
    staffList.forEach(staff => {
      const sid = staff._id.toString();
      const staffOrders = orders
        .filter(o => o.staffId.toString() === sid)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      // Prefer an unsent draft; fall back to the latest unsent order
      const activeDraft = staffOrders.find(o => !o.isSentToSupplier && o.status === 'draft');
      const latestUnsent = staffOrders.find(o => !o.isSentToSupplier);
      activeOrderByStaff[sid] = activeDraft || latestUnsent || null;
    });

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
        const sid = staff._id.toString();
        const activeOrder = activeOrderByStaff[sid];
        let staffQty = 0;
        if (activeOrder) {
          const item = activeOrder.items.find(i => i.productId.toString() === product._id.toString());
          if (item) staffQty = Number(item.quantity || 0);
        }

        row[sid] = staffQty;
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

    // Check all previous orders for this staff — sort newest first so we always
    // operate on the same order document that the matrix query displays.
    const staffOrders = await Order.find({ staffId: targetStaffId }).sort({ createdAt: -1 });

    // Placed/Completed orders: any order where status is not draft, or already sent to supplier
    const placedOrders = staffOrders.filter(o => 
      o.isSentToSupplier || ['submitted', 'approved', 'ordered', 'packed', 'loaded', 'arrived', 'completed'].includes(o.status)
    );

    // All unsent draft orders (there may be multiple due to historical bug)
    const draftOrders = staffOrders.filter(o => !o.isSentToSupplier && o.status === 'draft');

    // If multiple drafts exist, consolidate them into one (merge items, delete extras)
    if (draftOrders.length > 1) {
      const primaryDraft = draftOrders[0]; // newest draft (sort desc)
      for (let i = 1; i < draftOrders.length; i++) {
        const extra = draftOrders[i];
        extra.items.forEach(extraItem => {
          const existingIdx = primaryDraft.items.findIndex(
            pi => pi.productId.toString() === extraItem.productId.toString()
          );
          if (existingIdx >= 0) {
            // Keep the higher quantity (take the latest intent)
            if (Number(extraItem.quantity) > Number(primaryDraft.items[existingIdx].quantity)) {
              primaryDraft.items[existingIdx].quantity = extraItem.quantity;
            }
          } else {
            primaryDraft.items.push({ productId: extraItem.productId, quantity: extraItem.quantity, unitCuft: extraItem.unitCuft });
          }
        });
        await Order.findByIdAndDelete(extra._id);
      }
      primaryDraft.totalQuantity = primaryDraft.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      primaryDraft.totalCuft = Number(primaryDraft.items.reduce((s, i) => s + ((Number(i.quantity) || 0) * (i.unitCuft || 0)), 0).toFixed(2));
      await primaryDraft.save();
    }

    // Active unsubmitted draft order — always the newest one
    let activeDraftOrder = draftOrders[0] || null;

    // Check if any placed order already contains this product
    const placedOrderWithItem = placedOrders.find(o => 
      o.items.some(i => i.productId.toString() === productId.toString())
    );

    let order;
    let isNewOrderCreated = false;

    if (placedOrders.length > 0 && !activeDraftOrder) {
      // If previous order(s) exist and are already placed/submitted ("order ho chuka hai"),
      // and a new product (or new quantity) is added, it MUST become a NEW ORDER!
      const totalStaffOrders = staffOrders.length;
      const batchCount = totalStaffOrders + 1;
      const parentOrder = placedOrderWithItem || placedOrders[placedOrders.length - 1];

      order = await Order.create({
        orderNumber: `ORD-${Date.now().toString().slice(-4)}-B${batchCount}`,
        staffId: targetStaffId,
        status: 'submitted',
        company: product.company,
        batchNumber: `Batch ${batchCount} (New Order)`,
        isSentToSupplier: false,
        parentOrderId: parentOrder ? parentOrder._id : null,
        items: []
      });
      isNewOrderCreated = true;
    } else if (activeDraftOrder) {
      // If there is an open draft (unsubmitted) order, use that draft
      order = activeDraftOrder;
    } else {
      // First order for this staff
      order = await Order.create({
        orderNumber: `ORD-${Date.now().toString().slice(-4)}`,
        staffId: targetStaffId,
        status: 'draft',
        company: product.company,
        batchNumber: 'Batch 1',
        isSentToSupplier: false,
        items: []
      });
    }

    // Check item existence in the target order
    const itemIndex = order.items.findIndex(i => i.productId.toString() === productId.toString());
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

    // If new order was created because previous order was already placed, notify admins
    if (isNewOrderCreated && targetQty > 0) {
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          title: 'New Order Batch Created',
          message: `${staff.name} added ${product.model} as a new order (${order.orderNumber} - ${order.batchNumber}) because previous order was already placed.`,
          read: false
        });
      }
    }

    // Record Audit Log
    if (oldQty !== targetQty || isNewOrderCreated) {
      await recordAuditLog(
        req.user.id,
        req.user.name,
        isNewOrderCreated ? 'new_order_created_for_product' : 'order_cell_updated',
        'order_items',
        productId,
        { product: `${product.model} (${product.description})`, staff: staff.name, quantity: oldQty },
        { product: `${product.model} (${product.description})`, staff: staff.name, quantity: targetQty, batch: order.batchNumber, orderNumber: order.orderNumber },
        { 
          change: `${oldQty} → ${targetQty}`, 
          staffName: staff.name, 
          model: product.model, 
          batch: order.batchNumber,
          isNewOrder: isNewOrderCreated,
          details: isNewOrderCreated ? `Created new order ${order.orderNumber} because previous order was already placed` : 'Cell quantity updated'
        }
      );
    }

    res.json({ 
      message: isNewOrderCreated ? 'Previous order was already placed. Created as a new order batch.' : 'Order cell updated', 
      productId, 
      staffId: targetStaffId, 
      quantity: targetQty,
      batchNumber: order.batchNumber,
      orderNumber: order.orderNumber,
      isNewOrder: isNewOrderCreated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/submit - staff submits order
router.post('/submit', authenticate, async (req, res) => {
  try {
    const staffId = req.user.id;
    // Find active (unsent) orders for this staff
    const activeOrders = await Order.find({ staffId, isSentToSupplier: false });

    if (!activeOrders || activeOrders.length === 0 || activeOrders.every(o => !o.items || o.items.length === 0 || o.totalQuantity === 0)) {
      return res.status(400).json({ error: 'No items found in your order. Please enter quantities in the grid before submitting.' });
    }

    const orderNumbers = [];

    for (const order of activeOrders) {
      if (order.totalQuantity > 0) {
        if (!order.orderNumber) {
          order.orderNumber = `ORD-${Date.now().toString().slice(-4)}`;
        }
        order.status = 'submitted';
        await order.save();
        orderNumbers.push(order.orderNumber);

        // Notify admins
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
          await Notification.create({
            userId: admin._id,
            title: 'Order Batch Submitted',
            message: `${req.user.name} submitted order ${order.orderNumber} with ${order.totalQuantity} items (${order.totalCuft} cuft).`,
            read: false
          });
        }

        await recordAuditLog(
          req.user.id,
          req.user.name,
          'order_submitted',
          'orders',
          order._id.toString(),
          null,
          { status: 'submitted', totalQuantity: order.totalQuantity, totalCuft: order.totalCuft },
          { orderNumber: order.orderNumber, staffName: req.user.name }
        );
      }
    }

    res.json({ 
      success: true, 
      message: `Orders submitted successfully! (${orderNumbers.join(', ')})`, 
      orderNumbers,
      orderNumber: orderNumbers[0] 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/add-product - Add new product to order (creates NEW ORDER if order is already placed/submitted)
router.post('/:id/add-product', authenticate, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const targetQty = Number(quantity);

    if (!productId || isNaN(targetQty) || targetQty <= 0) {
      return res.status(400).json({ error: 'Valid productId and positive quantity are required.' });
    }

    const [targetOrder, product] = await Promise.all([
      Order.findById(req.params.id),
      Product.findById(productId)
    ]);

    if (!targetOrder) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    // Check authorization: Admin can add to any order, staff can add to their own order
    if (req.user.role !== 'admin' && targetOrder.staffId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to modify this order.' });
    }

    const isOrderPlaced = targetOrder.isSentToSupplier || ['submitted', 'approved', 'ordered', 'packed', 'loaded', 'arrived', 'completed'].includes(targetOrder.status);

    if (isOrderPlaced) {
      // Order is already placed/submitted! As required: "koi order ho chuka hai aur koi aur product usme add kiya jata hai to wo as a new order banega"
      const totalStaffOrders = await Order.countDocuments({ staffId: targetOrder.staffId });
      const batchCount = totalStaffOrders + 1;
      const newOrderNumber = `ORD-${Date.now().toString().slice(-4)}-B${batchCount}`;

      const newOrder = await Order.create({
        orderNumber: newOrderNumber,
        staffId: targetOrder.staffId,
        status: 'submitted',
        company: product.company || targetOrder.company,
        batchNumber: `Batch ${batchCount} (Addendum to ${targetOrder.orderNumber})`,
        isSentToSupplier: false,
        parentOrderId: targetOrder._id,
        items: [{
          productId: product._id,
          quantity: targetQty,
          unitCuft: product.cuft || 0
        }],
        totalQuantity: targetQty,
        totalCuft: Number((targetQty * (product.cuft || 0)).toFixed(2)),
        notes: `Added as new order linked to previous placed order ${targetOrder.orderNumber}`
      });

      // Notify admins
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          title: 'New Order Created for Product',
          message: `${req.user.name} added ${product.model} (qty: ${targetQty}) as a new order (${newOrder.orderNumber}) because ${targetOrder.orderNumber} was already placed.`,
          read: false
        });
      }

      await recordAuditLog(
        req.user.id,
        req.user.name,
        'new_order_created_for_product',
        'orders',
        newOrder._id.toString(),
        { originalOrder: targetOrder.orderNumber, status: targetOrder.status },
        { newOrderNumber: newOrder.orderNumber, product: product.model, quantity: targetQty },
        { message: `Created new order ${newOrder.orderNumber} because ${targetOrder.orderNumber} is already ${targetOrder.status}.` }
      );

      return res.status(201).json({
        success: true,
        isNewOrder: true,
        newOrder,
        message: `Order ${targetOrder.orderNumber} was already placed (${targetOrder.status}). A new order (${newOrder.orderNumber}) has been created with ${product.model}!`
      });
    } else {
      // Order is still a draft, append or update item directly
      const itemIndex = targetOrder.items.findIndex(i => i.productId.toString() === productId.toString());
      if (itemIndex >= 0) {
        targetOrder.items[itemIndex].quantity += targetQty;
      } else {
        targetOrder.items.push({
          productId: product._id,
          quantity: targetQty,
          unitCuft: product.cuft || 0
        });
      }

      targetOrder.totalQuantity = targetOrder.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      targetOrder.totalCuft = Number(targetOrder.items.reduce((s, i) => s + ((Number(i.quantity) || 0) * (i.unitCuft || 0)), 0).toFixed(2));
      await targetOrder.save();

      await recordAuditLog(
        req.user.id,
        req.user.name,
        'draft_order_product_added',
        'orders',
        targetOrder._id.toString(),
        null,
        { product: product.model, addedQuantity: targetQty },
        { message: `Added ${product.model} to draft order ${targetOrder.orderNumber}` }
      );

      return res.json({
        success: true,
        isNewOrder: false,
        order: targetOrder,
        message: `Added ${product.model} to draft order ${targetOrder.orderNumber}.`
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/mark-sent - Admin marks purchase order batch as sent to supplier
// POST /api/orders/:id/mark-sent - Admin marks purchase order batch as sent to supplier
router.post('/:id/mark-sent', authenticate, adminOnly, async (req, res) => {
  try {
    const { productIds } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (productIds && Array.isArray(productIds) && productIds.length > 0 && productIds.length < order.items.length) {
      // Split order: selectedItems are sent, unselectedItems are split to a remainder batch
      const selectedItems = order.items.filter(i => productIds.includes(i.productId.toString()));
      const unselectedItems = order.items.filter(i => !productIds.includes(i.productId.toString()));

      // Create a remainder batch (unsent)
      const batchCount = (await Order.countDocuments({ staffId: order.staffId })) + 1;
      const remainderOrder = await Order.create({
        orderNumber: `ORD-${Date.now().toString().slice(-4)}-R${batchCount}`,
        staffId: order.staffId,
        status: 'submitted',
        company: order.company,
        batchNumber: `${order.batchNumber || 'Batch 1'} (Remainder)`,
        isSentToSupplier: false,
        items: unselectedItems.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          unitCuft: i.unitCuft
        })),
        totalQuantity: unselectedItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
        totalCuft: Number(unselectedItems.reduce((s, i) => s + ((Number(i.quantity) || 0) * (i.unitCuft || 0)), 0).toFixed(2))
      });

      // Keep only selected items in the original order and mark as sent
      order.items = selectedItems;
      order.totalQuantity = selectedItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      order.totalCuft = Number(selectedItems.reduce((s, i) => s + ((Number(i.quantity) || 0) * (i.unitCuft || 0)), 0).toFixed(2));
      order.isSentToSupplier = true;
      order.sentToSupplierAt = new Date();
      order.status = 'ordered';
      await order.save();

      await recordAuditLog(
        req.user.id,
        req.user.name,
        'order_sent_partial',
        'orders',
        order._id.toString(),
        { originalItemsCount: order.items.length + unselectedItems.length },
        { sentItemsCount: selectedItems.length, remainderOrderId: remainderOrder._id.toString() },
        { 
          orderNumber: order.orderNumber, 
          details: `Sent ${selectedItems.length} items. Split ${unselectedItems.length} remaining items to new batch ${remainderOrder.orderNumber}`
        }
      );

      return res.json({ 
        message: 'Partial order marked as sent. Remainder items split into new batch.', 
        order,
        remainderOrder 
      });
    } else {
      order.isSentToSupplier = true;
      order.sentToSupplierAt = new Date();
      order.status = 'ordered';
      await order.save();

      await recordAuditLog(
        req.user.id,
        req.user.name,
        'order_sent_to_supplier',
        'orders',
        order._id.toString(),
        { isSentToSupplier: false },
        { isSentToSupplier: true, status: 'ordered' },
        { orderNumber: order.orderNumber, batch: order.batchNumber }
      );

      res.json({ message: 'Order marked as sent to supplier', order });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/combine - Admin combines an approved addendum batch into a target order
router.post('/:id/combine', authenticate, adminOnly, async (req, res) => {
  try {
    const addendumOrder = await Order.findById(req.params.id);
    if (!addendumOrder) return res.status(404).json({ error: 'Addendum order not found' });

    const targetOrderId = req.body.targetOrderId || addendumOrder.parentOrderId;
    if (!targetOrderId) {
      return res.status(400).json({ error: 'Target order ID is required for combining' });
    }

    const targetOrder = await Order.findById(targetOrderId);
    if (!targetOrder) return res.status(404).json({ error: 'Target order not found' });

    // Merge items from addendum into target order
    addendumOrder.items.forEach(addendumItem => {
      const existingIdx = targetOrder.items.findIndex(
        i => i.productId.toString() === addendumItem.productId.toString()
      );
      if (existingIdx >= 0) {
        targetOrder.items[existingIdx].quantity += addendumItem.quantity;
      } else {
        targetOrder.items.push({
          productId: addendumItem.productId,
          quantity: addendumItem.quantity,
          unitCuft: addendumItem.unitCuft
        });
      }
    });

    // Recalculate target totals
    targetOrder.totalQuantity = targetOrder.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    targetOrder.totalCuft = Number(
      targetOrder.items.reduce((s, i) => s + ((Number(i.quantity) || 0) * (i.unitCuft || 0)), 0).toFixed(2)
    );
    await targetOrder.save();

    // Delete or mark addendum order as merged
    await Order.findByIdAndDelete(addendumOrder._id);

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'orders_combined',
      'orders',
      targetOrder._id.toString(),
      { combinedOrder: addendumOrder.orderNumber },
      { newTotalQty: targetOrder.totalQuantity, newTotalCuft: targetOrder.totalCuft },
      { message: `Combined ${addendumOrder.orderNumber} into ${targetOrder.orderNumber}` }
    );

    res.json({ message: 'Orders combined successfully', targetOrder });
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
    if (status === 'ordered' && !order.isSentToSupplier) {
      order.isSentToSupplier = true;
      order.sentToSupplierAt = new Date();
    }
    await order.save();

    // Notify staff member
    await Notification.create({
      userId: order.staffId,
      title: 'Order Status Update',
      message: `Order ${order.orderNumber || order._id} (${order.batchNumber || 'Batch 1'}) status changed to ${status.toUpperCase()}.`,
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

// PATCH /api/orders/:id/notes - update order notes
router.patch('/:id/notes', authenticate, async (req, res) => {
  try {
    const { notes } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Authorization: Admin can update any notes, Staff can only update their own order notes
    if (req.user.role !== 'admin' && order.staffId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const oldNotes = order.notes || '';
    order.notes = notes || '';
    await order.save();

    await recordAuditLog(
      req.user.id,
      req.user.name,
      'order_notes_updated',
      'orders',
      order._id.toString(),
      { notes: oldNotes },
      { notes: order.notes },
      { orderNumber: order.orderNumber, notes: order.notes }
    );

    res.json({ message: 'Order notes updated successfully', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders - list orders
router.get('/', authenticate, async (req, res) => {
  try {
    const filter = req.user.role !== 'admin' ? { staffId: req.user.id } : {};
    const orders = await Order.find(filter)
      .populate('staffId', 'name email')
      .populate('items.productId', 'model description company cuft')
      .sort({ createdAt: -1 });

    const enriched = orders.map(o => ({
      id: o._id.toString(),
      orderNumber: o.orderNumber,
      status: o.status,
      batchNumber: o.batchNumber || 'Batch 1',
      isSentToSupplier: o.isSentToSupplier || false,
      sentToSupplierAt: o.sentToSupplierAt,
      parentOrderId: o.parentOrderId ? o.parentOrderId.toString() : null,
      company: o.company || '',
      date: o.date,
      staffId: o.staffId?._id?.toString() || (typeof o.staffId === 'string' ? o.staffId : null),
      staffName: o.staffId?.name || 'Unknown',
      itemCount: o.items.length,
      totalQuantity: o.totalQuantity,
      totalCuft: o.totalCuft,
      notes: o.notes || '',
      items: o.items.map(i => ({
        id: i._id?.toString(),
        productId: i.productId?._id?.toString() || i.productId,
        model: i.productId?.model || 'Product',
        description: i.productId?.description || '',
        company: i.productId?.company || '',
        quantity: i.quantity,
        unitCuft: i.unitCuft
      }))
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
