import mongoose from 'mongoose';

const containerProductSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, default: 0 }
}, { _id: false });

const containerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  containerNumber: { type: String, required: true, unique: true },
  capacityCuft: { type: Number, default: 2400 },
  usedCuft: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'loaded', 'at_sea', 'arrived', 'completed'],
    default: 'draft'
  },
  departureDate: { type: String, default: null },
  arrivalDate: { type: String, default: null },
  notes: { type: String, default: '' },
  loadedProducts: [containerProductSchema]
}, { timestamps: true });

export const Container = mongoose.models.Container || mongoose.model('Container', containerSchema);
export default Container;
