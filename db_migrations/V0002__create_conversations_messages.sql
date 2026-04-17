
CREATE TABLE IF NOT EXISTS t_p2895926_router_messenger_inv.conversations (
    id SERIAL PRIMARY KEY,
    user_a INTEGER NOT NULL REFERENCES t_p2895926_router_messenger_inv.users(id),
    user_b INTEGER NOT NULL REFERENCES t_p2895926_router_messenger_inv.users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_a, user_b)
);

CREATE TABLE IF NOT EXISTS t_p2895926_router_messenger_inv.messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES t_p2895926_router_messenger_inv.conversations(id),
    sender_id INTEGER NOT NULL REFERENCES t_p2895926_router_messenger_inv.users(id),
    text TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON t_p2895926_router_messenger_inv.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON t_p2895926_router_messenger_inv.messages(sender_id);
