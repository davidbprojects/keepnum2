-- Migration 009: Seed package-level feature flags for default packages

-- Free package flags
INSERT INTO package_flags (package_id, flag_name, value)
SELECT p.id, f.flag_name, f.value FROM packages p,
(VALUES
  ('call_parking',     'true'::jsonb),
  ('call_forwarding',  'false'),
  ('call_logs',        'true'),
  ('sms_logs',         'true'),
  ('number_search',    'true'),
  ('retention_30d',    'true'),
  ('max_parked_numbers', '1'),
  ('max_sms_storage_mb', '50'),
  ('max_voicemail_storage_mb', '50')
) AS f(flag_name, value)
WHERE p.name = 'Free'
ON CONFLICT (package_id, flag_name) DO NOTHING;

-- Basic package flags
INSERT INTO package_flags (package_id, flag_name, value)
SELECT p.id, f.flag_name, f.value FROM packages p,
(VALUES
  ('call_parking',            'true'::jsonb),
  ('call_forwarding',         'true'),
  ('sms_forwarding_sms',      'true'),
  ('voicemail_transcription',  'true'),
  ('voicemail_email_delivery', 'true'),
  ('download_voicemails',     'true'),
  ('download_sms',            'true'),
  ('call_logs',               'true'),
  ('sms_logs',                'true'),
  ('number_search',           'true'),
  ('retention_30d',           'true'),
  ('retention_60d',           'true'),
  ('max_parked_numbers',      '5'),
  ('max_sms_storage_mb',      '200'),
  ('max_voicemail_storage_mb','200')
) AS f(flag_name, value)
WHERE p.name = 'Basic'
ON CONFLICT (package_id, flag_name) DO NOTHING;

-- Pro package flags (all features, unlimited numbers)
INSERT INTO package_flags (package_id, flag_name, value)
SELECT p.id, f.flag_name, f.value FROM packages p,
(VALUES
  ('call_parking',            'true'::jsonb),
  ('call_forwarding',         'true'),
  ('sms_forwarding_sms',      'true'),
  ('sms_forwarding_email',    'true'),
  ('voicemail_transcription',  'true'),
  ('voicemail_email_delivery', 'true'),
  ('download_voicemails',     'true'),
  ('download_sms',            'true'),
  ('call_logs',               'true'),
  ('sms_logs',                'true'),
  ('spam_filtering',          'true'),
  ('call_screening',          'true'),
  ('number_search',           'true'),
  ('youmail_caller_rules',    'true'),
  ('youmail_block_list',      'true'),
  ('youmail_custom_greetings','true'),
  ('youmail_smart_greetings', 'true'),
  ('retention_30d',           'true'),
  ('retention_60d',           'true'),
  ('retention_90d',           'true'),
  ('retention_forever',       'true'),
  ('max_parked_numbers',      '999999'),
  ('max_sms_storage_mb',      '5000'),
  ('max_voicemail_storage_mb','5000')
) AS f(flag_name, value)
WHERE p.name = 'Pro'
ON CONFLICT (package_id, flag_name) DO NOTHING;

-- Enterprise package flags (same as Pro — limits customized per-user via overrides)
INSERT INTO package_flags (package_id, flag_name, value)
SELECT p.id, f.flag_name, f.value FROM packages p,
(VALUES
  ('call_parking',            'true'::jsonb),
  ('call_forwarding',         'true'),
  ('sms_forwarding_sms',      'true'),
  ('sms_forwarding_email',    'true'),
  ('voicemail_transcription',  'true'),
  ('voicemail_email_delivery', 'true'),
  ('download_voicemails',     'true'),
  ('download_sms',            'true'),
  ('call_logs',               'true'),
  ('sms_logs',                'true'),
  ('spam_filtering',          'true'),
  ('call_screening',          'true'),
  ('number_search',           'true'),
  ('youmail_caller_rules',    'true'),
  ('youmail_block_list',      'true'),
  ('youmail_custom_greetings','true'),
  ('youmail_smart_greetings', 'true'),
  ('retention_30d',           'true'),
  ('retention_60d',           'true'),
  ('retention_90d',           'true'),
  ('retention_forever',       'true'),
  ('max_parked_numbers',      '999999'),
  ('max_sms_storage_mb',      '10000'),
  ('max_voicemail_storage_mb','10000')
) AS f(flag_name, value)
WHERE p.name = 'Enterprise'
ON CONFLICT (package_id, flag_name) DO NOTHING;
