-- 006_add_telegram_chat_id.up.sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
