# Implementation Plan: YouMail Feature Parity

## Overview

This plan implements 15 new features bringing KeepNum to parity with YouMail.com. The implementation follows a bottom-up approach: shared types first, then database migrations, Lambda services, Terraform infrastructure, API client, UI layers, tests, and finally OpenAPI documentation. All code is TypeScript. 8 new Lambda services are created, 2 existing services are extended, 18 new Aurora tables + 5 new DynamoDB tables are added, and 17 new feature flags are registered.

## Tasks

- [x] 1. Define shared types and interfaces for all 15 new features
  - [x] 1.1 Add new Aurora model types to `packages/shared/src/types/aurora.ts`
    - Add interfaces: `VirtualNumber`, `IvrMenu`, `IvrOption`, `AutoReplyTemplate`, `VoicemailShare`, `CallRecording`, `Conference`, `ConferenceParticipant`, `DndSchedule`, `Contact`, `TierAction`, `PrivacyScan`, `PrivacyScanFinding`, `DataBrokerSource`, `MarketplaceGreeting`, `CustomGreetingRequest`, `CallerIdCache`, `VoicemailSmsConfig`
    - Add type unions: `VoicemailFolder`, `NumberType`, `IvrActionType`, `AutoReplyScenario`, `ContactTier`, `TierActionType`, `ScanStatus`, `FindingSeverity`, `GreetingCategory`, `ConferenceStatus`, `RecordingDirection`
    - Extend existing `Voicemail` interface with `folder`, `read`, `trashed_at` fields
    - Extend existing `Greeting` interface with `marketplace_greeting_id` field
    - _Requirements: 1.1–1.9, 2.1–2.8, 3.1–3.8, 4.1–4.8, 5.1–5.7, 6.1–6.8, 7.1–7.7, 8.1–8.8, 9.1–9.7, 10.1–10.6, 11.1–11.7, 12.1–12.8, 13.1–13.8, 14.1–14.9, 15.1–15.9_

  - [x] 1.2 Add new DynamoDB item types to `packages/shared/src/types/dynamodb.ts`
    - Add interfaces: `AutoReplyLogItem`, `UnifiedInboxItem`, `DeviceTokenItem`, `NotificationSettingsItem`, `ConferenceLogItem`
    - _Requirements: 4.6, 5.1, 7.1–7.4, 15.8_

  - [x] 1.3 Add new API request/response types to `packages/shared/src/types/api.ts`
    - Add request types for all new endpoints: virtual number CRUD, IVR menu CRUD, auto-reply template CRUD, voicemail bulk operations, voicemail search, voicemail sharing, call recording, conference CRUD, DND schedule CRUD, contact import/CRUD, tier actions, privacy scan, caller ID lookup, notification settings, device registration, marketplace greetings, voicemail SMS config
    - Add response types for paginated feeds, share links, scan results, conference details
    - _Requirements: 1.1–15.9_

  - [x] 1.4 Add new feature flag names to `packages/shared/src/feature-flags.ts`
    - Register 15 new boolean flags: `visual_voicemail_inbox`, `virtual_numbers`, `ivr_auto_attendant`, `auto_reply_sms`, `unified_inbox`, `privacy_scan`, `push_notifications`, `greetings_marketplace`, `caller_id_lookup`, `voicemail_to_sms`, `smart_routing`, `dnd_scheduling`, `voicemail_sharing`, `call_recording`, `conference_calling`
    - Register 2 new numeric flags: `max_virtual_numbers`, `max_conference_participants`
    - _Requirements: 1.9, 2.8, 3.8, 4.8, 5.7, 6.8, 7.7, 8.8, 9.7, 10.6, 11.7, 12.8, 13.8, 14.9, 15.9_

- [x] 2. Checkpoint — Ensure shared types compile
  - Run `turbo run typecheck --filter=@keepnum/shared`. Ensure all tests pass, ask the user if questions arise.

- [x] 3. Create Aurora Postgres migration files for all new and extended tables
  - [x] 3.1 Create migration for extended `voicemails` table
    - Add `folder TEXT NOT NULL DEFAULT 'inbox'`, `read BOOLEAN NOT NULL DEFAULT false`, `trashed_at TIMESTAMPTZ` columns
    - File: `db/migrations/020_voicemails_folders.sql`
    - _Requirements: 1.1, 1.2, 1.7, 1.8_

  - [x] 3.2 Create migration for extended `greetings` table
    - Add `marketplace_greeting_id UUID REFERENCES marketplace_greetings(id)` column
    - File: `db/migrations/021_greetings_marketplace_ref.sql`
    - _Requirements: 8.6_

  - [x] 3.3 Create migration for `virtual_numbers` table
    - File: `db/migrations/022_virtual_numbers.sql`
    - _Requirements: 2.1–2.8_

  - [x] 3.4 Create migration for `ivr_menus` and `ivr_options` tables
    - File: `db/migrations/023_ivr_menus.sql`
    - _Requirements: 3.1–3.8_

  - [x] 3.5 Create migration for `auto_reply_templates` table
    - File: `db/migrations/024_auto_reply_templates.sql`
    - _Requirements: 4.1–4.3_

  - [x] 3.6 Create migration for `voicemail_shares` table
    - File: `db/migrations/025_voicemail_shares.sql`
    - _Requirements: 13.1–13.8_

  - [x] 3.7 Create migration for `call_recordings` table
    - File: `db/migrations/026_call_recordings.sql`
    - _Requirements: 14.1–14.9_

  - [x] 3.8 Create migration for `conferences` and `conference_participants` tables
    - File: `db/migrations/027_conferences.sql`
    - _Requirements: 15.1–15.9_

  - [x] 3.9 Create migration for `dnd_schedules` table
    - File: `db/migrations/028_dnd_schedules.sql`
    - _Requirements: 12.1–12.8_

  - [x] 3.10 Create migration for `contacts` and `tier_actions` tables
    - File: `db/migrations/029_contacts.sql`
    - _Requirements: 11.1–11.7_

  - [x] 3.11 Create migration for `privacy_scans`, `privacy_scan_findings`, and `data_broker_sources` tables
    - File: `db/migrations/030_privacy_scans.sql`
    - _Requirements: 6.1–6.8_

  - [x] 3.12 Create migration for `marketplace_greetings` and `custom_greeting_requests` tables
    - File: `db/migrations/031_marketplace_greetings.sql`
    - _Requirements: 8.1–8.8_

  - [x] 3.13 Create migration for `caller_id_cache` table
    - File: `db/migrations/032_caller_id_cache.sql`
    - _Requirements: 9.1–9.7_

  - [x] 3.14 Create migration for `voicemail_sms_config` table
    - File: `db/migrations/033_voicemail_sms_config.sql`
    - _Requirements: 10.1–10.6_

  - [x] 3.15 Create seed migration for new feature flag defaults
    - Insert all 17 new flag defaults into `feature_flags` table
    - File: `db/migrations/034_feature_flag_defaults.sql`
    - _Requirements: 1.9, 2.8, 3.8, 4.8, 5.7, 6.8, 7.7, 8.8, 9.7, 10.6, 11.7, 12.8, 13.8, 14.9, 15.9_

