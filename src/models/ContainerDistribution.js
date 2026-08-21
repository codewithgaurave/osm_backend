import mongoose from 'mongoose';

const staffDistributionSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quantity: { type: Number, default: 0 }
}, { _id: false });

const containerDistributionSchema = new mongoose.Schema({
  containerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Container', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  staffDistributions: [staffDistributionSchema]
}, { timestamps: true });

containerDistributionSchema.index({ containerId: 1, productId: 1 }, { unique: true });

export const ContainerDistribution = mongoose.models.ContainerDistribution || mongoose.model('ContainerDistribution', containerDistributionSchema);
export default ContainerDistribution;
