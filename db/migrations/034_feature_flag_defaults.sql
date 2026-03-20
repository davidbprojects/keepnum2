-- Migration 034: Seed new feature flag defaults for YouMail parity features
-- Requirements: 1.9, 2.8, 3.8, 4.8, 5.7, 6.8, 7.7, 8.8, 9.7, 10.6, 11.7, 12.8, 13.8, 14.9, 15.9
-- All new boolean flags default to false (fail-closed).
-- All new numeric flags default to 0 (no access until package/override grants).

INSERT INTO feature_flags (flag_name, value) VALUES
  ('visual_voicemail_inbox',     'false'),
  ('virtual_numbers',            'false'),
  ('ivr_auto_attendant',         'false'),
  ('auto_reply_sms',             'false'),
  ('unified_inbox',              'false'),
  ('privacy_scan',               'false'),
  ('push_notifications',         'false'),
  ('greetings_marketplace',      'false'),
  ('caller_id_lookup',           'false'),
  ('voicemail_to_sms',           'false'),
  ('smart_routing',              'false'),
  ('dnd_scheduling',             'false'),
  ('voicemail_sharing',          'false'),
  ('call_recording',             'false'),
  ('conference_calling',         'false'),
  ('max_virtual_numbers',        '0'),
  ('max_conference_participants','0')
ON CONFLICT (flag_name) DO NOTHING;
