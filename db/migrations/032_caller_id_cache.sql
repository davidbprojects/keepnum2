-- Migration 032: caller_id_cache table
-- Requirements: 9.1–9.7

CREATE TABLE IF NOT EXISTS caller_id_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number  TEXT UNIQUE NOT NULL,
  name          TEXT,
  city          TEXT,
  state         TEXT,
  carrier       TEXT,
  spam_score    INTEGER CHECK (spam_score IS NULL OR (spam_score >= 0 AND spam_score <= 100)),
  looked_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_caller_id_cache_phone    ON caller_id_cache (phone_number);
CREATE INDEX IF NOT EXISTS idx_caller_id_cache_expires  ON caller_id_cache (expires_at);
