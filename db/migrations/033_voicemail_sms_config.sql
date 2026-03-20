-- Migration 033: voicemail_sms_config table
-- Requirements: 10.1–10.6

CREATE TABLE IF NOT EXISTS voicemail_sms_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  number_id           UUID NOT NULL,
  number_type         TEXT NOT NULL CHECK (number_type IN ('parked', 'virtual')),
  enabled             BOOLEAN NOT NULL DEFAULT true,
  destination_number  TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, number_id)
);

CREATE INDEX IF NOT EXISTS idx_voicemail_sms_config_user_id   ON voicemail_sms_config (user_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_sms_config_number_id ON voicemail_sms_config (number_id);
