-- Migration 002: parked_numbers table
CREATE TABLE IF NOT EXISTS parked_numbers (
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

CREATE INDEX IF NOT EXISTS idx_parked_numbers_user_id ON parked_numbers (user_id);
CREATE INDEX IF NOT EXISTS idx_parked_numbers_status  ON parked_numbers (status);
