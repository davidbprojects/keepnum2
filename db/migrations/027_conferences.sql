-- Migration 027: conferences and conference_participants tables
-- Requirements: 15.1–15.9

CREATE TABLE IF NOT EXISTS conferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  number_id       UUID NOT NULL,
  number_type     TEXT NOT NULL CHECK (number_type IN ('parked', 'virtual')),
  telnyx_conf_id  TEXT,
  dial_in_number  TEXT NOT NULL,
  pin             TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'ended')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conferences_user_id ON conferences (user_id);
CREATE INDEX IF NOT EXISTS idx_conferences_status  ON conferences (status);

CREATE TABLE IF NOT EXISTS conference_participants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conference_id    UUID NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  telnyx_call_id   TEXT NOT NULL,
  caller_id        TEXT,
  muted            BOOLEAN NOT NULL DEFAULT false,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conference_participants_conf_id ON conference_participants (conference_id);