- [x] 4. Extend existing voicemail-service with folders, bulk actions, search, sharing, recording, and marketplace endpoints
  - [x] 4.1 Add folder management and bulk action endpoints to `apps/lambdas/voicemail-service/src/index.ts`
    - Implement `PUT /voicemails/bulk/move`, `PUT /voicemails/bulk/read`, `DELETE /voicemails/bulk/delete`
    - Implement `GET /voicemails/search` with caller ID, transcription text, date range, and folder filters
    - Update `GET /voicemails` and `GET /voicemails/:id` to include `folder`, `read`, `trashed_at` fields
    - Gate behind `visual_voicemail_inbox` feature flag
    - _Requirements: 1.1–1.9_

  - [x] 4.2 Add voicemail sharing endpoints to `apps/lambdas/voicemail-service/src/index.ts`
    - Implement `POST /voicemails/:id/share` — generate cryptographic share token, store in `voicemail_shares`, optionally send email/SMS
    - Implement `DELETE /voicemails/:id/share/:shareToken` — revoke share link
    - Implement `GET /shared/voicemail/:shareToken` — public endpoint, no auth, return audio + transcription; 410 if expired/revoked
    - Gate behind `voicemail_sharing` feature flag
    - _Requirements: 13.1–13.8_

  - [x] 4.3 Add call recording list and download endpoints to `apps/lambdas/voicemail-service/src/index.ts`
    - Implement `GET /recordings` — list recordings for user
    - Implement `GET /recordings/:callId` — recording detail
    - Implement `GET /download/recording/:callId` — pre-signed URL with 15-min expiry
    - Gate behind `call_recording` feature flag
    - _Requirements: 14.5, 14.7_

  - [x] 4.4 Add greetings marketplace browsing endpoints to `apps/lambdas/voicemail-service/src/index.ts`
    - Implement `GET /greetings/marketplace` with category filter and pagination
    - Implement `GET /greetings/marketplace/:id/preview` — return preview audio URL
    - Implement `POST /greetings/marketplace/:id/apply` — apply marketplace greeting to a number (store reference, not copy)
    - Implement `POST /greetings/custom-request` — submit custom greeting script
    - Gate behind `greetings_marketplace` feature flag
    - _Requirements: 8.1–8.8_

  - [x] 4.5 Add voicemail-to-SMS config endpoints to `apps/lambdas/voicemail-service/src/index.ts`
    - Implement `PUT /voicemails/sms-config` and `GET /voicemails/sms-config`
    - After transcription completes, check SMS config and invoke sms-service if enabled
    - Gate behind `voicemail_to_sms` feature flag
    - _Requirements: 10.1–10.6_

  - [ ]* 4.6 Write unit tests for extended voicemail-service
    - Test folder bulk move, bulk read/unread, permanent delete from trash only
    - Test voicemail search with various filter combinations
    - Test share link creation, access, expiration, and revocation
    - Test recording list and download URL generation
    - Test marketplace greeting application stores reference not copy
    - Test voicemail-to-SMS config and trigger
    - _Requirements: 1.1–1.9, 8.1–8.8, 10.1–10.6, 13.1–13.8, 14.5, 14.7_

- [x] 5. Extend existing number-service with DND schedules and smart routing contacts
  - [x] 5.1 Add DND schedule endpoints to `apps/lambdas/number-service/src/index.ts`
    - Implement `POST /numbers/:id/dnd-schedules`, `GET /numbers/:id/dnd-schedules`, `PUT /numbers/:id/dnd-schedules/:scheduleId`, `DELETE /numbers/:id/dnd-schedules/:scheduleId`, `PUT /numbers/:id/dnd-schedules/:scheduleId/toggle`
    - Validate IANA timezone, days of week, time range
    - Gate behind `dnd_scheduling` feature flag
    - _Requirements: 12.1–12.8_

  - [x] 5.2 Add smart routing contact endpoints to `apps/lambdas/number-service/src/index.ts`
    - Implement `POST /contacts/import`, `GET /contacts`, `PUT /contacts/:contactId`, `DELETE /contacts/:contactId`, `PUT /contacts/tier-actions`
    - Support device and CSV import sources
    - Gate behind `smart_routing` feature flag
    - _Requirements: 11.1–11.7_

  - [ ]* 5.3 Write unit tests for extended number-service
    - Test DND schedule CRUD, toggle, overlapping schedule resolution
    - Test contact import, tier assignment, tier action configuration
    - _Requirements: 11.1–11.7, 12.1–12.8_

