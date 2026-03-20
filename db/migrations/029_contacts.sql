-- Migration 029: contacts and tier_actions tables
-- Requirements: 11.1–11.7

CREATE TABLE IF NOT EXISTS contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  phone_number  TEXT NOT NULL,
  tier          TEXT NOT NULL DEFAULT 'known'
                  CHECK (tier IN ('vip', 'known', 'default')),
  group_name    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id      ON contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_number ON contacts (phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_tier         ON contacts (tier);

CREATE TABLE IF NOT EXISTS tier_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  tier        TEXT NOT NULL CHECK (tier IN ('vip', 'known', 'default')),
  action      TEXT NOT NULL CHECK (action IN ('ring', 'forward', 'voicemail', 'screen')),
  action_data JSONB,
  UNIQUE (user_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_tier_actions_user_id ON tier_actions (user_id);
