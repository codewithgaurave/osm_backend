import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  company: { type: String, required: true, uppercase: true, trim: true },
  model: { type: String, required: true, uppercase: true, trim: true },
  description: { type: String, required: true, trim: true },
  cuft: { type: Number, default: 0 },
  weight: { type: Number, default: 0 },
  category: { type: String, default: 'General' },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  requestedQty: { type: Number, default: 0 }
}, { timestamps: true });

productSchema.index({ company: 1, model: 1 });
productSchema.index({ status: 1 });

export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export default Product;
