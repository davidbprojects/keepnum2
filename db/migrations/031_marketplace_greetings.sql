-- Migration 031: marketplace_greetings and custom_greeting_requests tables
-- Requirements: 8.1–8.8

CREATE TABLE IF NOT EXISTS marketplace_greetings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  category          TEXT NOT NULL
                      CHECK (category IN ('business', 'personal', 'holiday', 'humorous')),
  duration_seconds  INTEGER NOT NULL,
  voice_talent      TEXT NOT NULL,
  audio_key         TEXT NOT NULL,
  preview_audio_key TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_greetings_category ON marketplace_greetings (category);
CREATE INDEX IF NOT EXISTS idx_marketplace_greetings_active   ON marketplace_greetings (active);

CREATE TABLE IF NOT EXISTS custom_greeting_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  number_id         UUID NOT NULL,
  number_type       TEXT NOT NULL CHECK (number_type IN ('parked', 'virtual')),
  script            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'recording', 'delivered')),
  result_audio_key  TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_custom_greeting_requests_user_id ON custom_greeting_requests (user_id);

-- Now that marketplace_greetings exists, add the FK to greetings table
ALTER TABLE greetings
  ADD CONSTRAINT fk_greetings_marketplace
  FOREIGN KEY (marketplace_greeting_id) REFERENCES marketplace_greetings(id);
