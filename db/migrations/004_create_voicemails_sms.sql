-- Migration 004: voicemails, sms_messages, add_ons
CREATE TABLE IF NOT EXISTS voicemails (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parked_number_id     UUID NOT NULL REFERENCES parked_numbers(id) ON DELETE CASCADE,
  caller_id            TEXT,
  duration_seconds     INTEGER,
  storage_key          TEXT NOT NULL,
  transcription        TEXT,
  transcription_status TEXT NOT NULL DEFAULT 'pending'
                         CHECK (transcription_status IN ('pending','complete','failed')),
  received_at          TIMESTAMPTZ NOT NULL,
  deleted_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voicemails_parked_number ON voicemails (parked_number_id);
CREATE INDEX IF NOT EXISTS idx_voicemails_deleted_at    ON voicemails (deleted_at);

CREATE TABLE IF NOT EXISTS sms_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parked_number_id  UUID NOT NULL REFERENCES parked_numbers(id) ON DELETE CASCADE,
  direction         TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender            TEXT NOT NULL,
  recipient         TEXT NOT NULL,
  body              TEXT,
  media_keys        TEXT[] NOT NULL DEFAULT '{}',
  received_at       TIMESTAMPTZ NOT NULL,
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_parked_number ON sms_messages (parked_number_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_deleted_at    ON sms_messages (deleted_at);

CREATE TABLE IF NOT EXISTS add_ons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  add_on_type TEXT NOT NULL CHECK (add_on_type IN ('spam_filter','call_screening')),
  enabled     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, add_on_type)
);
