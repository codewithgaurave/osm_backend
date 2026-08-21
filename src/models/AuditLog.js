import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String, default: 'System' },
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: { type: String },
  oldValues: { type: mongoose.Schema.Types.Mixed, default: null },
  newValues: { type: mongoose.Schema.Types.Mixed, default: null },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
