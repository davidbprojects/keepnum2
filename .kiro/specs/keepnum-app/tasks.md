# Implementation Plan: KeepNum App

## Overview

Incremental implementation of the KeepNum monorepo: shared packages first, then Lambda functions, then frontend apps, then infrastructure. Each task builds on the previous and ends with all pieces wired together.

## Tasks

- [x] 1. Bootstrap monorepo and shared packages
  - Initialise npm/yarn workspaces (or Turborepo) at repo root with `apps/` and `packages/` directories
  - Create `packages/shared` with TypeScript config, Amplify config (`amplify-config.ts`), API client helpers, auth helpers, and all data model types/interfaces matching the Aurora and DynamoDB schemas
  - Create `packages/ui-components` with a minimal shared component library (Button, Input, Card) compatible with React and React Native
  - _Requirements: 13.1, 13.2, 14.1_

- [x] 2. Implement feature flag resolver shared module
  - [x] 2.1 Create `packages/shared/src/feature-flags.ts` with `resolveFlag(userId, flagName, db)` implementing the three-level priority chain (user override → package flag → system default → `false`)
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_
  - [ ]* 2.2 Write property test for feature flag three-level priority chain
    - **Property 31: Feature flag three-level priority chain**
    - **Validates: Requirements 16.2, 16.3, 16.4, 16.5**
  - [ ]* 2.3 Write property test for feature flag enforcement returning 403
    - **Property 32: Feature flag enforcement returns 403**
    - **Validates: Requirements 16.1, 16.9**

- [x] 3. Set up Aurora Postgres schema migrations
  - Create a `db/migrations/` directory with SQL migration files for all Aurora tables: `users`, `parked_numbers`, `forwarding_rules`, `caller_rules`, `block_list`, `voicemails`, `sms_messages`, `greetings`, `add_ons`, `packages`, `feature_flags`, `package_flags`, `user_feature_overrides`, `subscriptions`, `payment_methods`, `invoices`, `admin_audit_log`
  - Seed migration for default packages (Free, Basic, Pro, Enterprise) and default feature flag values
  - _Requirements: 14.3, 17.3, 17.6_

- [x] 4. Implement `auth-service` Lambda
  - [x] 4.1 Scaffold Lambda handler with routes: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `DELETE /auth/account`
    - Orchestrate Cognito SDK calls for registration, login, token refresh, and account deletion trigger
    - On account deletion, mark user `deleted_at` in Aurora and release all parked numbers (call Telnyx release API)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_
  - [x] 4.2 Write property test for registration and login round-trip
    - **Property 1: Registration and login round-trip**
    - **Validates: Requirements 1.1, 1.2**
  - [ ]* 4.3 Write property test for authentication error indistinguishability
    - **Property 2: Authentication error indistinguishability**
    - **Validates: Requirements 1.3**
  - [ ]* 4.4 Write property test for token refresh round-trip
    - **Property 3: Token refresh round-trip**
    - **Validates: Requirements 1.4**
  - [ ]* 4.5 Write property test for account deletion deactivating all parked numbers
    - **Property 4: Account deletion deactivates all parked numbers**
    - **Validates: Requirements 1.6**

