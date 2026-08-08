-- 003_add_ticket_actions.up.sql
CREATE TABLE IF NOT EXISTS ticket_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL,
    target VARCHAR(255),
    command TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'proposed', -- proposed, approved, rejected, executing, completed, failed
    approved_by UUID REFERENCES users(id),
    result TEXT,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ticket_actions_ticket_id ON ticket_actions(ticket_id);
