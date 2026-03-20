-- Migration 003: forwarding_rules, caller_rules, block_list, greetings
CREATE TABLE IF NOT EXISTS forwarding_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parked_number_id  UUID NOT NULL REFERENCES parked_numbers(id) ON DELETE CASCADE,
  destination       TEXT NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS caller_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parked_number_id  UUID NOT NULL REFERENCES parked_numbers(id) ON DELETE CASCADE,
  caller_id         TEXT NOT NULL,
  action            TEXT NOT NULL
                      CHECK (action IN ('voicemail','disconnect','forward','custom_greeting')),
  action_data       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS block_list (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parked_number_id  UUID NOT NULL REFERENCES parked_numbers(id) ON DELETE CASCADE,
  caller_id         TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parked_number_id, caller_id)
);

CREATE TABLE IF NOT EXISTS greetings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parked_number_id  UUID NOT NULL REFERENCES parked_numbers(id) ON DELETE CASCADE,
  greeting_type     TEXT NOT NULL
                      CHECK (greeting_type IN ('default','smart_known','smart_unknown')),
  audio_key         TEXT,
  tts_text          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
