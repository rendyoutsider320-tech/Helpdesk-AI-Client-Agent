-- 005_enterprise_complete_schema.up.sql

-- 1. Agent Registry Table
CREATE TABLE IF NOT EXISTS agent_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname VARCHAR(255) UNIQUE NOT NULL,
    agent_version VARCHAR(50),
    status VARCHAR(50) DEFAULT 'offline', -- online, offline, busy
    ip_address VARCHAR(45),
    os VARCHAR(100),
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Actions Tracking (Catalog of allowed actions)
CREATE TABLE IF NOT EXISTS actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL, -- e.g., Restart Service, Flush DNS
    description TEXT,
    command_template TEXT NOT NULL,
    risk_level VARCHAR(20) DEFAULT 'low', -- low, medium, high
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Automation Jobs (History of execution)
CREATE TABLE IF NOT EXISTS automation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES agent_registry(id) ON DELETE CASCADE,
    action_id UUID REFERENCES actions(id),
    status VARCHAR(50) DEFAULT 'pending', -- pending, executing, completed, failed
    command_executed TEXT,
    output TEXT,
    error_log TEXT,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Approval Workflow Engine
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    job_id UUID REFERENCES ticket_actions(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    reason TEXT,
    risk_score INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP
);

-- 5. Telemetry History (Detailed)
CREATE TABLE IF NOT EXISTS telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    cpu_usage DECIMAL(5,2),
    ram_usage DECIMAL(5,2),
    disk_usage DECIMAL(5,2),
    network_rx_kbps DECIMAL(10,2),
    network_tx_kbps DECIMAL(10,2),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. CMDB Expansion (Asset Owner & History)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS warranty_expiry DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS location_id VARCHAR(100);

CREATE TABLE IF NOT EXISTS asset_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    change_type VARCHAR(50), -- location_change, owner_change, status_change
    old_value TEXT,
    new_value TEXT,
    changed_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed basic actions
INSERT INTO actions (name, description, command_template, risk_level, category) VALUES
('Restart Spooler', 'Restarts the Print Spooler service', 'Restart-Service -Name Spooler -Force', 'low', 'Printer'),
('Flush DNS', 'Clears the DNS resolver cache', 'ipconfig /flushdns', 'low', 'Network'),
('Restart Windows Update', 'Restarts the Windows Update service', 'Restart-Service -Name wuauserv -Force', 'medium', 'System'),
('Clear Temp Files', 'Deletes temporary system files', 'Remove-Item -Path $env:TEMP\* -Recurse -Force', 'low', 'Maintenance')
ON CONFLICT (name) DO NOTHING;
