-- 010_website_monitor_full.up.sql
-- Extend website_monitors dengan field tambahan

ALTER TABLE website_monitors
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS timeout_seconds INT DEFAULT 15,
    ADD COLUMN IF NOT EXISTS check_ssl BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS follow_redirects BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS keyword_check TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS screenshot_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS location VARCHAR(100) DEFAULT 'Jakarta',
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) DEFAULT '';

-- Extend website_monitor_metrics dengan field timing lengkap
ALTER TABLE website_monitor_metrics
    ADD COLUMN IF NOT EXISTS dns_ms INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS connect_ms INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tls_ms INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS page_size_bytes INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS redirect_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cert_issuer TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS cert_subject TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS cert_fingerprint TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS cert_valid_from TIMESTAMP,
    ADD COLUMN IF NOT EXISTS cert_valid_to TIMESTAMP,
    ADD COLUMN IF NOT EXISTS keyword_found BOOLEAN DEFAULT FALSE;

-- Tabel incidents website monitor
CREATE TABLE IF NOT EXISTS website_monitor_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID NOT NULL REFERENCES website_monitors(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20) DEFAULT 'warning', -- info, warning, critical
    status VARCHAR(20) DEFAULT 'open',       -- open, resolved
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    duration_seconds INT DEFAULT 0,
    error_message TEXT,
    affected_checks TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wm_incidents_monitor ON website_monitor_incidents(monitor_id);
CREATE INDEX IF NOT EXISTS idx_wm_incidents_status ON website_monitor_incidents(status);
CREATE INDEX IF NOT EXISTS idx_wm_incidents_started ON website_monitor_incidents(started_at DESC);

-- Index tambahan untuk metrics timing
CREATE INDEX IF NOT EXISTS idx_wm_metrics_monitor_ts ON website_monitor_metrics(monitor_id, timestamp DESC);

-- Seed target websites sams.id
INSERT INTO website_monitors (id, url, name, interval_seconds, check_type, expected_status_code, is_active, description, check_ssl, follow_redirects, location)
VALUES
    (gen_random_uuid(), 'https://cos.sams.id',      'COS SAMS',      60, 'HTTPS', 200, TRUE, 'Core Operating System - SAMS',   TRUE, TRUE, 'Jakarta'),
    (gen_random_uuid(), 'https://sales.sams.id',    'Sales SAMS',    60, 'HTTPS', 200, TRUE, 'Portal Sales & CRM SAMS',         TRUE, TRUE, 'Jakarta'),
    (gen_random_uuid(), 'https://absensi.sams.id',  'Absensi SAMS',  60, 'HTTPS', 200, TRUE, 'Sistem Absensi Karyawan SAMS',    TRUE, TRUE, 'Jakarta'),
    (gen_random_uuid(), 'https://karyawan.sams.id', 'Karyawan SAMS', 60, 'HTTPS', 200, TRUE, 'Portal Manajemen Karyawan SAMS',  TRUE, TRUE, 'Jakarta')
ON CONFLICT (url) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    check_ssl = EXCLUDED.check_ssl,
    follow_redirects = EXCLUDED.follow_redirects;