- [x] 5. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement `number-service` Lambda
  - [x] 6.1 Scaffold Lambda handler with all number management routes: search, provision, list, delete, forwarding rule, retention, greeting, caller rules, block list
    - Integrate `resolveFlag` checks for `call_parking`, `number_search`, `max_parked_numbers`, `youmail_caller_rules`, `youmail_block_list`, `youmail_custom_greetings`, `youmail_smart_greetings`
    - Call Telnyx API for number search and provisioning; roll back Aurora record on Telnyx error
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.3, 3.5, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.3, 12.5, 12.6_
  - [x] 6.2 Write property test for parking a number and list round-trip
    - **Property 5: Parking a number makes it appear in the user's list**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  - [x] 6.3 Write property test for failed provisioning leaving state unchanged
    - **Property 6: Failed provisioning leaves state unchanged**
    - **Validates: Requirements 2.6**
  - [x] 6.4 Write property test for forwarding rule round-trip and single-rule invariant
    - **Property 7: Forwarding rule round-trip and single-rule invariant**
    - **Validates: Requirements 3.1, 3.5**
  - [x] 6.5 Write property test for retention policy round-trip
    - **Property 13: Retention policy round-trip**
    - **Validates: Requirements 6.1, 6.5**
  - [x] 6.6 Write property test for number search results matching filter criteria
    - **Property 22: Number search results match filter criteria**
    - **Validates: Requirements 11.1, 11.2, 11.3**
  - [x] 6.7 Write property test for Telnyx unavailability returning error not stale data
    - **Property 23: Telnyx unavailability returns error, not stale data**
    - **Validates: Requirements 11.6**
  - [x] 6.8 Write property test for per-caller rule round-trip and routing
    - **Property 24: Per-caller rule round-trip and routing**
    - **Validates: Requirements 12.1, 12.2, 12.3**
  - [x] 6.9 Write property test for smart greeting selecting correct message by caller type
    - **Property 26: Smart greeting selects correct message by caller type**
    - **Validates: Requirements 12.5, 12.6**

- [x] 7. Implement `spam-filter-service` Lambda
  - [x] 7.1 Implement the spam filter module as a synchronously-invokable Lambda (and shared helper) that queries Telnyx spam reputation data for a caller ID or SMS sender
    - Return `{ isSpam: boolean, score: number }` and write a `spam_log` DynamoDB entry when spam is detected
    - Implement false-positive handling: mark `falsePositive = true` in `spam_log`, deliver item, add caller to allow list
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [ ]* 7.2 Write property test for spam evaluation and blocking
    - **Property 19: Spam evaluation and blocking**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
  - [ ]* 7.3 Write property test for false positive restoring delivery and updating allow list
    - **Property 20: False positive restores delivery and updates allow list**
    - **Validates: Requirements 9.5, 9.6**

- [x] 8. Implement `call-screening-service` Lambda
  - [x] 8.1 Implement the call screening module invoked by `call-service` when the add-on is enabled
    - Use Telnyx call control API to: play name-prompt to caller, record caller name (10-second timeout), relay recording to user, accept/reject decision
    - On rejection or timeout, route call to voicemail
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [ ]* 8.2 Write property test for call screening state machine ordering
    - **Property 21: Call screening state machine ordering**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

- [x] 9. Implement `call-service` Lambda
  - [x] 9.1 Implement the Telnyx call webhook handler (`POST /webhooks/telnyx/call`) with the full routing decision tree:
    1. Block list check → disconnect if matched
    2. Spam filter (if add-on enabled) → block if spam
    3. Per-caller rules → apply custom action if matched
    4. Call screening (if add-on enabled) → prompt for name
    5. Forwarding rule → forward if active
    6. Default → voicemail
    - Write call log entry to DynamoDB via `log-service` after each routing decision
    - _Requirements: 3.2, 3.4, 9.1, 9.2, 10.1, 12.2, 12.4_
  - [ ]* 9.2 Write property test for call routing respecting forwarding rule state
    - **Property 8: Call routing respects forwarding rule state**
    - **Validates: Requirements 3.2, 3.3, 3.4**
  - [ ]* 9.3 Write property test for block list causing disconnect disposition
    - **Property 25: Block list causes disconnect disposition**
    - **Validates: Requirements 12.4**

- [x] 10. Implement `sms-service` Lambda
  - [x] 10.1 Implement the Telnyx SMS webhook handler (`POST /webhooks/telnyx/sms`)
    - Apply spam filter if add-on enabled; discard and log if spam
    - Forward to configured phone number via Telnyx SMS API and/or email via SES
    - On forwarding failure: store original message in `sms_messages`, write failure log entry
    - Store any MMS media in Telnyx Object Storage under `sms-media/` key scheme
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 9.3, 9.4_
  - [ ]* 10.2 Write property test for SMS forwarding triggering all configured destinations
    - **Property 9: SMS forwarding triggers all configured destinations**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
  - [ ]* 10.3 Write property test for SMS forwarding failure preserving original message
    - **Property 10: SMS forwarding failure preserves original message**
    - **Validates: Requirements 4.5**

