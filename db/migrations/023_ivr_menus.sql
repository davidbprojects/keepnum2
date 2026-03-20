-- Migration 023: ivr_menus and ivr_options tables
-- Requirements: 3.1–3.8

CREATE TABLE IF NOT EXISTS ivr_menus (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number_id          UUID NOT NULL,
  number_type        TEXT NOT NULL CHECK (number_type IN ('parked', 'virtual')),
  user_id            UUID NOT NULL REFERENCES users(id),
  greeting_type      TEXT NOT NULL CHECK (greeting_type IN ('audio', 'tts')),
  greeting_audio_key TEXT,
  greeting_tts_text  TEXT,
  default_action     TEXT NOT NULL CHECK (default_action IN ('voicemail', 'disconnect')),
  timeout_seconds    INTEGER NOT NULL DEFAULT 10,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ivr_menus_user_id   ON ivr_menus (user_id);
CREATE INDEX IF NOT EXISTS idx_ivr_menus_number_id ON ivr_menus (number_id);

CREATE TABLE IF NOT EXISTS ivr_options (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ivr_menu_id  UUID NOT NULL REFERENCES ivr_menus(id) ON DELETE CASCADE,
  digit        INTEGER NOT NULL CHECK (digit BETWEEN 1 AND 9),
  action       TEXT NOT NULL
                 CHECK (action IN ('forward_number', 'voicemail', 'sub_menu', 'play_and_disconnect')),
  action_data  JSONB,
  UNIQUE (ivr_menu_id, digit)
);

CREATE INDEX IF NOT EXISTS idx_ivr_options_menu_id ON ivr_options (ivr_menu_id);
