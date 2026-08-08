-- 004_enterprise_cmdb_and_events.up.sql

-- Assets (Hardware Inventory)
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    hostname VARCHAR(255) NOT NULL,
    serial_number VARCHAR(100),
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    cpu_model VARCHAR(100),
    cpu_cores INT,
    ram_total_gb DECIMAL(10,2),
    os_name VARCHAR(100),
    os_version VARCHAR(50),
    ip_address VARCHAR(45),
    mac_address VARCHAR(17),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Software Inventory
CREATE TABLE IF NOT EXISTS software_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(100),
    publisher VARCHAR(255),
    install_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event Logs (Telemetry from Agents)
CREATE TABLE IF NOT EXISTS system_event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    source VARCHAR(100), -- System, Application, Security
    event_id INT,
    level VARCHAR(50), -- Information, Warning, Error, Critical
    message TEXT,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- USB Inventory (Connected USB Devices)
CREATE TABLE IF NOT EXISTS usb_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    device_id VARCHAR(255),
    vendor_id VARCHAR(100),
    product_id VARCHAR(100),
    serial_number VARCHAR(100),
    class VARCHAR(100),
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_assets_device_id ON assets(device_id);
CREATE INDEX idx_software_asset_id ON software_inventory(asset_id);
CREATE INDEX idx_usb_asset_id ON usb_inventory(asset_id);
CREATE INDEX idx_event_logs_asset_id ON system_event_logs(asset_id);
CREATE INDEX idx_event_logs_timestamp ON system_event_logs(timestamp);

