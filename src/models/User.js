import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: '123456' },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
  phone: { type: String, default: '' },
  avatarUrl: { type: String, default: '' }
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