- [x] 6. Create virtual-number-service Lambda
  - [x] 6.1 Scaffold `apps/lambdas/virtual-number-service/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/index.test.ts`
    - Follow existing Lambda service patterns (pg Pool, SSM for Telnyx key, json helper, matchPath, getUserId, getDbUserId)
    - Implement all endpoints: `GET /virtual-numbers/search`, `POST /virtual-numbers`, `GET /virtual-numbers`, `GET /virtual-numbers/:id`, `DELETE /virtual-numbers/:id`, `PUT /virtual-numbers/:id/greeting`, `PUT /virtual-numbers/:id/forwarding-rule`, `POST /virtual-numbers/:id/caller-rules`, `DELETE /virtual-numbers/:id/caller-rules/:ruleId`, `POST /virtual-numbers/:id/blocklist`, `DELETE /virtual-numbers/:id/blocklist/:callerId`, `POST /virtual-numbers/:id/outbound-call`, `POST /virtual-numbers/:id/outbound-sms`
    - Enforce `max_virtual_numbers` numeric limit on provisioning using `assertNumericLimit`
    - On release, cascade delete all associated data (greetings, caller rules, blocklist, forwarding rules, voicemails)
    - Gate behind `virtual_numbers` feature flag
    - _Requirements: 2.1–2.8_

  - [ ]* 6.2 Write unit tests for virtual-number-service
    - Test provisioning limit enforcement, release cascade, independent settings
    - _Requirements: 2.1–2.8_

- [x] 7. Create ivr-service Lambda
  - [x] 7.1 Scaffold `apps/lambdas/ivr-service/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/index.test.ts`
    - Implement IVR menu CRUD: `POST /ivr-menus`, `GET /ivr-menus`, `GET /ivr-menus/:id`, `PUT /ivr-menus/:id`, `DELETE /ivr-menus/:id`
    - Implement Telnyx call control webhook handler: `POST /webhooks/telnyx/ivr` — handle DTMF gather events, execute mapped actions (forward, voicemail, sub-menu, play-and-disconnect)
    - Enforce digit uniqueness (1–9) per menu, max 9 options
    - Implement timeout handling (10s default) and invalid key replay (up to 2 additional times)
    - Gate behind `ivr_auto_attendant` feature flag
    - _Requirements: 3.1–3.8_

  - [ ]* 7.2 Write unit tests for ivr-service
    - Test IVR menu CRUD round-trip, digit constraint validation
    - Test DTMF handling: valid key → action, invalid key → replay, timeout → default action
    - _Requirements: 3.1–3.8_

- [x] 8. Create auto-reply-service Lambda
  - [x] 8.1 Scaffold `apps/lambdas/auto-reply-service/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/index.test.ts`
    - Implement template CRUD: `POST /auto-reply-templates`, `GET /auto-reply-templates`, `PUT /auto-reply-templates/:id`, `DELETE /auto-reply-templates/:id`
    - Implement internal trigger: `POST /internal/auto-reply/trigger` — select most specific matching template (specific_caller > after_hours > busy > all_missed), check blocklist, check 24h rate limit via DynamoDB `auto_reply_log`, send SMS via Telnyx, log to SMS log
    - Enforce 480-character message limit
    - Gate behind `auto_reply_sms` feature flag
    - _Requirements: 4.1–4.8_

  - [ ]* 8.2 Write unit tests for auto-reply-service
    - Test template CRUD, scenario matching priority, blocklist suppression, rate limiting
    - _Requirements: 4.1–4.8_

- [x] 9. Create unified-inbox-service Lambda
  - [x] 9.1 Scaffold `apps/lambdas/unified-inbox-service/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/index.test.ts`
    - Implement `GET /unified-inbox` with type, numberId, dateFrom, dateTo, page, limit filters
    - Implement `GET /unified-inbox/:itemId` — redirect to detail view
    - Implement `GET /unified-inbox/unread-count`
    - Query DynamoDB `unified_inbox_items` table for fast reads, merge chronologically, paginate (default 50)
    - Gate behind `unified_inbox` feature flag
    - _Requirements: 5.1–5.7_

  - [ ]* 9.2 Write unit tests for unified-inbox-service
    - Test chronological ordering, filter correctness, pagination invariant
    - _Requirements: 5.1–5.7_

- [x] 10. Create privacy-scan-service Lambda
  - [x] 10.1 Scaffold `apps/lambdas/privacy-scan-service/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/index.test.ts`
    - Implement `POST /privacy-scans` — initiate scan, spawn parallel HTTP requests to data broker sources, 30s overall timeout
    - Implement `GET /privacy-scans` — list scan history
    - Implement `GET /privacy-scans/:scanId` — scan results with findings
    - Implement `GET /privacy-scans/:scanId/compare` — diff against previous scan (new, resolved, unchanged)
    - Mark unreachable sources as `scan_incomplete` without blocking overall scan
    - Gate behind `privacy_scan` feature flag
    - _Requirements: 6.1–6.8_

  - [ ]* 10.2 Write unit tests for privacy-scan-service
    - Test scan with mixed reachable/unreachable sources, comparison logic
    - _Requirements: 6.1–6.8_

