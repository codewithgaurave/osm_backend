import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Container from '../models/Container.js';
import ContainerDistribution from '../models/ContainerDistribution.js';
import AuditLog from '../models/AuditLog.js';
import Notification from '../models/Notification.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

export const connectDB = async () => {
  try {
    if (!MONGODB_URI) {
      console.warn('⚠️ MONGODB_URI not provided in .env');
      return;
    }

    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    await ensureAdminUser();
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
  }
};

const ensureAdminUser = async () => {
  try {
    let admin = await User.findOne({ email: 'admin@oms.com' });
    if (!admin) {
      console.log('🌱 Creating default Admin account...');
      admin = await User.create({
        name: 'Admin User',
        email: 'admin@oms.com',
        password: '123456',
        role: 'admin',
        phone: '+1234567890'
      });
    }
  } catch (err) {
    console.error('Error ensuring admin user:', err.message);
  }
};

