-- 011_add_is_online_to_users.up.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false;
