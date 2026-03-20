-- Migration 024: auto_reply_templates table
-- Requirements: 4.1–4.3

CREATE TABLE IF NOT EXISTS auto_reply_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number_id        UUID NOT NULL,
  number_type      TEXT NOT NULL CHECK (number_type IN ('parked', 'virtual')),
  user_id          UUID NOT NULL REFERENCES users(id),
  scenario         TEXT NOT NULL
                     CHECK (scenario IN ('all_missed', 'busy', 'after_hours', 'specific_caller')),
  caller_id_filter TEXT,
  message          TEXT NOT NULL CHECK (char_length(message) <= 480),
  enabled          BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_reply_templates_user_id   ON auto_reply_templates (user_id);
CREATE INDEX IF NOT EXISTS idx_auto_reply_templates_number_id ON auto_reply_templates (number_id);
