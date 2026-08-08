-- 016_add_extra_asset_fields.up.sql
-- Add human-readable OS, USB ports, and asset info fields to assets table.
-- ip_lan  (LAN/ethernet IP address)
-- ip_wifi (WiFi IP address)
-- operating_system (full OS label, e.g. "Windows 11 Professional (Build 22H2)")
-- usb_ports        (hardware USB port description)
-- asset_info       (owner / asset label)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS operating_system VARCHAR(255);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS usb_ports        VARCHAR(255);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_info       VARCHAR(255);
