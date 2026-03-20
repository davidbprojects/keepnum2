-- Migration 021: Extend greetings table with marketplace greeting reference
-- Requirements: 8.6
-- NOTE: marketplace_greetings table is created in migration 031.
-- The FK constraint is added here as a deferred reference; run migrations in order.

ALTER TABLE greetings
  ADD COLUMN IF NOT EXISTS marketplace_greeting_id UUID;

-- FK will be added after marketplace_greetings table exists.
-- If running all migrations in sequence, the following will succeed:
-- ALTER TABLE greetings
--   ADD CONSTRAINT fk_greetings_marketplace
--   FOREIGN KEY (marketplace_greeting_id) REFERENCES marketplace_greetings(id);
