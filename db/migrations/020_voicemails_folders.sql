-- Migration 020: Extend voicemails table with folder management columns
-- Requirements: 1.1, 1.2, 1.7, 1.8

ALTER TABLE voicemails
  ADD COLUMN IF NOT EXISTS folder     TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS read       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ;

-- Constrain folder values
ALTER TABLE voicemails
  ADD CONSTRAINT chk_voicemails_folder CHECK (folder IN ('inbox', 'saved', 'trash'));

CREATE INDEX IF NOT EXISTS idx_voicemails_folder     ON voicemails (folder);
CREATE INDEX IF NOT EXISTS idx_voicemails_read       ON voicemails (read);
CREATE INDEX IF NOT EXISTS idx_voicemails_trashed_at ON voicemails (trashed_at);
