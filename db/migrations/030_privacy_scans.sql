-- Migration 030: privacy_scans, privacy_scan_findings, and data_broker_sources tables
-- Requirements: 6.1–6.8

CREATE TABLE IF NOT EXISTS privacy_scans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  phone_number  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'complete', 'partial')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_privacy_scans_user_id ON privacy_scans (user_id);

CREATE TABLE IF NOT EXISTS privacy_scan_findings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id      UUID NOT NULL REFERENCES privacy_scans(id) ON DELETE CASCADE,
  source_name  TEXT NOT NULL,
  source_url   TEXT NOT NULL,
  data_types   TEXT[] NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  opt_out_url  TEXT,
  status       TEXT NOT NULL DEFAULT 'found'
                 CHECK (status IN ('found', 'resolved', 'scan_incomplete'))
);

CREATE INDEX IF NOT EXISTS idx_privacy_scan_findings_scan_id ON privacy_scan_findings (scan_id);

CREATE TABLE IF NOT EXISTS data_broker_sources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL UNIQUE,
  check_url_template  TEXT NOT NULL,
  opt_out_url         TEXT,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
