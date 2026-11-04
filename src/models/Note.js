import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'archived'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['general', 'draft', 'submitted', 'approved', 'ordered', 'packed', 'loaded', 'arrived', 'completed'],
    default: 'general'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['general', 'order', 'container', 'supplier', 'staff', 'followup'],
    default: 'general'
  },
  color: {
    type: String,
    default: 'indigo'
  },
  pinned: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorName: {
    type: String,
    default: 'Admin'
  }
}, { timestamps: true });

noteSchema.index({ status: 1, pinned: -1, createdAt: -1 });
noteSchema.index({ orderStatus: 1 });
noteSchema.index({ createdBy: 1 });

export const Note = mongoose.models.Note || mongoose.model('Note', noteSchema);
export default Note;

