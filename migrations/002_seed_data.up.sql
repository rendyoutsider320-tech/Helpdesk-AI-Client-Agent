-- 002_seed_data.up.sql
-- Default password: ChangeMe@123
-- Hash: $2a$10$vbcGFq9FcX.Ii1STNqzDW.iDlG591O3Iks54Vh8ZM/T.chUFbD2HC

-- Insert admin user
INSERT INTO users (name, username, email, password_hash, role, status) VALUES
('System Admin', 'admin', 'admin@helpdesk.local', '$2a$10$vbcGFq9FcX.Ii1STNqzDW.iDlG591O3Iks54Vh8ZM/T.chUFbD2HC', 'admin', 'active')
ON CONFLICT (username) DO NOTHING;

-- Insert technician users
INSERT INTO users (name, username, email, password_hash, role, status) VALUES
('Rendy Martiano', 'rendy.m', 'rendy@helpdesk.local', '$2a$10$vbcGFq9FcX.Ii1STNqzDW.iDlG591O3Iks54Vh8ZM/T.chUFbD2HC', 'technician', 'active')
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (name, username, email, password_hash, role, status) VALUES
('Alif Fadillah', 'alif.f', 'alif@helpdesk.local', '$2a$10$vbcGFq9FcX.Ii1STNqzDW.iDlG591O3Iks54Vh8ZM/T.chUFbD2HC', 'technician', 'active')
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (name, username, email, password_hash, role, status) VALUES
('Muhammad Ramadhan', 'm.ramadhan', 'ramadhan@helpdesk.local', '$2a$10$vbcGFq9FcX.Ii1STNqzDW.iDlG591O3Iks54Vh8ZM/T.chUFbD2HC', 'technician', 'active')
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (name, username, email, password_hash, role, status) VALUES
('Febryano Allandy Berta', 'febryano.b', 'febryano@helpdesk.local', '$2a$10$vbcGFq9FcX.Ii1STNqzDW.iDlG591O3Iks54Vh8ZM/T.chUFbD2HC', 'technician', 'active')
ON CONFLICT (username) DO NOTHING;

-- Insert local user
INSERT INTO users (name, username, email, password_hash, role, status) VALUES
('Local User', 'user.local', 'user@helpdesk.local', '$2a$10$vbcGFq9FcX.Ii1STNqzDW.iDlG591O3Iks54Vh8ZM/T.chUFbD2HC', 'user', 'active')
ON CONFLICT (username) DO NOTHING;

-- Initialize technician presence with real-time status (all offline initially)
-- Rendy Martiano = offline
INSERT INTO technician_presences (technician_id, status) 
SELECT id, 'offline' FROM users WHERE username = 'rendy.m'
ON CONFLICT (technician_id) DO NOTHING;

-- Alif Fadillah = offline
INSERT INTO technician_presences (technician_id, status) 
SELECT id, 'offline' FROM users WHERE username = 'alif.f'
ON CONFLICT (technician_id) DO NOTHING;

-- Muhammad Ramadhan = offline
INSERT INTO technician_presences (technician_id, status) 
SELECT id, 'offline' FROM users WHERE username = 'm.ramadhan'
ON CONFLICT (technician_id) DO NOTHING;

-- Febryano Allandy Berta = offline
INSERT INTO technician_presences (technician_id, status) 
SELECT id, 'offline' FROM users WHERE username = 'febryano.b'
ON CONFLICT (technician_id) DO NOTHING;


