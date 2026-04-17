
-- username уникальный
ALTER TABLE t_p2895926_router_messenger_inv.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_developer BOOLEAN NOT NULL DEFAULT FALSE;

-- уникальный индекс на username (если нет)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON t_p2895926_router_messenger_inv.users(username)
  WHERE username IS NOT NULL;

-- Генерируем display_id для существующих пользователей без него
UPDATE t_p2895926_router_messenger_inv.users
SET display_id = 'SF' || UPPER(SUBSTRING(MD5(id::text || 'sfera'), 1, 8))
WHERE display_id IS NULL;

-- Устанавливаем is_developer = true для первого пользователя (владелец)
UPDATE t_p2895926_router_messenger_inv.users SET is_developer = TRUE WHERE id = 1;

-- Групповые чаты и каналы
CREATE TABLE IF NOT EXISTS t_p2895926_router_messenger_inv.groups (
    id SERIAL PRIMARY KEY,
    type VARCHAR(10) NOT NULL DEFAULT 'group', -- 'group' | 'channel'
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    avatar_url TEXT,
    owner_id INTEGER NOT NULL REFERENCES t_p2895926_router_messenger_inv.users(id),
    invite_code VARCHAR(32) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p2895926_router_messenger_inv.group_members (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES t_p2895926_router_messenger_inv.groups(id),
    user_id INTEGER NOT NULL REFERENCES t_p2895926_router_messenger_inv.users(id),
    role VARCHAR(10) NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS t_p2895926_router_messenger_inv.group_messages (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES t_p2895926_router_messenger_inv.groups(id),
    sender_id INTEGER NOT NULL REFERENCES t_p2895926_router_messenger_inv.users(id),
    text TEXT,
    media_url TEXT,
    media_type VARCHAR(10), -- 'image' | 'video' | 'audio'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Медиа в личных сообщениях
ALTER TABLE t_p2895926_router_messenger_inv.messages
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_group_messages ON t_p2895926_router_messenger_inv.group_messages(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_group_members ON t_p2895926_router_messenger_inv.group_members(user_id);
