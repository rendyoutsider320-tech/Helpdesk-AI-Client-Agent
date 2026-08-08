-- 015_add_ip_lan_and_ip_wifi_to_assets.up.sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ip_lan VARCHAR(45);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ip_wifi VARCHAR(45);
