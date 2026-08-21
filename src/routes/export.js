import { Router } from 'express';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/export/purchase-order/:company - Generate Supplier Purchase Order summary
router.get('/purchase-order/:company', authenticate, async (req, res) => {
  try {
    const company = req.params.company.toUpperCase();
    const [products, orders] = await Promise.all([
      Product.find({ status: 'approved', company: new RegExp(`^${company}$`, 'i') }),
      Order.find({ status: { $ne: 'draft' } })
    ]);

    const poItems = [];
    let grandTotalQty = 0;
    let grandTotalCuft = 0;

    products.forEach(product => {
      let totalQty = 0;
      orders.forEach(o => {
        const item = o.items.find(i => i.productId.toString() === product._id.toString());
        if (item) totalQty += Number(item.quantity || 0);
      });

      if (totalQty > 0) {
        const itemCuft = Number((totalQty * (product.cuft || 0)).toFixed(2));
        poItems.push({
          productId: product._id.toString(),
          model: product.model,
          description: product.description,
          totalQuantity: totalQty,
          cuft: product.cuft || 0,
          totalCuft: itemCuft
        });
        grandTotalQty += totalQty;
        grandTotalCuft += itemCuft;
      }
    });

    const purchaseOrderNumber = `PO-${company.substring(0, 4)}-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

    res.json({
      purchaseOrderNumber,
      company,
      date: new Date().toISOString().split('T')[0],
      items: poItems,
      grandTotalQuantity: grandTotalQty,
      grandTotalCubicFeet: Number(grandTotalCuft.toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