- [x] 11. Implement `voicemail-service` Lambda
  - [x] 11.1 Implement the Telnyx voicemail webhook handler (`POST /webhooks/telnyx/voicemail`) and voicemail query routes (`GET /voicemails`, `GET /voicemails/:id`)
    - Fetch audio from Telnyx, store in Telnyx Object Storage under `voicemails/` key scheme, write `voicemails` Aurora record
    - Trigger Telnyx transcription; on completion update `transcription` and `transcription_status`
    - On transcription success: email transcribed text to user via SES
    - On transcription failure: set `transcription_status = 'failed'`, email user that voicemail was received but transcription unavailable
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 11.2 Write property test for voicemail processing invariants
    - **Property 11: Voicemail processing invariants**
    - **Validates: Requirements 5.1, 5.3, 5.4**
  - [ ]* 11.3 Write property test for transcription failure still storing audio and notifying
    - **Property 12: Transcription failure still stores audio and notifies**
    - **Validates: Requirements 5.5**
  - [ ]* 11.4 Write property test for all media files having a Telnyx Object Storage key
    - **Property 28: All media files have a Telnyx Object Storage key**
    - **Validates: Requirements 5.3, 14.4**

- [x] 12. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement `log-service` Lambda
  - [x] 13.1 Implement write and query handlers for call and SMS logs in DynamoDB
    - Write log entries with all required fields (timestamp, callerId/sender, direction, duration/status, disposition) and TTL set to at least 90 days from creation
    - Implement filter query logic for date range, numberId, callerId/sender, disposition/status
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ]* 13.2 Write property test for log entries containing all required fields
    - **Property 16: Log entries contain all required fields**
    - **Validates: Requirements 8.1, 8.2**
  - [ ]* 13.3 Write property test for log filtering returning only matching entries
    - **Property 17: Log filtering returns only matching entries**
    - **Validates: Requirements 8.3, 8.4**
  - [ ]* 13.4 Write property test for log TTL enforcing 90-day minimum retention
    - **Property 18: Log TTL enforces 90-day minimum retention**
    - **Validates: Requirements 8.5**

- [x] 14. Implement `retention-job` Lambda
  - [x] 14.1 Implement the EventBridge-scheduled daily Lambda that scans Aurora for voicemails and SMS messages past their retention window, deletes objects from Telnyx Object Storage, and sets `deleted_at` on the DB records
    - Apply retention policy independently to voicemails and SMS messages per parked number
    - Job must be idempotent on item IDs; log warning if object not found in storage (still mark deleted)
    - _Requirements: 6.2, 6.3, 6.4_
  - [ ]* 14.2 Write property test for retention job deleting only expired items
    - **Property 14: Retention job deletes only expired items**
    - **Validates: Requirements 6.2, 6.3, 6.4**

- [x] 15. Implement `download-service` Lambda
  - [x] 15.1 Implement `GET /download/voicemail/:id` and `GET /download/sms/:numberId` handlers
    - Verify item exists and `deleted_at` is null; return 404 if deleted
    - Generate a 15-minute pre-signed URL from Telnyx Object Storage for voicemail audio
    - Generate a CSV/JSON export of SMS history and return a pre-signed URL
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [ ]* 15.2 Write property test for download URL being time-limited and only for existing items
    - **Property 15: Download URL is time-limited and only for existing items**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 16. Implement `billing-service` Lambda
  - [x] 16.1 Implement billing routes: `POST /billing/session`, `POST /billing/subscriptions`, `PUT /billing/subscriptions/:id`, `DELETE /billing/subscriptions/:id`, `POST /billing/subscriptions/:id/reactivate`, `GET /billing/invoices`
    - Read Adyen API key from SSM Parameter Store at cold start
    - Create Adyen payment session and return `{ sessionId, sessionData }` to frontend
    - Implement full subscription lifecycle (create, update, cancel, reactivate) in Aurora
    - _Requirements: 19.1, 19.2, 19.3, 19.5, 19.6, 19.7, 19.8_
  - [x] 16.2 Implement Adyen webhook handler (`POST /webhooks/adyen`)
    - Validate HMAC signature before any processing; return 401 on invalid signature
    - Handle `AUTHORISATION`, `CANCELLATION`, `REFUND`, `CHARGEBACK` events; update `invoices` and `subscriptions` in Aurora
    - On `CHARGEBACK`: set subscription to `past_due`, send email notification via SES
    - On payment decline: set subscription to `past_due`, notify user by email
    - _Requirements: 19.4, 19.9, 19.10_
  - [ ]* 16.3 Write property test for Adyen webhook HMAC validation
    - **Property 34: Adyen webhook HMAC validation**
    - **Validates: Requirements 19.9**
  - [ ]* 16.4 Write property test for subscription lifecycle state transitions
    - **Property 35: Subscription lifecycle state transitions**
    - **Validates: Requirements 19.6, 19.10**