- [x] 11. Create caller-id-service Lambda
  - [x] 11.1 Scaffold `apps/lambdas/caller-id-service/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/index.test.ts`
    - Implement `GET /caller-id/lookup/:phoneNumber` and `POST /caller-id/lookup` — reverse phone lookup with cache check (30-day TTL in `caller_id_cache` table)
    - Implement `GET /internal/caller-id/:phoneNumber` — internal invocation from call-service
    - Return name, city, state, carrier, spam score (0–100); return "Unknown" if provider unavailable
    - Gate behind `caller_id_lookup` feature flag
    - _Requirements: 9.1–9.7_

  - [ ]* 11.2 Write unit tests for caller-id-service
    - Test cache hit/miss, provider unavailable fallback, spam score range validation
    - _Requirements: 9.1–9.7_

- [x] 12. Create conference-service Lambda
  - [x] 12.1 Scaffold `apps/lambdas/conference-service/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/index.test.ts`
    - Implement `POST /conferences` — create bridge with dial-in number and 6-digit PIN, enforce `max_conference_participants` limit
    - Implement `GET /conferences`, `GET /conferences/:id`, `DELETE /conferences/:id`
    - Implement `PUT /conferences/:id/participants/:participantId` — mute/unmute
    - Implement `DELETE /conferences/:id/participants/:participantId` — remove participant
    - Implement `POST /conferences/:id/merge` — merge active call into conference
    - Implement `POST /webhooks/telnyx/conference` — handle join/leave events via Telnyx Call Control
    - On host disconnect, end conference and disconnect all participants, write conference log
    - Gate behind `conference_calling` feature flag
    - _Requirements: 15.1–15.9_

  - [ ]* 12.2 Write unit tests for conference-service
    - Test bridge creation, PIN validation, participant limit, mute/unmute, host disconnect cascade
    - _Requirements: 15.1–15.9_

- [x] 13. Create notification-service Lambda
  - [x] 13.1 Scaffold `apps/lambdas/notification-service/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/index.test.ts`
    - Implement `POST /devices` — register device token as SNS Platform Endpoint
    - Implement `DELETE /devices/:deviceId` — unregister
    - Implement `PUT /notifications/settings` and `GET /notifications/settings` — per-number push/SMS toggle
    - Implement `POST /internal/notifications/voicemail` — look up user's device tokens, publish to SNS endpoints with caller ID, source number, transcription preview (first 100 chars); retry up to 3 times with exponential backoff
    - Optional SMS notification via Telnyx to configured destination
    - Gate behind `push_notifications` feature flag
    - _Requirements: 7.1–7.7_

  - [ ]* 13.2 Write unit tests for notification-service
    - Test device registration, per-number settings, push payload fields, retry logic
    - _Requirements: 7.1–7.7_

- [x] 14. Checkpoint — Ensure all Lambda services compile and pass basic tests
  - Run `turbo run typecheck` and `turbo run test` across all Lambda packages. Ensure all tests pass, ask the user if questions arise.

- [x] 15. Extend call-service with new routing steps
  - [x] 15.1 Update `apps/lambdas/call-service/src/index.ts` inbound call routing decision tree
    - Add step 2: Caller ID lookup (if `caller_id_lookup` enabled) — invoke caller-id-service, enrich call log
    - Add step 5: Smart routing contacts (if `smart_routing` enabled) — match caller against contacts, apply tier action
    - Add step 6: DND schedule check (if `dnd_scheduling` enabled) — check active schedules, VIP bypasses DND
    - Add step 7: IVR menu check (if `ivr_auto_attendant` enabled) — hand off to ivr-service
    - Add step 9: Call recording (if `call_recording` enabled) — play consent announcement, start Telnyx recording, store in `call_recordings` table
    - Add step 12: Auto-reply trigger (if `auto_reply_sms` enabled) — invoke auto-reply-service on missed/voicemail
    - Add step 13: Push notification trigger (if `push_notifications` enabled) — invoke notification-service on voicemail received
    - Update Lambda IAM to allow invoking new services
    - _Requirements: 3.4, 4.4, 7.1, 9.1, 9.3, 11.4–11.6, 12.4, 14.2–14.4_

  - [ ]* 15.2 Write unit tests for extended call-service routing
    - Test routing decision tree with DND + smart routing + IVR + recording interactions
    - Test VIP bypass of DND, caller ID enrichment, auto-reply trigger on missed call
    - _Requirements: 3.4, 4.4, 9.1, 11.4–11.6, 12.4, 14.2–14.4_

- [x] 16. Extend admin-service with greetings marketplace CRUD
  - [x] 16.1 Add marketplace greeting admin endpoints to `apps/lambdas/admin-service/src/index.ts`
    - Implement `POST /admin/greetings`, `PUT /admin/greetings/:id`, `DELETE /admin/greetings/:id`
    - Write audit log entries for greeting catalogue changes
    - _Requirements: 8.7_

  - [ ]* 16.2 Write unit tests for admin greetings CRUD
    - Test create, update, delete marketplace greetings
    - _Requirements: 8.7_

- [x] 17. Extend retention-job with trash auto-deletion and recording cleanup
  - [x] 17.1 Update `apps/lambdas/retention-job/src/index.ts`
    - Add trash auto-deletion: permanently delete voicemails where `folder = 'trash'` and `trashed_at` is more than 30 days ago
    - Add call recording cleanup: apply number's retention policy to recordings
    - Add expired share link cleanup: delete shares past `expires_at`
    - Add expired caller ID cache cleanup: delete entries past `expires_at`
    - _Requirements: 1.7, 9.5, 13.5, 14.6_

  - [ ]* 17.2 Write unit tests for extended retention-job
    - Test trash 30-day auto-deletion, recording retention, share link expiry cleanup
    - _Requirements: 1.7, 9.5, 13.5, 14.6_

- [x] 18. Checkpoint — Ensure all services compile and tests pass
  - Run `turbo run typecheck` and `turbo run test`. Ensure all tests pass, ask the user if questions arise.

