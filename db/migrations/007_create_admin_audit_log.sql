-- Migration 007: admin_audit_log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_sub   TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user','package','feature_flag')),
  target_id   TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_sub ON admin_audit_log (admin_sub);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target    ON admin_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created   ON admin_audit_log (created_at);
