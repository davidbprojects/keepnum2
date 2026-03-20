-- Migration 025: voicemail_shares table
-- Requirements: 13.1–13.8

CREATE TABLE IF NOT EXISTS voicemail_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voicemail_id  UUID NOT NULL REFERENCES voicemails(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  share_token   TEXT UNIQUE NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voicemail_shares_voicemail_id ON voicemail_shares (voicemail_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_shares_user_id      ON voicemail_shares (user_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_shares_token        ON voicemail_shares (share_token);
CREATE INDEX IF NOT EXISTS idx_voicemail_shares_expires_at   ON voicemail_shares (expires_at);
