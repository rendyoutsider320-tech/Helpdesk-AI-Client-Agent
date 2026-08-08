-- 007_add_dns_servers_to_assets.down.sql
ALTER TABLE assets DROP COLUMN IF EXISTS dns_servers;
