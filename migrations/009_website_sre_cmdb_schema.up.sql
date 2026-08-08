-- 009_website_sre_cmdb_schema.up.sql

-- 1. Tabel konfigurasi Pemantauan Website
CREATE TABLE IF NOT EXISTS website_monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    interval_seconds INT DEFAULT 60,
    check_type VARCHAR(20) DEFAULT 'HTTP', -- HTTP, HTTPS, PING
    expected_status_code INT DEFAULT 200,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel transaksi metrik Website Monitor (untuk dipartisi secara bulanan)
CREATE TABLE IF NOT EXISTS website_monitor_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID REFERENCES website_monitors(id) ON DELETE CASCADE,
    available BOOLEAN NOT NULL,
    response_time_ms INT,
    ttfb_ms INT,
    status_code INT,
    ssl_days_remaining INT,
    error_message TEXT,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel konfigurasi target SRE SLO
CREATE TABLE IF NOT EXISTS sre_slos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    target_percent DECIMAL(5,2) NOT NULL, -- e.g., 99.90
    window_days INT DEFAULT 30,
    sli_type VARCHAR(50) NOT NULL, -- latency, availability, error_rate
    current_value DECIMAL(5,2),
    error_budget_percent DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabel log pelanggaran SLA tiket
CREATE TABLE IF NOT EXISTS sla_breach_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    sla_type VARCHAR(20) NOT NULL, -- response, resolution
    due_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    duration_seconds INT,
    breached BOOLEAN DEFAULT TRUE,
    escalation_level INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabel pemetaan hubungan CMDB CI (perangkat/layanan)
CREATE TABLE IF NOT EXISTS cmdb_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_item_id UUID NOT NULL,
    target_item_id UUID NOT NULL,
    relationship_type VARCHAR(50) NOT NULL, -- runs_on, depends_on, connects_to
    impact_direction VARCHAR(20) DEFAULT 'bidirectional', -- downstream, upstream, bidirectional
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_cmdb_relationship UNIQUE (source_item_id, target_item_id, relationship_type)
);

-- Seed awal target SLO
INSERT INTO sre_slos (name, target_percent, window_days, sli_type, current_value, error_budget_percent) VALUES
('Ticket Resolution SLA', 95.00, 30, 'availability', 98.50, 100.00),
('Website Availability', 99.90, 30, 'availability', 99.95, 100.00),
('API Latency < 500ms', 90.00, 30, 'latency', 94.20, 100.00)
ON CONFLICT (name) DO NOTHING;
