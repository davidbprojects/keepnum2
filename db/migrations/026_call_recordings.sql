-- Migration 026: call_recordings table
-- Requirements: 14.1–14.9

CREATE TABLE IF NOT EXISTS call_recordings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id),
  number_id          UUID NOT NULL,
  number_type        TEXT NOT NULL CHECK (number_type IN ('parked', 'virtual')),
  call_id            TEXT NOT NULL,
  caller_id          TEXT,
  direction          TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  duration_seconds   INTEGER,
  storage_key        TEXT NOT NULL,
  consent_completed  BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_call_recordings_user_id    ON call_recordings (user_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_number_id  ON call_recordings (number_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_call_id    ON call_recordings (call_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_deleted_at ON call_recordings (deleted_at);
