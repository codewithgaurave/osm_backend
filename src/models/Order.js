import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, default: 1 },
  unitCuft: { type: Number, default: 0 }
}, { _id: true, timestamps: true });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true, sparse: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'ordered', 'packed', 'loaded', 'arrived', 'completed'],
    default: 'draft'
  },
  company: { type: String, default: '' },
  batchNumber: { type: String, default: 'Batch 1' },
  isSentToSupplier: { type: Boolean, default: false },
  sentToSupplierAt: { type: Date, default: null },
  parentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  items: [orderItemSchema],
  totalQuantity: { type: Number, default: 0 },
  totalCuft: { type: Number, default: 0 },
  date: { type: String, default: () => new Date().toISOString().split('T')[0] },
  notes: { type: String, default: '' }
}, { timestamps: true });

orderSchema.index({ staffId: 1, status: 1 });
orderSchema.index({ company: 1, isSentToSupplier: 1 });

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
export default Order;
