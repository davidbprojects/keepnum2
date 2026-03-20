-- Migration 022: virtual_numbers table
-- Requirements: 2.1–2.8

CREATE TABLE IF NOT EXISTS virtual_numbers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  telnyx_number_id  TEXT UNIQUE NOT NULL,
  phone_number      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'released')),
  retention_policy  TEXT NOT NULL DEFAULT '90d'
                      CHECK (retention_policy IN ('30d', '60d', '90d', 'forever')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_virtual_numbers_user_id ON virtual_numbers (user_id);
CREATE INDEX IF NOT EXISTS idx_virtual_numbers_status  ON virtual_numbers (status);