- [x] 17. Implement `admin-service` Lambda
  - [x] 17.1 Implement all admin routes (user management, package CRUD, feature flag defaults, audit log)
    - Enforce Cognito "admin" group claim check at handler entry; return 403 for non-admin JWTs
    - Implement user enable/disable (update Cognito user status + suspend services)
    - Implement package CRUD with deletion guard (409 if active subscribers exist)
    - Write `admin_audit_log` entry for every write operation
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 17.1, 17.2, 17.5, 17.7_
  - [x] 17.2 Implement public packages endpoint `GET /packages/public` (unauthenticated)
    - Return only `publicly_visible = true` packages ordered by `sort_order`
    - _Requirements: 17.8, 18.3_
  - [x] 17.3 Write property test for admin group enforcement
    - **Property 29: Admin group enforcement**
    - **Validates: Requirements 15.2**
  - [ ]* 17.4 Write property test for user account enable/disable round-trip
    - **Property 30: User account enable/disable round-trip**
    - **Validates: Requirements 15.5, 15.6**
  - [ ]* 17.5 Write property test for package round-trip and public visibility ordering
    - **Property 33: Package round-trip and public visibility ordering**
    - **Validates: Requirements 17.2, 17.3, 17.8**

- [x] 18. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 19. Implement React web application (`apps/web`)
  - [x] 19.1 Scaffold the React app with routing, Amplify Libraries configuration, and Cognito auth flows (sign-up, sign-in, sign-out, token refresh)
    - Import shared config from `packages/shared/src/amplify-config.ts`
    - _Requirements: 13.1, 13.4, 13.5_
  - [x] 19.2 Implement authenticated pages: dashboard (parked numbers list), number detail (forwarding, retention, greeting, caller rules, block list), voicemail list/detail, SMS log, call log, download buttons, spam log, add-ons management
    - Use `packages/ui-components` for shared UI primitives
    - _Requirements: 2.3, 3.3, 4.2, 4.3, 5.2, 6.5, 7.1, 7.2, 8.3, 8.4, 9.5, 12.1, 12.3, 12.5_
  - [x] 19.3 Integrate Adyen Drop-in UI component for subscription and plan-change flows
    - Call `POST /billing/session`, initialise Drop-in with session data; never transmit raw card data to KeepNum servers
    - _Requirements: 19.2, 19.3_
  - [x] 19.4 Write property test for JWT token validity being platform-independent
    - **Property 27: JWT token validity is platform-independent**
    - **Validates: Requirements 13.5**

- [x] 20. Implement sales landing page (`apps/sales`)
  - [x] 20.1 Scaffold the standalone React app with sections: Hero, Features Overview, Pricing Table, Testimonials placeholder, CTA/Sign-up
    - Pricing Table fetches from `GET /packages/public` via SWR; render `PricingFallback` on error
    - Mobile-responsive layout (CSS Grid, media queries, 320px–1920px)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8_

- [x] 21. Implement admin web application (`apps/admin`)
  - [x] 21.1 Scaffold the React admin app with Cognito auth (admin group required) and admin API integration
    - Pages: user list/search, user detail (usage metrics, billing history, feature flag overrides, package assignment), package management, system feature flag defaults, audit log viewer
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.7, 15.8, 15.9, 15.10, 16.10, 17.1_

