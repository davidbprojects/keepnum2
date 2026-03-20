-- Migration 008: Seed default packages and system-level feature flag defaults

-- Default packages
INSERT INTO packages (name, description, price_monthly_cents, per_number_price_cents, publicly_visible, sort_order)
VALUES
  ('Free',       'Park 1 number, basic features',                    0,    NULL, true, 1),
  ('Basic',      'Park up to 5 numbers, voicemail transcription',  999,    NULL, true, 2),
  ('Pro',        'Unlimited numbers, all features',               2999,    NULL, true, 3),
  ('Enterprise', 'Custom pricing, all features, custom limits',      0,    NULL, false, 4)
ON CONFLICT (name) DO NOTHING;

-- System-level feature flag defaults (fail-closed: most off by default)
INSERT INTO feature_flags (flag_name, value) VALUES
  ('call_parking',              'true'),
  ('call_forwarding',           'false'),
  ('sms_forwarding_sms',        'false'),
  ('sms_forwarding_email',      'false'),
  ('voicemail_transcription',   'false'),
  ('voicemail_email_delivery',  'false'),
  ('download_voicemails',       'false'),
  ('download_sms',              'false'),
  ('call_logs',                 'true'),
  ('sms_logs',                  'true'),
  ('spam_filtering',            'false'),
  ('call_screening',            'false'),
  ('number_search',             'true'),
  ('youmail_caller_rules',      'false'),
  ('youmail_block_list',        'false'),
  ('youmail_custom_greetings',  'false'),
  ('youmail_smart_greetings',   'false'),
  ('retention_30d',             'true'),
  ('retention_60d',             'false'),
  ('retention_90d',             'false'),
  ('retention_forever',         'false'),
  ('max_parked_numbers',        '1'),
  ('max_sms_storage_mb',        '50'),
  ('max_voicemail_storage_mb',  '50')
ON CONFLICT (flag_name) DO NOTHING;
