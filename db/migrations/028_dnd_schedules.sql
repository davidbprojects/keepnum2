-- Migration 028: dnd_schedules table
-- Requirements: 12.1–12.8

CREATE TABLE IF NOT EXISTS dnd_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number_id     UUID NOT NULL,
  number_type   TEXT NOT NULL CHECK (number_type IN ('parked', 'virtual')),
  user_id       UUID NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  days_of_week  INTEGER[] NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  timezone      TEXT NOT NULL,
  action        TEXT NOT NULL
                  CHECK (action IN ('voicemail', 'greeting_disconnect', 'forward')),
  action_data   JSONB,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dnd_schedules_user_id   ON dnd_schedules (user_id);
CREATE INDEX IF NOT EXISTS idx_dnd_schedules_number_id ON dnd_schedules (number_id);
CREATE INDEX IF NOT EXISTS idx_dnd_schedules_enabled   ON dnd_schedules (enabled);
