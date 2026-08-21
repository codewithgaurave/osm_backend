-- ==============================================================================
-- ORDER MANAGEMENT SYSTEM (OMS) - POSTGRESQL / SUPABASE DATABASE SCHEMA
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'staff')),
    phone VARCHAR(50),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Master Products Table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    cuft NUMERIC(10, 2) DEFAULT 0,
    weight NUMERIC(10, 2) DEFAULT 0,
    category VARCHAR(100),
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(100) UNIQUE,
    staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'submitted', 'approved', 'ordered', 'packed', 'loaded', 'arrived', 'completed'
    )),
    total_quantity INTEGER DEFAULT 0,
    total_cuft NUMERIC(10, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_cuft NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_order_product UNIQUE (order_id, product_id)
);

-- 6. Containers Table
CREATE TABLE IF NOT EXISTS containers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    container_number VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    capacity_cuft NUMERIC(10, 2) NOT NULL DEFAULT 2400.00,
    used_cuft NUMERIC(10, 2) DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'loaded', 'at_sea', 'arrived', 'completed'
    )),
    departure_date DATE,
    arrival_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Container Items Table (Assigned Products)
CREATE TABLE IF NOT EXISTS container_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_cuft NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_container_product UNIQUE (container_id, product_id)
);

-- 8. Container Distributions Table (Allocation per Salesperson)
CREATE TABLE IF NOT EXISTS container_distributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    quantity_distributed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_container_product_staff UNIQUE (container_id, product_id, staff_id)
);

-- 9. Audit Logs Table (Full Traceability)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    read BOOLEAN DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES FOR FAST QUERY PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company);
CREATE INDEX IF NOT EXISTS idx_products_model ON products(model);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_orders_staff ON orders(staff_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_container_items_container ON container_items(container_id);
CREATE INDEX IF NOT EXISTS idx_container_dist_container ON container_distributions(container_id);
CREATE INDEX IF NOT EXISTS idx_container_dist_staff ON container_distributions(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ==============================================================================
-- SEED DATA (Admin, Staff, Products, Sample Container)
-- ==============================================================================

-- Profiles
INSERT INTO profiles (id, email, name, role, phone) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@oms.com', 'Admin User', 'admin', '+1234567890'),
('b0000000-0000-0000-0000-000000000001', 'ahmed@oms.com', 'Ahmed', 'staff', '+1234567891'),
('b0000000-0000-0000-0000-000000000002', 'john@oms.com', 'John', 'staff', '+1234567892'),
('b0000000-0000-0000-0000-000000000003', 'ali@oms.com', 'Ali', 'staff', '+1234567893'),
('b0000000-0000-0000-0000-000000000004', 'sarah@oms.com', 'Sarah', 'staff', '+1234567894')
ON CONFLICT (email) DO NOTHING;

-- Master Products
INSERT INTO products (id, company, model, description, cuft, weight, category, status) VALUES
('c0000000-0000-0000-0000-000000000001', 'PREMIER', 'MW-6647', 'Microwave 0.7 cuft 700W', 0.85, 10.5, 'Kitchen', 'approved'),
('c0000000-0000-0000-0000-000000000002', 'PREMIER', 'ED-6638', 'Electric Kettle Stainless Steel 1.7L', 1.30, 1.2, 'Appliances', 'approved'),
('c0000000-0000-0000-0000-000000000003', 'PREMIER', 'BL-1020', 'Countertop Blender 500W', 0.95, 2.5, 'Kitchen', 'approved'),
('c0000000-0000-0000-0000-000000000004', 'PREMIER', 'ED-7984GL', 'Glass Top Gas Stove 2 Burner', 2.10, 6.0, 'Kitchen', 'approved'),
('c0000000-0000-0000-0000-000000000005', 'MIDEA', 'MD-FR250', 'Double Door Refrigerator 250L', 12.50, 48.0, 'Refrigeration', 'approved'),
('c0000000-0000-0000-0000-000000000006', 'MIDEA', 'MD-AC1200', 'Split Air Conditioner 12000 BTU', 4.80, 28.0, 'Cooling', 'approved'),
('c0000000-0000-0000-0000-000000000007', 'MIDEA', 'MD-WM80', 'Front Load Washing Machine 8kg', 8.20, 62.0, 'Laundry', 'approved'),
('c0000000-0000-0000-0000-000000000008', 'SAMSUNG', 'SM-TV55', '55-inch 4K UHD Smart TV', 5.40, 15.0, 'Electronics', 'approved'),
('c0000000-0000-0000-0000-000000000009', 'SONY', 'SN-HT300', 'Home Theater Soundbar System', 1.80, 7.5, 'Audio', 'approved')
ON CONFLICT (id) DO NOTHING;

-- Initial Container
INSERT INTO containers (id, container_number, name, capacity_cuft, used_cuft, status, departure_date, arrival_date) VALUES
('d0000000-0000-0000-0000-000000000001', 'MSKU-982341-0', 'Container 1 (June Batch)', 2400.00, 2050.00, 'arrived', '2026-06-01', '2026-06-15'),
('d0000000-0000-0000-0000-000000000002', 'CMAU-128471-9', 'Container 2 (July Sea)', 2400.00, 1820.00, 'at_sea', '2026-06-25', '2026-07-10'),
('d0000000-0000-0000-0000-000000000003', 'HLCU-491823-3', 'Container 3 (Planning)', 2400.00, 0.00, 'draft', NULL, NULL)
ON CONFLICT (id) DO NOTHING;
