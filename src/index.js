import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './lib/mongodb.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import containerRoutes from './routes/containers.js';
import distributionRoutes from './routes/distribution.js';
import auditRoutes from './routes/audit.js';
import staffRoutes from './routes/staff.js';
import exportRoutes from './routes/export.js';
import notificationRoutes from './routes/notifications.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/containers', containerRoutes);
app.use('/api/distribution', distributionRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: 'MongoDB Atlas',
    service: 'Order Management System Backend API',
    version: '1.0.0'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Connect to MongoDB Atlas and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 OMS Backend Server running on http://localhost:${PORT}`);
  });
});
