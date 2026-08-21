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
    await seedInitialData();
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
  }
};

const seedInitialData = async () => {
  try {
    // 1. Seed Users if empty
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('🌱 Seeding initial users...');
      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@oms.com',
        password: 'password123',
        role: 'admin',
        phone: '+1234567890'
      });

      const staffAhmed = await User.create({
        name: 'Ahmed',
        email: 'ahmed@oms.com',
        password: 'password123',
        role: 'staff',
        phone: '+1234567891'
      });

      const staffJohn = await User.create({
        name: 'John',
        email: 'john@oms.com',
        password: 'password123',
        role: 'staff',
        phone: '+1234567892'
      });

      const staffAli = await User.create({
        name: 'Ali',
        email: 'ali@oms.com',
        password: 'password123',
        role: 'staff',
        phone: '+1234567893'
      });

      const staffSarah = await User.create({
        name: 'Sarah',
        email: 'sarah@oms.com',
        password: 'password123',
        role: 'staff',
        phone: '+1234567894'
      });

      // 2. Seed Master Products
      console.log('🌱 Seeding master products...');
      const productsData = [
        { company: 'PREMIER', model: 'MW-6647', description: 'Microwave 0.7 cuft 700W', cuft: 0.85, weight: 10.5, category: 'Kitchen', status: 'approved' },
        { company: 'PREMIER', model: 'ED-6638', description: 'Electric Kettle Stainless Steel 1.7L', cuft: 1.30, weight: 1.2, category: 'Appliances', status: 'approved' },
        { company: 'PREMIER', model: 'BL-1020', description: 'Countertop Blender 500W', cuft: 0.95, weight: 2.5, category: 'Kitchen', status: 'approved' },
        { company: 'PREMIER', model: 'ED-7984GL', description: 'Glass Top Gas Stove 2 Burner', cuft: 2.10, weight: 6.0, category: 'Kitchen', status: 'approved' },
        { company: 'MIDEA', model: 'MD-FR250', description: 'Double Door Refrigerator 250L', cuft: 12.50, weight: 48.0, category: 'Refrigeration', status: 'approved' },
        { company: 'MIDEA', model: 'MD-AC1200', description: 'Split Air Conditioner 12000 BTU', cuft: 4.80, weight: 28.0, category: 'Cooling', status: 'approved' },
        { company: 'MIDEA', model: 'MD-WM80', description: 'Front Load Washing Machine 8kg', cuft: 8.20, weight: 62.0, category: 'Laundry', status: 'approved' },
        { company: 'SAMSUNG', model: 'SM-TV55', description: '55-inch 4K UHD Smart TV', cuft: 5.40, weight: 15.0, category: 'Electronics', status: 'approved' },
        { company: 'SONY', model: 'SN-HT300', description: 'Home Theater Soundbar System', cuft: 1.80, weight: 7.5, category: 'Audio', status: 'approved' }
      ];

      const createdProducts = await Product.insertMany(productsData);

      // 3. Seed Initial Orders
      console.log('🌱 Seeding initial orders...');
      const p1 = createdProducts[0]; // MW-6647
      const p2 = createdProducts[1]; // ED-6638
      const p5 = createdProducts[4]; // MD-FR250

      await Order.create({
        orderNumber: 'ORD-1001',
        staffId: staffAhmed._id,
        status: 'submitted',
        items: [
          { productId: p1._id, quantity: 5, unitCuft: p1.cuft },
          { productId: p2._id, quantity: 12, unitCuft: p2.cuft },
          { productId: p5._id, quantity: 2, unitCuft: p5.cuft }
        ],
        totalQuantity: 19,
        totalCuft: (5 * p1.cuft) + (12 * p2.cuft) + (2 * p5.cuft)
      });

      await Order.create({
        orderNumber: 'ORD-1002',
        staffId: staffJohn._id,
        status: 'submitted',
        items: [
          { productId: p1._id, quantity: 8, unitCuft: p1.cuft },
          { productId: p2._id, quantity: 18, unitCuft: p2.cuft }
        ],
        totalQuantity: 26,
        totalCuft: (8 * p1.cuft) + (18 * p2.cuft)
      });

      await Order.create({
        orderNumber: 'ORD-1003',
        staffId: staffAli._id,
        status: 'approved',
        items: [
          { productId: p1._id, quantity: 12, unitCuft: p1.cuft },
          { productId: p2._id, quantity: 24, unitCuft: p2.cuft }
        ],
        totalQuantity: 36,
        totalCuft: (12 * p1.cuft) + (24 * p2.cuft)
      });

      await Order.create({
        orderNumber: 'ORD-1004',
        staffId: staffSarah._id,
        status: 'submitted',
        items: [
          { productId: p1._id, quantity: 24, unitCuft: p1.cuft },
          { productId: p2._id, quantity: 12, unitCuft: p2.cuft }
        ],
        totalQuantity: 36,
        totalCuft: (24 * p1.cuft) + (12 * p2.cuft)
      });

      // 4. Seed Containers
      console.log('🌱 Seeding initial containers...');
      const cont1 = await Container.create({
        name: 'Container 1 (June Batch)',
        containerNumber: 'MSKU-982341-0',
        capacityCuft: 2400,
        usedCuft: 2050,
        status: 'arrived',
        departureDate: '2026-06-01',
        arrivalDate: '2026-06-15',
        loadedProducts: [
          { productId: p1._id, quantity: 30 },
          { productId: p2._id, quantity: 40 },
          { productId: createdProducts[2]._id, quantity: 25 },
          { productId: createdProducts[3]._id, quantity: 15 }
        ]
      });

      await Container.create({
        name: 'Container 2 (July Sea)',
        containerNumber: 'CMAU-128471-9',
        capacityCuft: 2400,
        usedCuft: 1820,
        status: 'at_sea',
        departureDate: '2026-06-25',
        arrivalDate: '2026-07-10',
        loadedProducts: [
          { productId: p1._id, quantity: 10 },
          { productId: p2._id, quantity: 20 }
        ]
      });

      await Container.create({
        name: 'Container 3 (Planning)',
        containerNumber: 'HLCU-491823-3',
        capacityCuft: 2400,
        usedCuft: 0,
        status: 'draft',
        loadedProducts: []
      });

      // 5. Seed Distribution for Container 1
      await ContainerDistribution.create({
        containerId: cont1._id,
        productId: p1._id,
        staffDistributions: [
          { staffId: staffAhmed._id, quantity: 15 },
          { staffId: staffJohn._id, quantity: 10 },
          { staffId: staffAli._id, quantity: 5 }
        ]
      });

      // 6. Seed Initial Audit Logs
      await AuditLog.create({
        userId: staffAhmed._id,
        userName: 'Ahmed',
        action: 'order_cell_updated',
        entity: 'order_items',
        entityId: p1._id.toString(),
        oldValues: { product: 'MW-6647 Microwave', quantity: 10 },
        newValues: { product: 'MW-6647 Microwave', quantity: 15 },
        details: { note: 'Increased customer preorder quantity' }
      });

      // 7. Seed Notifications
      await Notification.create({
        userId: admin._id,
        title: 'System Setup Complete',
        message: 'Order Management System database initialized successfully.',
        read: false
      });

      console.log('✅ Initial database seed completed.');
    }
  } catch (err) {
    console.error('Error during initial seed:', err.message);
  }
};
