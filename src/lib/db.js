import { supabase, isSupabaseConfigured } from './supabase.js';

// Fallback in-memory database store
const memoryDb = {
  profiles: [
    { id: 'a0000000-0000-0000-0000-000000000001', email: 'admin@oms.com', name: 'Admin User', role: 'admin', phone: '+1234567890', password: 'password123' },
    { id: 'b0000000-0000-0000-0000-000000000001', email: 'ahmed@oms.com', name: 'Ahmed', role: 'staff', phone: '+1234567891', password: 'password123' },
    { id: 'b0000000-0000-0000-0000-000000000002', email: 'john@oms.com', name: 'John', role: 'staff', phone: '+1234567892', password: 'password123' },
    { id: 'b0000000-0000-0000-0000-000000000003', email: 'ali@oms.com', name: 'Ali', role: 'staff', phone: '+1234567893', password: 'password123' },
    { id: 'b0000000-0000-0000-0000-000000000004', email: 'sarah@oms.com', name: 'Sarah', role: 'staff', phone: '+1234567894', password: 'password123' },
  ],
  products: [
    { id: 'c0000000-0000-0000-0000-000000000001', company: 'PREMIER', model: 'MW-6647', description: 'Microwave 0.7 cuft 700W', cuft: 0.85, weight: 10.5, category: 'Kitchen', status: 'approved', notes: 'Top seller' },
    { id: 'c0000000-0000-0000-0000-000000000002', company: 'PREMIER', model: 'ED-6638', description: 'Electric Kettle Stainless Steel 1.7L', cuft: 1.30, weight: 1.2, category: 'Appliances', status: 'approved', notes: '' },
    { id: 'c0000000-0000-0000-0000-000000000003', company: 'PREMIER', model: 'BL-1020', description: 'Countertop Blender 500W', cuft: 0.95, weight: 2.5, category: 'Kitchen', status: 'approved', notes: '' },
    { id: 'c0000000-0000-0000-0000-000000000004', company: 'PREMIER', model: 'ED-7984GL', description: 'Glass Top Gas Stove 2 Burner', cuft: 2.10, weight: 6.0, category: 'Kitchen', status: 'approved', notes: '' },
    { id: 'c0000000-0000-0000-0000-000000000005', company: 'MIDEA', model: 'MD-FR250', description: 'Double Door Refrigerator 250L', cuft: 12.50, weight: 48.0, category: 'Refrigeration', status: 'approved', notes: '' },
    { id: 'c0000000-0000-0000-0000-000000000006', company: 'MIDEA', model: 'MD-AC1200', description: 'Split Air Conditioner 12000 BTU', cuft: 4.80, weight: 28.0, category: 'Cooling', status: 'approved', notes: '' },
    { id: 'c0000000-0000-0000-0000-000000000007', company: 'MIDEA', model: 'MD-WM80', description: 'Front Load Washing Machine 8kg', cuft: 8.20, weight: 62.0, category: 'Laundry', status: 'approved', notes: '' },
    { id: 'c0000000-0000-0000-0000-000000000008', company: 'SAMSUNG', model: 'SM-TV55', description: '55-inch 4K UHD Smart TV', cuft: 5.40, weight: 15.0, category: 'Electronics', status: 'approved', notes: '' },
    { id: 'c0000000-0000-0000-0000-000000000009', company: 'SONY', model: 'SN-HT300', description: 'Home Theater Soundbar System', cuft: 1.80, weight: 7.5, category: 'Audio', status: 'approved', notes: '' },
  ],
  orders: [
    { id: 'o-001', order_number: 'ORD-1001', staff_id: 'b0000000-0000-0000-0000-000000000001', status: 'submitted', date: '2026-06-10', created_at: new Date().toISOString() },
    { id: 'o-002', order_number: 'ORD-1002', staff_id: 'b0000000-0000-0000-0000-000000000002', status: 'submitted', date: '2026-06-10', created_at: new Date().toISOString() },
    { id: 'o-003', order_number: 'ORD-1003', staff_id: 'b0000000-0000-0000-0000-000000000003', status: 'approved', date: '2026-06-11', created_at: new Date().toISOString() },
    { id: 'o-004', order_number: 'ORD-1004', staff_id: 'b0000000-0000-0000-0000-000000000004', status: 'submitted', date: '2026-06-11', created_at: new Date().toISOString() },
  ],
  order_items: [
    { id: 'oi-1', order_id: 'o-001', product_id: 'c0000000-0000-0000-0000-000000000001', quantity: 5, unit_cuft: 0.85 },
    { id: 'oi-2', order_id: 'o-001', product_id: 'c0000000-0000-0000-0000-000000000002', quantity: 12, unit_cuft: 1.30 },
    { id: 'oi-3', order_id: 'o-001', product_id: 'c0000000-0000-0000-0000-000000000005', quantity: 2, unit_cuft: 12.50 },
    { id: 'oi-4', order_id: 'o-002', product_id: 'c0000000-0000-0000-0000-000000000001', quantity: 8, unit_cuft: 0.85 },
    { id: 'oi-5', order_id: 'o-002', product_id: 'c0000000-0000-0000-0000-000000000002', quantity: 18, unit_cuft: 1.30 },
    { id: 'oi-6', order_id: 'o-003', product_id: 'c0000000-0000-0000-0000-000000000001', quantity: 12, unit_cuft: 0.85 },
    { id: 'oi-7', order_id: 'o-003', product_id: 'c0000000-0000-0000-0000-000000000002', quantity: 24, unit_cuft: 1.30 },
    { id: 'oi-8', order_id: 'o-004', product_id: 'c0000000-0000-0000-0000-000000000001', quantity: 24, unit_cuft: 0.85 },
    { id: 'oi-9', order_id: 'o-004', product_id: 'c0000000-0000-0000-0000-000000000002', quantity: 12, unit_cuft: 1.30 },
  ],
  containers: [
    { 
      id: 'd0000000-0000-0000-0000-000000000001', 
      container_number: 'MSKU-982341-0', 
      name: 'Container 1 (June Batch)', 
      capacity_cuft: 2400, 
      used_cuft: 2050, 
      status: 'arrived', 
      departure_date: '2026-06-01', 
      arrival_date: '2026-06-15',
      loaded_products: [
        { product_id: 'c0000000-0000-0000-0000-000000000001', quantity: 30 },
        { product_id: 'c0000000-0000-0000-0000-000000000002', quantity: 40 },
        { product_id: 'c0000000-0000-0000-0000-000000000003', quantity: 25 },
        { product_id: 'c0000000-0000-0000-0000-000000000004', quantity: 15 }
      ]
    },
    { 
      id: 'd0000000-0000-0000-0000-000000000002', 
      container_number: 'CMAU-128471-9', 
      name: 'Container 2 (July Sea)', 
      capacity_cuft: 2400, 
      used_cuft: 1820, 
      status: 'at_sea', 
      departure_date: '2026-06-25', 
      arrival_date: '2026-07-10',
      loaded_products: [
        { product_id: 'c0000000-0000-0000-0000-000000000001', quantity: 10 },
        { product_id: 'c0000000-0000-0000-0000-000000000002', quantity: 20 }
      ]
    },
    { 
      id: 'd0000000-0000-0000-0000-000000000003', 
      container_number: 'HLCU-491823-3', 
      name: 'Container 3 (Planning)', 
      capacity_cuft: 2400, 
      used_cuft: 0, 
      status: 'draft', 
      departure_date: null, 
      arrival_date: null,
      loaded_products: []
    }
  ],
  container_distributions: [
    { 
      container_id: 'd0000000-0000-0000-0000-000000000001', 
      product_id: 'c0000000-0000-0000-0000-000000000001', 
      staff_distributions: [
        { staff_id: 'b0000000-0000-0000-0000-000000000001', quantity: 15 },
        { staff_id: 'b0000000-0000-0000-0000-000000000002', quantity: 10 },
        { staff_id: 'b0000000-0000-0000-0000-000000000003', quantity: 5 }
      ]
    }
  ],
  audit_logs: [
    {
      id: 'log-1',
      user_id: 'b0000000-0000-0000-0000-000000000001',
      user_name: 'Ahmed',
      action: 'order_updated',
      entity: 'order_items',
      entity_id: 'c0000000-0000-0000-0000-000000000001',
      old_values: { product: 'MW-6647 Microwave', quantity: 10 },
      new_values: { product: 'MW-6647 Microwave', quantity: 15 },
      details: { note: 'Increased customer preorder quantity' },
      created_at: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    {
      id: 'log-2',
      user_id: 'a0000000-0000-0000-0000-000000000001',
      user_name: 'Admin User',
      action: 'product_approved',
      entity: 'products',
      entity_id: 'c0000000-0000-0000-0000-000000000001',
      old_values: { status: 'pending' },
      new_values: { status: 'approved', cuft: 0.85 },
      details: { added_cuft: 0.85 },
      created_at: new Date(Date.now() - 3600000 * 5).toISOString()
    }
  ],
  notifications: [
    { id: 'notif-1', user_id: 'a0000000-0000-0000-0000-000000000001', title: 'New Product Request', message: 'Ahmed requested MW-6647 Microwave for approval.', read: false, created_at: new Date().toISOString() },
    { id: 'notif-2', user_id: 'b0000000-0000-0000-0000-000000000001', title: 'Container Arrived', message: 'Container 1 (June Batch) has arrived at the warehouse.', read: true, created_at: new Date(Date.now() - 86400000).toISOString() }
  ]
};

export const db = {
  isSupabase: isSupabaseConfigured,
  supabase,
  memoryDb
};

export default db;