- [x] 22. Implement React Native iOS app (`apps/ios`)
  - [x] 22.1 Scaffold the React Native app with `@aws-amplify/react-native` adapter, shared Amplify config, and navigation
    - Reuse `packages/shared` API client and auth helpers; reuse `packages/ui-components` primitives
    - Implement the same authenticated feature set as the web app (number management, voicemail, SMS, logs, downloads, add-ons, billing)
    - _Requirements: 13.2, 13.4, 13.5_

- [x] 23. Implement React Native Android app (`apps/android`)
  - [x] 23.1 Scaffold the React Native Android app mirroring the iOS app structure
    - Same shared packages, same API surface, same feature set
    - _Requirements: 13.2, 13.4, 13.5_

- [x] 24. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 25. Implement Terraform infrastructure modules
  - [x] 25.1 Create `infra/modules/cognito` — User Pool, App Client (no client secret), password policy, admin group
    - _Requirements: 1.1, 1.5, 13.4, 15.2_
  - [x] 25.2 Create `infra/modules/aurora` — Aurora Serverless v2 Postgres cluster, subnet group, security group (inbound 5432 from Lambda SG only), automated backups
    - _Requirements: 14.3_
  - [x] 25.3 Create `infra/modules/dynamodb` — `call_logs`, `sms_logs`, `spam_log` tables with TTL enabled and PAY_PER_REQUEST billing
    - _Requirements: 14.3_
  - [x] 25.4 Create `infra/modules/waf` — WebACL with `AWSManagedRulesCommonRuleSet`, `AWSManagedRulesKnownBadInputsRuleSet`, rate limiting rule, Adyen IP allowlist rule
    - _Requirements: 1.5, 13.3, 14.5_
  - [x] 25.5 Create `infra/modules/lambda` — all 12 Lambda functions with least-privilege IAM roles, SSM references for Telnyx and Adyen keys, VPC config for Aurora-accessing functions
    - _Requirements: 14.1, 19.8_
  - [x] 25.6 Create `infra/modules/api-gateway` — REST API with all routes, Cognito authorizer, WAF association, request model validation
    - _Requirements: 14.2, 14.5_
  - [x] 25.7 Create `infra/modules/amplify` — three Amplify Hosting apps (web, admin, sales) with WAF association and build specs
    - _Requirements: 13.1, 15.1, 18.7, 18.8_
  - [x] 25.8 Create `infra/modules/eventbridge` — daily scheduled rule targeting `retention-job` Lambda
    - _Requirements: 6.2_
  - [x] 25.9 Create `infra/environments/dev/` and `infra/environments/prod/` with per-environment variable files and `infra/backend.tf` with S3 remote state and DynamoDB locking
    - _Requirements: 14.1_

- [x] 26. Wire everything together and final integration
  - [x] 26.1 Ensure all Lambda functions import `resolveFlag` from `packages/shared` and gate every feature-flagged operation before executing business logic
    - _Requirements: 16.1, 16.9_
  - [x] 26.2 Verify all Telnyx webhook routes (`/webhooks/telnyx/call`, `/webhooks/telnyx/sms`, `/webhooks/telnyx/voicemail`) and Adyen webhook route (`/webhooks/adyen`) are registered in API Gateway and WAF-allowlisted
    - _Requirements: 14.2, 19.9_
  - [x] 26.3 Confirm `packages/shared` is correctly imported by all five apps (web, admin, sales, ios, android) and all Lambda functions; verify no circular dependencies
    - _Requirements: 13.2_
  - [ ]* 26.4 Write integration tests for end-to-end webhook flows (Telnyx call → log entry, Adyen AUTHORISATION → subscription active, retention job → correct items deleted)
    - _Requirements: 8.1, 19.4, 6.2_

- [x] 27. Final checkpoint — Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per property
- Each property test file must include the comment tag: `// Feature: keepnum-app, Property N: <property_text>`
- Telnyx API calls must use retry logic with exponential backoff (3 retries, max 8s delay)
- Adyen API key and HMAC key must be read from SSM Parameter Store — never hardcoded
- All phone number fields must be validated as E.164 format at the API Gateway request model level
