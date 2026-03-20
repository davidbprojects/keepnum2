0p--0iuyjh# Implementation Plan: API Testing and Documentation

## Overview

Build comprehensive test coverage for all 12 Lambda handlers using Jest + fast-check, then create an OpenAPI 3.0 specification and Swagger UI page. Tasks are ordered so that shared test infrastructure is built first, then each service gets its own test file with unit and property-based tests, followed by documentation artifacts.

## Tasks

- [x] 1. Set up test infrastructure and shared helpers
  - [x] 1.1 Add `fast-check` and `@types/jest` as devDependencies to each Lambda's `package.json` and ensure Jest + ts-jest config is present
    - Add `"fast-check": "^3.15.0"` and `"@types/jest": "^29.0.0"` to devDependencies in all 12 Lambda `package.json` files
    - Verify each Lambda has `"test": "jest --passWithNoTests"` script and ts-jest config
    - _Requirements: 13.1, 13.2, 13.4_
  - [x] 1.2 Create shared test helper utilities in `packages/shared/src/__tests__/helpers/`
    - Create `mockEvent.ts` with `buildMockEvent(options: MockEventOptions): APIGatewayProxyEvent` builder
    - Create `mockDb.ts` with `createMockPool()`, `mockQueryResult()`, and `createMockClient()` factories
    - Create `mockFetch.ts` with `mockFetchResponse()` and `mockFetchSequence()` for global fetch mocking
    - _Requirements: 13.2, 13.3_

- [x] 2. Implement auth-service tests
  - [x] 2.1 Create `apps/lambdas/auth-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-cognito-identity-provider, @aws-sdk/client-ssm, global.fetch
    - Test POST /auth/register (201 success, 400 missing fields)
    - Test POST /auth/login (200 success with tokens, 401 invalid credentials)
    - Test POST /auth/refresh (200 success with new accessToken)
    - Test DELETE /auth/account (200 success with Telnyx release + Cognito disable, 401 without auth)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  - [x] 2.2 Write property test for invalid auth payload rejection
    - **Property 1: Invalid auth payloads are rejected**
    - Use fast-check to generate payloads missing email, password, or both; assert handler returns 400 and Cognito is not called
    - **Validates: Requirements 1.3**
  - [x] 2.3 Write property test for login error indistinguishability
    - **Property 2: Login error indistinguishability**
    - Use fast-check to generate combinations of wrong email/password; assert error response body is identical regardless of which field is wrong
    - **Validates: Requirements 1.5**

- [x] 3. Implement number-service tests
  - [x] 3.1 Create `apps/lambdas/number-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm, global.fetch (Telnyx API)
    - Test all 12 routes: GET /numbers/search, POST /numbers, GET /numbers, DELETE /numbers/:id, PUT forwarding-rule, PUT retention, PUT greeting, POST caller-rules, DELETE caller-rules/:ruleId, POST blocklist, DELETE blocklist/:callerId
    - Test Telnyx API unavailable returns 503 for number search
    - Test provisioning rollback on Telnyx failure
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [ ]* 3.2 Write property test for forwarding rule upsert invariant
    - **Property 3: Forwarding rule upsert invariant**
    - Use fast-check to generate N forwarding rule updates; assert exactly one active rule with the last destination
    - **Validates: Requirements 2.6**

