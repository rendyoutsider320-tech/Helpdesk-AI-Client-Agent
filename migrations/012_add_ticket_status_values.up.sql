-- 012_add_ticket_status_values.up.sql
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'waiting_customer';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'waiting_vendor';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'escalated';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'spam';