- [x] 19. Update Terraform infrastructure for new Lambda services and DynamoDB tables
  - [x] 19.1 Add 8 new Lambda function entries to `infra/modules/lambda/main.tf`
    - Add `virtual-number-service` (needs_vpc, needs_aurora, needs_telnyx_ssm)
    - Add `ivr-service` (needs_telnyx_ssm, needs_aurora, needs_vpc)
    - Add `auto-reply-service` (needs_telnyx_ssm, needs_aurora, needs_vpc, dynamodb_tables: [auto_reply_log])
    - Add `unified-inbox-service` (dynamodb_tables: [unified_inbox_items], needs_aurora, needs_vpc)
    - Add `privacy-scan-service` (needs_aurora, needs_vpc)
    - Add `caller-id-service` (needs_aurora, needs_vpc)
    - Add `conference-service` (needs_telnyx_ssm, needs_aurora, needs_vpc, dynamodb_tables: [conference_logs])
    - Add `notification-service` (dynamodb_tables: [device_tokens, notification_settings], needs_sns: true)
    - Update `call-service` invoke_functions to include new services: `ivr-service`, `auto-reply-service`, `caller-id-service`, `notification-service`
    - Update `voicemail-service` invoke_functions to include `notification-service` and `sms-service`
    - Add SNS publish policy for notification-service
    - _Requirements: 2.1–15.9_

  - [x] 19.2 Add new Lambda module variables to `infra/modules/lambda/variables.tf`
    - Add variables for new DynamoDB table ARNs and names: `auto_reply_log`, `unified_inbox_items`, `device_tokens`, `notification_settings`, `conference_logs`
    - Add SNS platform application ARN variables for APNs and FCM
    - _Requirements: 4.6, 5.1, 7.1, 15.8_

  - [x] 19.3 Add new Lambda module outputs to `infra/modules/lambda/outputs.tf`
    - Add function ARNs and invoke ARNs for all 8 new Lambda functions
    - _Requirements: 2.1–15.9_

  - [x] 19.4 Add 5 new DynamoDB tables to `infra/modules/dynamodb/main.tf`
    - Add `auto_reply_log` table (PK: numberId#callerId, SK: sentAt, TTL enabled)
    - Add `unified_inbox_items` table (PK: userId, SK: timestamp#itemType#itemId, GSI: userId-sourceNumber-index, TTL enabled)
    - Add `device_tokens` table (PK: userId, SK: deviceId)
    - Add `notification_settings` table (PK: userId#numberId, SK: numberType)
    - Add `conference_logs` table (PK: userId, SK: timestamp#conferenceId, TTL enabled)
    - _Requirements: 4.6, 5.1, 7.1–7.4, 15.8_

  - [x] 19.5 Update DynamoDB module outputs in `infra/modules/dynamodb/outputs.tf`
    - Export table names and ARNs for all 5 new tables
    - _Requirements: 4.6, 5.1, 7.1–7.4, 15.8_

  - [x] 19.6 Add new API Gateway routes to `infra/modules/api-gateway/main.tf`
    - Add all new routes for: virtual-number-service, ivr-service, auto-reply-service, unified-inbox-service, privacy-scan-service, caller-id-service, conference-service, notification-service
    - Add extended routes for voicemail-service (bulk, search, sharing, recordings, marketplace, sms-config)
    - Add extended routes for number-service (DND schedules, contacts, tier-actions)
    - Add admin greetings routes
    - Add public shared voicemail route (no auth): `GET /shared/voicemail/{shareToken}`
    - Add Telnyx webhook routes (no auth): `POST /webhooks/telnyx/ivr`, `POST /webhooks/telnyx/conference`
    - _Requirements: 1.1–15.9_

  - [x] 19.7 Update `infra/environments/dev/main.tf` to wire new DynamoDB outputs to Lambda module
    - Pass new DynamoDB table names and ARNs from dynamodb module to lambda module
    - Add SNS platform application ARN variables
    - _Requirements: 2.1–15.9_

  - [x] 19.8 Update `infra/environments/dev/variables.tf` with new variables
    - Add SNS platform application ARN variables for APNs and FCM
    - Add caller ID provider API key SSM ARN variable
    - _Requirements: 7.5, 9.1_

- [x] 20. Create CloudFormation bootstrap template for new AWS account setup
  - [x] 20.1 Create `infra/bootstrap/bootstrap.yaml` CloudFormation template
    - SSM parameters for all API keys (Telnyx, Adyen, caller ID provider) as SecureString
    - S3 bucket for Terraform state with versioning and encryption
    - DynamoDB table for Terraform state locking
    - VPC with 2 public subnets, 2 private subnets, NAT gateway, internet gateway
    - Security group for Lambda VPC access (egress-only to Aurora and internet)
    - Security group for Aurora (ingress from Lambda SG on port 5432)
    - SNS platform applications for APNs and FCM (placeholder ARNs, manual config required)
    - SES email identity verification resource
    - Outputs: VPC ID, subnet IDs, security group IDs, SSM ARNs, S3 bucket name, DynamoDB lock table name
    - _Requirements: 7.5, 9.1_

- [x] 21. Create IAM CloudFormation template
  - [x] 21.1 Create `infra/bootstrap/iam.yaml` CloudFormation template
    - CI/CD deployment role with permissions for Lambda, API Gateway, DynamoDB, S3, CloudFormation
    - Terraform execution role with full infrastructure management permissions
    - Developer role with read-only access plus Lambda invoke for testing
    - Admin role with full access
    - All roles follow least-privilege principle with condition keys for the project
    - _Requirements: 2.1–15.9_

- [x] 22. Checkpoint — Ensure Terraform validates
  - Run `terraform validate` in `infra/environments/dev/`. Ensure all tests pass, ask the user if questions arise.

- [x] 23. Update shared API client with all new endpoints
  - [x] 23.1 Add new API client functions to `packages/shared/src/api-client.ts`
    - Virtual numbers: `searchVirtualNumbers`, `provisionVirtualNumber`, `listVirtualNumbers`, `getVirtualNumber`, `releaseVirtualNumber`, `setVirtualNumberGreeting`, `setVirtualNumberForwardingRule`, `addVirtualNumberCallerRule`, `deleteVirtualNumberCallerRule`, `addVirtualNumberBlockList`, `removeVirtualNumberBlockList`, `placeOutboundCall`, `sendOutboundSms`
    - IVR: `createIvrMenu`, `listIvrMenus`, `getIvrMenu`, `updateIvrMenu`, `deleteIvrMenu`
    - Auto-reply: `createAutoReplyTemplate`, `listAutoReplyTemplates`, `updateAutoReplyTemplate`, `deleteAutoReplyTemplate`
    - Voicemail extensions: `bulkMoveVoicemails`, `bulkReadVoicemails`, `bulkDeleteVoicemails`, `searchVoicemails`, `shareVoicemail`, `revokeVoicemailShare`, `getSharedVoicemail`
    - Recordings: `listRecordings`, `getRecording`, `getRecordingDownloadUrl`
    - Unified inbox: `getUnifiedInbox`, `getUnifiedInboxItem`, `getUnreadCount`
    - Privacy scan: `startPrivacyScan`, `listPrivacyScans`, `getPrivacyScanResults`, `comparePrivacyScans`
    - Caller ID: `lookupCallerId`
    - Conference: `createConference`, `listConferences`, `getConference`, `endConference`, `muteParticipant`, `removeParticipant`, `mergeCallIntoConference`
    - Notifications: `registerDevice`, `unregisterDevice`, `updateNotificationSettings`, `getNotificationSettings`
    - DND: `createDndSchedule`, `listDndSchedules`, `updateDndSchedule`, `deleteDndSchedule`, `toggleDndSchedule`
    - Contacts: `importContacts`, `listContacts`, `updateContact`, `deleteContact`, `setTierActions`
    - Marketplace: `listMarketplaceGreetings`, `previewGreeting`, `applyGreeting`, `requestCustomGreeting`
    - Voicemail SMS config: `setVoicemailSmsConfig`, `getVoicemailSmsConfig`
    - Admin greetings: `createAdminGreeting`, `updateAdminGreeting`, `deleteAdminGreeting`
    - _Requirements: 1.1–15.9_

- [x] 24. Implement web app pages for all 15 new features
  - [x] 24.1 Create `apps/web/src/pages/VoicemailInboxPage.tsx`
    - Visual voicemail inbox with folder tabs (Inbox, Saved, Trash), bulk action toolbar (move, read/unread, delete), search bar with filters
    - Voicemail list with caller ID, date/time, duration, transcription preview, read/unread indicator
    - Audio player for voicemail playback
    - Share dialog with expiration picker and email/SMS input
    - _Requirements: 1.1–1.9, 13.1–13.8_

  - [x] 24.2 Create `apps/web/src/pages/VirtualNumbersPage.tsx`
    - Virtual number list with status, settings summary
    - Provision dialog with area code/region/pattern search
    - Number detail view with greeting, forwarding, caller rules, blocklist management
    - Outbound call and SMS dialers
    - _Requirements: 2.1–2.8_

  - [x] 24.3 Create `apps/web/src/pages/IvrMenuPage.tsx`
    - IVR menu builder with drag-and-drop option ordering
    - Greeting upload/TTS input, option configuration (digit, action, action data)
    - Preview of menu flow
    - _Requirements: 3.1–3.8_

  - [x] 24.4 Create `apps/web/src/pages/AutoReplyPage.tsx`
    - Auto-reply template list per number
    - Template editor with scenario picker, message input (character counter, 480 max), URL insertion
    - _Requirements: 4.1–4.8_

  - [x] 24.5 Create `apps/web/src/pages/UnifiedInboxPage.tsx`
    - Unified feed with type icons (voicemail, missed call, SMS), source number badge, timestamp, preview
    - Filter bar: type, source number, date range
    - Click-through to detail views
    - Unread count badge in navigation
    - _Requirements: 5.1–5.7_

  - [x] 24.6 Create `apps/web/src/pages/PrivacyScanPage.tsx`
    - Scan initiation with phone number input
    - Results view with findings table: source, URL, data types, severity, opt-out link
    - Scan history list with comparison view (new/resolved/unchanged)
    - _Requirements: 6.1–6.8_

  - [x] 24.7 Create `apps/web/src/pages/RecordingsPage.tsx`
    - Recording list with call ID, caller, duration, date
    - Audio player and download button
    - _Requirements: 14.5, 14.7_

  - [x] 24.8 Create `apps/web/src/pages/ConferencePage.tsx`
    - Conference list with status, participant count
    - Create conference dialog
    - Active conference view with participant list, mute/unmute/remove controls
    - Dial-in number and PIN display
    - _Requirements: 15.1–15.9_

  - [x] 24.9 Create `apps/web/src/pages/GreetingsMarketplacePage.tsx`
    - Greeting catalogue with category filter, audio preview player
    - Apply greeting dialog with number selector
    - Custom greeting request form
    - _Requirements: 8.1–8.8_

  - [x] 24.10 Update `apps/web/src/pages/SettingsPage.tsx` or create settings sub-pages
    - DND schedule management UI per number
    - Contact import and tier management UI
    - Notification settings (push/SMS toggle per number)
    - Voicemail-to-SMS config per number
    - Caller ID lookup toggle
    - _Requirements: 7.3–7.4, 9.4, 10.1, 11.1–11.3, 12.1–12.6_

  - [x] 24.11 Update web app router in `apps/web/src/App.tsx`
    - Add routes for all new pages
    - Add navigation links with feature flag gating (hide nav items when feature disabled)
    - _Requirements: 1.9, 2.8, 3.8, 4.8, 5.7, 6.8, 7.7, 8.8, 9.7, 10.6, 11.7, 12.8, 13.8, 14.9, 15.9_

- [x] 25. Implement admin app pages for new features
  - [x] 25.1 Create `apps/admin/src/pages/GreetingsPage.tsx`
    - Marketplace greeting catalogue CRUD: list, create, edit, delete
    - Audio file upload, category selection, voice talent input
    - Custom greeting request queue with status management
    - _Requirements: 8.5, 8.7_

  - [x] 25.2 Update `apps/admin/src/pages/FeatureFlagsPage.tsx`
    - Add all 17 new feature flags to the defaults management UI
    - Display boolean flags as toggles, numeric flags as number inputs
    - _Requirements: 1.9, 2.8, 3.8, 4.8, 5.7, 6.8, 7.7, 8.8, 9.7, 10.6, 11.7, 12.8, 13.8, 14.9, 15.9_

  - [x] 25.3 Update `apps/admin/src/pages/UserDetailPage.tsx`
    - Add new feature flag overrides for all 17 new flags in user detail view
    - Show virtual number count, conference usage, privacy scan history in user metrics
    - _Requirements: 1.9–15.9_

  - [x] 25.4 Update `apps/admin/src/pages/PackagesPage.tsx`
    - Add all 17 new flags to package flag configuration
    - _Requirements: 1.9–15.9_

  - [x] 25.5 Update admin app router in `apps/admin/src/App.tsx`
    - Add route for GreetingsPage
    - Add navigation link for greetings management
    - _Requirements: 8.7_

- [x] 26. Implement mobile app screens for new features
  - [x] 26.1 Create iOS screens in `apps/ios/src/screens/`
    - `VoicemailInboxScreen.tsx` — folder tabs, bulk actions, search, audio player, share
    - `VirtualNumbersScreen.tsx` — list, provision, detail with settings
    - `UnifiedInboxScreen.tsx` — aggregated feed with filters
    - `ConferenceScreen.tsx` — create, manage, participant controls
    - `SettingsExtScreen.tsx` — DND schedules, contacts/tiers, notification settings, voicemail-to-SMS, caller ID toggle
    - _Requirements: 1.1–1.9, 2.1–2.8, 5.1–5.7, 7.3–7.4, 9.4, 10.1, 11.1–11.3, 12.1–12.6, 15.1–15.9_

  - [x] 26.2 Update iOS navigation in `apps/ios/src/navigation/AppNavigator.tsx`
    - Add routes for all new screens with feature flag gating
    - Add push notification handling (register device token on app launch, handle notification tap)
    - _Requirements: 7.1–7.7_

  - [x] 26.3 Create Android screens in `apps/android/src/screens/`
    - Mirror all iOS screens: `VoicemailInboxScreen.tsx`, `VirtualNumbersScreen.tsx`, `UnifiedInboxScreen.tsx`, `ConferenceScreen.tsx`, `SettingsExtScreen.tsx`
    - _Requirements: 1.1–1.9, 2.1–2.8, 5.1–5.7, 7.3–7.4, 9.4, 10.1, 11.1–11.3, 12.1–12.6, 15.1–15.9_

  - [x] 26.4 Update Android navigation in `apps/android/src/navigation/AppNavigator.tsx`
    - Add routes for all new screens with feature flag gating
    - Add push notification handling (register FCM token on app launch, handle notification tap)
    - _Requirements: 7.1–7.7_

- [x] 27. Checkpoint — Ensure all apps compile
  - Run `turbo run typecheck`. Ensure all tests pass, ask the user if questions arise.

- [x] 28. Property-based tests for all 43 correctness properties
  - [ ]* 28.1 Write property tests for visual voicemail inbox (Properties 1–7)
    - **Property 1: New voicemails default to inbox/unread** — Validates: Requirements 1.2
    - **Property 2: Bulk move updates all specified voicemails** — Validates: Requirements 1.3
    - **Property 3: Bulk read/unread updates all specified voicemails** — Validates: Requirements 1.4
    - **Property 4: Permanent delete only works from Trash** — Validates: Requirements 1.5
    - **Property 5: Voicemail search returns only matching results** — Validates: Requirements 1.6
    - **Property 6: Trash auto-deletion after 30 days** — Validates: Requirements 1.7
    - **Property 7: Voicemail response contains all required fields** — Validates: Requirements 1.8

  - [ ]* 28.2 Write property tests for virtual numbers (Properties 8–10)
    - **Property 8: Virtual number provisioning enforces numeric limit** — Validates: Requirements 2.1, 2.2
    - **Property 9: Virtual number release cascades all associated data** — Validates: Requirements 2.7
    - **Property 10: Virtual number settings are independent** — Validates: Requirements 2.3

  - [ ]* 28.3 Write property tests for IVR (Properties 11–12)
    - **Property 11: IVR menu round-trip and digit constraint** — Validates: Requirements 3.1, 3.2, 3.3
    - **Property 12: IVR invalid key replay and fallback** — Validates: Requirements 3.7

  - [ ]* 28.4 Write property tests for auto-reply (Properties 13–16)
    - **Property 13: Auto-reply template round-trip and length constraint** — Validates: Requirements 4.1, 4.2, 4.3
    - **Property 14: Auto-reply scenario matching** — Validates: Requirements 4.4
    - **Property 15: Auto-reply suppression rules** — Validates: Requirements 4.5, 4.6
    - **Property 16: Auto-reply logging** — Validates: Requirements 4.7

  - [ ]* 28.5 Write property tests for unified inbox (Properties 17–20)
    - **Property 17: Unified inbox chronological ordering and completeness** — Validates: Requirements 5.1
    - **Property 18: Unified inbox item contains required fields** — Validates: Requirements 5.2
    - **Property 19: Unified inbox filter correctness** — Validates: Requirements 5.3
    - **Property 20: Unified inbox pagination invariant** — Validates: Requirements 5.6

  - [ ]* 28.6 Write property tests for privacy scan (Properties 21–22)
    - **Property 21: Privacy scan findings contain required fields and severity** — Validates: Requirements 6.1, 6.3
    - **Property 22: Privacy scan comparison identifies new and resolved findings** — Validates: Requirements 6.5

  - [ ]* 28.7 Write property tests for push notifications (Properties 23–24)
    - **Property 23: Push notification payload contains required fields** — Validates: Requirements 7.2
    - **Property 24: Push notification respects per-number settings** — Validates: Requirements 7.3

  - [ ]* 28.8 Write property tests for greetings marketplace (Properties 25–26)
    - **Property 25: Marketplace greeting catalogue filter correctness** — Validates: Requirements 8.1, 8.2
    - **Property 26: Marketplace greeting application stores reference, not copy** — Validates: Requirements 8.4, 8.6

  - [ ]* 28.9 Write property tests for caller ID and voicemail-to-SMS (Properties 27–29)
    - **Property 27: Caller ID lookup returns valid data with score in range** — Validates: Requirements 9.1, 9.2, 9.3, 9.4
    - **Property 28: Caller ID cache round-trip** — Validates: Requirements 9.5
    - **Property 29: Voicemail-to-SMS formatting** — Validates: Requirements 10.2, 10.3, 10.4

  - [ ]* 28.10 Write property tests for smart routing and DND (Properties 30–34)
    - **Property 30: Contact import round-trip and tier assignment** — Validates: Requirements 11.1, 11.2
    - **Property 31: Smart routing applies correct tier action** — Validates: Requirements 11.4, 11.6
    - **Property 32: VIP callers bypass DND** — Validates: Requirements 11.5, 12.4
    - **Property 33: DND schedule round-trip and toggle** — Validates: Requirements 12.1, 12.2, 12.3, 12.6
    - **Property 34: Overlapping DND schedules resolve by earliest start time** — Validates: Requirements 12.7

  - [ ]* 28.11 Write property tests for voicemail sharing (Properties 35–36)
    - **Property 35: Voicemail share link lifecycle** — Validates: Requirements 13.1, 13.2, 13.5, 13.6
    - **Property 36: Shared voicemail accessible without authentication** — Validates: Requirements 13.7

  - [ ]* 28.12 Write property tests for call recording (Properties 37–38)
    - **Property 37: Call recording lifecycle — consent, storage, association** — Validates: Requirements 14.2, 14.4, 14.5
    - **Property 38: Recording download URL is time-limited** — Validates: Requirements 14.7

  - [ ]* 28.13 Write property tests for conference (Properties 39–42)
    - **Property 39: Conference bridge creation and PIN validation** — Validates: Requirements 15.1, 15.3, 15.4
    - **Property 40: Conference participant limit enforcement** — Validates: Requirements 15.2
    - **Property 41: Conference host mute/unmute/remove round-trip** — Validates: Requirements 15.5
    - **Property 42: Host disconnect ends conference** — Validates: Requirements 15.7, 15.8

  - [ ]* 28.14 Write property test for feature flag gating (Property 43)
    - **Property 43: Feature flag gating for all new features** — Validates: Requirements 1.9, 2.8, 3.8, 4.8, 5.7, 6.8, 7.7, 8.8, 9.7, 10.6, 11.7, 12.8, 13.8, 14.9, 15.9

- [x] 29. Update OpenAPI specification
  - [x] 29.1 Update `docs/openapi.yaml` with all new endpoints
    - Add path definitions for all new routes across all 8 new services and 2 extended services
    - Add request/response schemas for all new types
    - Add 17 new feature flag descriptions
    - Add public shared voicemail endpoint (no security requirement)
    - Add Telnyx webhook endpoints for IVR and conference
    - Document error responses (400, 401, 403, 404, 410, 503)
    - _Requirements: 1.1–15.9_

- [x] 30. Create comprehensive local development instructions
  - [x] 30.1 Create `INSTRUCTIONS.md` at project root
    - Prerequisites: Node.js 18+, AWS CLI, Terraform 1.5+, Docker (for local Postgres), pnpm/yarn
    - Bootstrap steps: deploy `infra/bootstrap/bootstrap.yaml`, configure SSM parameters, run Terraform init/plan/apply
    - Local database setup: Docker Compose for Postgres, run all migrations in order
    - Environment variables: document all required env vars per Lambda service
    - Running services locally: instructions for running individual Lambda handlers with mock events
    - Running tests: `turbo run test`, individual service tests, property-based tests
    - Deploying: CI/CD pipeline overview, manual deployment steps
    - Troubleshooting: common issues and solutions
    - _Requirements: 1.1–15.9_

- [x] 31. Final checkpoint — Ensure all tests pass and all apps compile
  - Run `turbo run typecheck` and `turbo run test` across the entire monorepo. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1–43)
- Unit tests validate specific examples and edge cases
- All new Lambda services follow the existing patterns in the monorepo (pg Pool, SSM, json helper, matchPath)
- All new features are gated by feature flags using the existing `resolveFlag`/`assertFlag` pattern