- [x] 4. Implement call-service tests
  - [x] 4.1 Create `apps/lambdas/call-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm, @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb, global.fetch, @keepnum/shared, @keepnum/call-screening-service
    - Test blocked caller → hangup, spam caller → blocked with score, per-caller rule actions, call screening routing, forwarding rule transfer, no forwarding → voicemail, duplicate call_leg_id → "Already processed", non-call.initiated → "Event acknowledged"
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_
  - [ ]* 4.2 Write property test for caller rule action mapping
    - **Property 4: Caller rule action mapping**
    - Use fast-check to generate caller rule action types from {voicemail, disconnect, forward, custom_greeting}; assert routing decision matches action
    - **Validates: Requirements 3.4**
  - [ ]* 4.3 Write property test for call idempotency
    - **Property 5: Call idempotency**
    - Use fast-check to generate call_leg_ids; assert duplicate submissions return "Already processed" with no side effects
    - **Validates: Requirements 3.8**
  - [ ]* 4.4 Write property test for non-target webhook event acknowledgment (call-service)
    - **Property 6: Non-target webhook events are acknowledged**
    - Use fast-check to generate non-call.initiated event types; assert handler returns 200 with acknowledgment and no business logic
    - **Validates: Requirements 3.9**

- [x] 5. Implement sms-service tests
  - [x] 5.1 Create `apps/lambdas/sms-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm, @aws-sdk/client-ses, global.fetch, @keepnum/shared
    - Test spam filtering blocks message, SMS + email forwarding, MMS media storage, SMS forwarding failure handling, non-message.received acknowledgment
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [x] 5.2 Write property test for non-target webhook event acknowledgment (sms-service)
    - **Property 6: Non-target webhook events are acknowledged**
    - Use fast-check to generate non-message.received event types; assert handler returns 200 with acknowledgment
    - **Validates: Requirements 4.6**
  - [x] 5.3 Write property test for MMS media storage key scheme
    - **Property 7: MMS media storage key scheme**
    - Use fast-check to generate userId, parkedNumberId, messageId, filename; assert stored key matches `sms-media/{userId}/{parkedNumberId}/{messageId}/{filename}`
    - **Validates: Requirements 4.4**

- [x] 6. Checkpoint — Core webhook services tested
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement voicemail-service tests
  - [x] 7.1 Create `apps/lambdas/voicemail-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm, @aws-sdk/client-ses, global.fetch
    - Test recording.completed webhook (audio storage, Aurora record, transcription trigger), transcription failure handling, transcription completion (success + failure), GET /voicemails ownership filter, GET /voicemails/:id
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ]* 7.2 Write property test for voicemail listing ownership and deletion filter
    - **Property 8: Voicemail listing ownership and deletion filter**
    - Use fast-check to generate voicemail sets with mixed owners and deleted_at values; assert response contains only caller's non-deleted voicemails
    - **Validates: Requirements 5.6**

- [x] 8. Implement billing-service tests
  - [x] 8.1 Create `apps/lambdas/billing-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm, @aws-sdk/client-ses, global.fetch (Adyen API), crypto
    - Test POST /webhooks/adyen: invalid HMAC → 401, AUTHORISATION success/failure, CHARGEBACK, REFUND
    - Test POST /billing/session, POST/PUT/DELETE /billing/subscriptions, POST reactivate, GET /billing/invoices
    - Test duplicate subscription → 409, invalid reactivation → 400
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ]* 8.2 Write property test for invalid HMAC rejection
    - **Property 9: Invalid HMAC rejects Adyen webhook**
    - Use fast-check to generate payloads with non-matching HMAC keys; assert handler returns 401 with no DB updates or emails
    - **Validates: Requirements 6.2**
  - [ ]* 8.3 Write property test for non-reactivatable subscription status
    - **Property 10: Non-reactivatable subscription status**
    - Use fast-check to generate subscription statuses not in {cancelled, past_due}; assert reactivation returns 400
    - **Validates: Requirements 7.5**

