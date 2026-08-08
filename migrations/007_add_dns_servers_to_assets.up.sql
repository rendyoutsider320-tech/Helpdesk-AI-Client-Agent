-- 007_add_dns_servers_to_assets.up.sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS dns_servers VARCHAR(255);
