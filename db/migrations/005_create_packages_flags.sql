-- Migration 005: packages, feature_flags, package_flags, user_feature_overrides
CREATE TABLE IF NOT EXISTS packages (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL UNIQUE,
  description            TEXT,
  price_monthly_cents    INTEGER NOT NULL DEFAULT 0,
  per_number_price_cents INTEGER,
  publicly_visible       BOOLEAN NOT NULL DEFAULT false,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS feature_flags (
  flag_name   TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS package_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  flag_name   TEXT NOT NULL,
  value       JSONB NOT NULL,
  UNIQUE (package_id, flag_name)
);

CREATE TABLE IF NOT EXISTS user_feature_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag_name   TEXT NOT NULL,
  value       JSONB NOT NULL,
  set_by      TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, flag_name)
);