- [x] 9. Implement admin-service tests
  - [x] 9.1 Create `apps/lambdas/admin-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm, @aws-sdk/client-cognito-identity-provider
    - Test all 15 admin routes + GET /packages/public
    - Test non-admin user → 403, delete package with active subscribers → 409, audit log creation on writes, public packages filter
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ]* 9.2 Write property test for admin route authorization
    - **Property 11: Admin route authorization**
    - Use fast-check to generate requests without admin group; assert all admin routes return 403
    - **Validates: Requirements 8.2**
  - [ ]* 9.3 Write property test for admin write audit logging
    - **Property 12: Admin write operations create audit log entries**
    - Use fast-check to generate admin write operations; assert audit log row with correct admin_sub, action, target_type, target_id, and non-null payload
    - **Validates: Requirements 8.4**
  - [ ]* 9.4 Write property test for public packages filter and sort
    - **Property 13: Public packages filter and sort**
    - Use fast-check to generate package sets with mixed visibility/deletion; assert only visible non-deleted packages returned in sort_order
    - **Validates: Requirements 8.5**

- [x] 10. Implement remaining service tests
  - [x] 10.1 Create `apps/lambdas/log-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm
    - Test GET /logs/calls and GET /logs/sms with filter combinations (date range, numberId, callerId/sender, disposition/status)
    - _Requirements: 9.1_
  - [x] 10.2 Create `apps/lambdas/download-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm, global.fetch
    - Test GET /download/voicemail/:id and GET /download/sms/:numberId for pre-signed URL generation and 404 for deleted items
    - _Requirements: 9.2_
  - [x] 10.3 Create `apps/lambdas/spam-filter-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm, @keepnum/shared
    - Test GET /spam-log and PUT /spam-log/:itemId/false-positive for spam evaluation and allow-list creation
    - _Requirements: 9.3_
  - [x] 10.4 Create `apps/lambdas/call-screening-service/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm, global.fetch
    - Test screening state machine: prompt, record, timeout, playback, DTMF gather, accept/reject
    - _Requirements: 9.4_
  - [x] 10.5 Create `apps/lambdas/retention-job/src/__tests__/index.test.ts` with unit tests
    - Mock pg, @aws-sdk/client-ssm, global.fetch
    - Test that only items past retention window are marked deleted, Telnyx Object Storage objects removed, "forever" policy items untouched
    - _Requirements: 9.5_
  - [ ]* 10.6 Write property test for retention job expired-only deletion
    - **Property 14: Retention job deletes only expired items**
    - Use fast-check to generate items with various received_at dates and retention policies; assert only expired items are deleted
    - **Validates: Requirements 9.5**

- [x] 11. Implement Telnyx retry and edge case tests
  - [x] 11.1 Add retry and edge case tests to call-service and sms-service test files
    - Test exponential backoff: 3 retries with delays capped at 8s
    - Test 429 response triggers retry
    - Test non-429 4xx response does not retry
    - Test missing webhook fields (call_control_id, from, to) return 400
    - Test voicemail webhook for non-parked number returns 200 "Number not parked"
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [ ]* 11.2 Write property test for exponential backoff retry
    - **Property 15: Exponential backoff retry with bounded attempts**
    - Use fast-check to generate sequences of transient failures; assert retry count ≤ 3 and delays follow exponential pattern capped at 8s
    - **Validates: Requirements 10.1**
  - [ ]* 11.3 Write property test for non-429 client errors not retried
    - **Property 16: Non-429 client errors are not retried**
    - Use fast-check to generate 4xx status codes excluding 429; assert no retry occurs
    - **Validates: Requirements 10.3**
  - [ ]* 11.4 Write property test for missing webhook field rejection
    - **Property 17: Missing webhook fields are rejected**
    - Use fast-check to generate webhook payloads with missing required fields; assert handler returns 400
    - **Validates: Requirements 10.4**

- [x] 12. Checkpoint — All Lambda tests complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Create OpenAPI 3.0 specification
  - [x] 13.1 Create `docs/openapi.yaml` with full API specification
    - Define OpenAPI 3.0.3 document with info, servers, securitySchemes (bearerAuth)
    - Define all component schemas matching TypeScript types in packages/shared/src/types
    - Define reusable error responses (400, 401, 403, 404, 409, 500, 502, 503)
    - Document all 42+ routes grouped by tags: Auth, Numbers, Voicemails, Logs, Downloads, Billing, Admin, Public, Webhooks
    - Include request body schemas, response schemas, and example payloads for each route
    - Mark webhook routes as unauthenticated with WAF-allowlisting/HMAC description
    - Ensure round-trip completeness with API Gateway Terraform routes
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_
  - [ ]* 13.2 Write property test for OpenAPI route completeness
    - **Property 18: OpenAPI route completeness**
    - Parse the API Gateway Terraform routes and the OpenAPI YAML; assert every Terraform route has a matching path+method in the spec
    - **Validates: Requirements 11.2, 11.8**

- [x] 14. Create Swagger UI documentation page
  - [x] 14.1 Create `docs/index.html` with Swagger UI loading OpenAPI spec
    - Use CDN-hosted swagger-ui-dist@5 (CSS + JS bundle)
    - Configure SwaggerUIBundle to load `./openapi.yaml`
    - Ensure routes are grouped by tag with expandable operation details
    - Display request parameters, schemas, response schemas, and examples
    - Indicate Bearer token auth vs public/webhook routes
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 15. Final checkpoint — All tests pass and documentation complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per property
- Checkpoints at tasks 6, 12, and 15 ensure incremental validation
- All test files follow the `src/__tests__/index.test.ts` convention within each Lambda directory
