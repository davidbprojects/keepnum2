# Requirements Document

## Introduction

This feature adds comprehensive API testing and OpenAPI documentation to the KeepNum platform. It covers unit tests for all 12 Lambda handlers, integration tests for Telnyx and Adyen webhook flows, and a complete OpenAPI 3.0 specification served via Swagger UI so that API consumers can discover and interact with the KeepNum REST API.

## Glossary

- **Test_Suite**: The collection of Jest test files covering all Lambda handler functions and webhook flows
- **Lambda_Handler**: One of the 12 AWS Lambda functions that process API Gateway requests (auth-service, number-service, call-service, sms-service, voicemail-service, log-service, download-service, spam-filter-service, call-screening-service, retention-job, admin-service, billing-service)
- **Webhook_Test**: An integration test that simulates an inbound Telnyx or Adyen webhook payload and verifies the handler processes it correctly
- **OpenAPI_Spec**: An OpenAPI 3.0 YAML document describing all KeepNum REST API routes, request/response schemas, and authentication requirements
- **Swagger_UI**: A web-based interactive documentation page generated from the OpenAPI_Spec, allowing consumers to browse and try API endpoints
- **Telnyx_Webhook**: An HTTP POST sent by Telnyx to KeepNum API Gateway for call, SMS, or voicemail events
- **Adyen_Webhook**: An HTTP POST sent by Adyen to KeepNum API Gateway for payment lifecycle events (AUTHORISATION, CANCELLATION, REFUND, CHARGEBACK)
- **HMAC_Validation**: The process of verifying an Adyen webhook signature using a shared HMAC key before processing the payload
- **Handler_Mock**: A test double that replaces external dependencies (Cognito, Telnyx API, Adyen API, Aurora, DynamoDB, SES, SSM) so Lambda handlers can be tested in isolation

## Requirements

### Requirement 1: Auth Service Unit Tests

**User Story:** As a developer, I want unit tests for every auth-service route, so that I can verify registration, login, token refresh, and account deletion logic in isolation.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a test file for auth-service covering POST /auth/register, POST /auth/login, POST /auth/refresh, and DELETE /auth/account routes
2. WHEN a valid registration payload is provided, THE Test_Suite SHALL verify that the auth-service handler returns status 201 and calls Cognito SignUpCommand
3. WHEN an invalid registration payload is provided (missing email or password), THE Test_Suite SHALL verify that the auth-service handler returns status 400
4. WHEN valid login credentials are provided, THE Test_Suite SHALL verify that the auth-service handler returns status 200 with non-empty accessToken and refreshToken fields
5. WHEN invalid login credentials are provided, THE Test_Suite SHALL verify that the auth-service handler returns status 401 with a generic error message that does not reveal which field was incorrect
6. WHEN a valid refresh token is provided, THE Test_Suite SHALL verify that the auth-service handler returns status 200 with a non-empty accessToken
7. WHEN an authenticated DELETE /auth/account request is received, THE Test_Suite SHALL verify that the handler marks the user as deleted, releases all parked numbers via Telnyx, and disables the Cognito user
8. WHEN DELETE /auth/account is called without valid authorization claims, THE Test_Suite SHALL verify that the handler returns status 401

### Requirement 2: Number Service Unit Tests

**User Story:** As a developer, I want unit tests for every number-service route, so that I can verify number search, provisioning, listing, deletion, forwarding rules, retention, greetings, caller rules, and block list logic.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a test file for number-service covering all 12 routes: GET /numbers/search, POST /numbers, GET /numbers, DELETE /numbers/:id, PUT /numbers/:id/forwarding-rule, PUT /numbers/:id/retention, PUT /numbers/:id/greeting, POST /numbers/:id/caller-rules, DELETE /numbers/:id/caller-rules/:ruleId, POST /numbers/:id/blocklist, DELETE /numbers/:id/blocklist/:callerId
2. WHEN a number search request is made with valid filters, THE Test_Suite SHALL verify that the handler calls the Telnyx available_phone_numbers API and returns formatted results
3. WHEN the Telnyx API is unavailable during number search, THE Test_Suite SHALL verify that the handler returns status 503 and does not return stale data
4. WHEN a provisioning request succeeds at Telnyx, THE Test_Suite SHALL verify that the handler creates an Aurora record and returns status 201
5. WHEN a provisioning request fails at Telnyx, THE Test_Suite SHALL verify that the handler rolls back the Aurora transaction and returns an error status
6. WHEN a forwarding rule is set, THE Test_Suite SHALL verify that the handler upserts a single forwarding rule per parked number
7. WHEN a retention policy is set to a valid value, THE Test_Suite SHALL verify that the handler updates the parked number record and returns the new policy
8. WHEN a caller rule or block list entry is added, THE Test_Suite SHALL verify that the handler creates the record and returns status 201

### Requirement 3: Telnyx Call Webhook Tests

**User Story:** As a developer, I want thorough tests for the Telnyx call webhook handler, so that I can verify the complete call routing decision tree including block list, spam filter, caller rules, call screening, and forwarding.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a test file for call-service covering the POST /webhooks/telnyx/call route with the full routing decision tree
2. WHEN a call.initiated webhook is received for a blocked caller, THE Test_Suite SHALL verify that the handler returns disposition "blocked" and invokes the Telnyx hangup action
3. WHEN a call.initiated webhook is received and spam filtering is enabled and the caller is spam, THE Test_Suite SHALL verify that the handler returns disposition "blocked" with a spam score
4. WHEN a call.initiated webhook is received and a per-caller rule matches, THE Test_Suite SHALL verify that the handler applies the correct action (voicemail, disconnect, forward, or custom_greeting)
5. WHEN a call.initiated webhook is received and call screening is enabled, THE Test_Suite SHALL verify that the handler invokes the screenCall function and routes based on the screening result
6. WHEN a call.initiated webhook is received and a forwarding rule is active, THE Test_Suite SHALL verify that the handler invokes the Telnyx transfer action with the correct destination
7. WHEN a call.initiated webhook is received and no forwarding rule exists, THE Test_Suite SHALL verify that the handler returns disposition "voicemail"
8. WHEN a call.initiated webhook is received with a duplicate call_leg_id, THE Test_Suite SHALL verify that the handler returns "Already processed" and does not re-route the call
9. WHEN a non-call.initiated event type is received, THE Test_Suite SHALL verify that the handler returns status 200 with "Event acknowledged"

### Requirement 4: Telnyx SMS Webhook Tests

**User Story:** As a developer, I want thorough tests for the Telnyx SMS webhook handler, so that I can verify spam filtering, SMS and email forwarding, MMS media storage, and failure handling.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a test file for sms-service covering the POST /webhooks/telnyx/sms route
2. WHEN a message.received webhook is received and spam filtering blocks the message, THE Test_Suite SHALL verify that the handler writes a spam log entry and an SMS log with status "spam"
3. WHEN a message.received webhook is received and both SMS and email forwarding are enabled, THE Test_Suite SHALL verify that the handler invokes both the Telnyx SMS API and SES
4. WHEN a message.received webhook is received with MMS media attachments, THE Test_Suite SHALL verify that the handler downloads each media file and stores it in Telnyx Object Storage under the correct key scheme
5. WHEN SMS forwarding fails, THE Test_Suite SHALL verify that the handler stores the original message in the sms_messages Aurora table and writes an SMS log with status "failed"
6. WHEN a non-message.received event type is received, THE Test_Suite SHALL verify that the handler returns status 200 with "Event acknowledged"

### Requirement 5: Telnyx Voicemail Webhook Tests

**User Story:** As a developer, I want thorough tests for the Telnyx voicemail webhook handler, so that I can verify audio storage, transcription triggering, transcription completion handling, and failure paths.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a test file for voicemail-service covering the POST /webhooks/telnyx/voicemail route and the GET /voicemails and GET /voicemails/:id routes
2. WHEN a recording.completed webhook is received, THE Test_Suite SHALL verify that the handler fetches the audio, stores it in Telnyx Object Storage, creates a voicemails Aurora record, and triggers transcription
3. WHEN transcription triggering fails, THE Test_Suite SHALL verify that the handler sets transcription_status to "failed", stores the audio, and sends a failure notification email via SES
4. WHEN a recording.transcription.completed webhook is received with successful transcription, THE Test_Suite SHALL verify that the handler updates the voicemail record with the transcription text and sends a transcription email
5. WHEN a recording.transcription.completed webhook is received with failed transcription, THE Test_Suite SHALL verify that the handler sets transcription_status to "failed" and sends a failure notification email
6. WHEN GET /voicemails is called, THE Test_Suite SHALL verify that the handler returns only voicemails belonging to the authenticated user that have not been deleted

### Requirement 6: Adyen Webhook Tests

**User Story:** As a developer, I want thorough tests for the Adyen webhook handler, so that I can verify HMAC validation and correct processing of AUTHORISATION, CANCELLATION, REFUND, and CHARGEBACK events.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a test file for billing-service covering the POST /webhooks/adyen route
2. WHEN an Adyen webhook is received with an invalid HMAC signature, THE Test_Suite SHALL verify that the handler returns status 401 and does not process the payload
3. WHEN an Adyen webhook is received with a valid HMAC signature and AUTHORISATION success, THE Test_Suite SHALL verify that the handler sets the subscription to "active" and the invoice to "paid"
4. WHEN an Adyen webhook is received with a valid HMAC signature and AUTHORISATION failure, THE Test_Suite SHALL verify that the handler sets the subscription to "past_due" and sends a payment decline email
5. WHEN an Adyen webhook is received with a CHARGEBACK event, THE Test_Suite SHALL verify that the handler sets the invoice to "chargeback", the subscription to "past_due", and sends a chargeback notification email
6. WHEN an Adyen webhook is received with a REFUND event, THE Test_Suite SHALL verify that the handler sets the invoice to "refunded"

### Requirement 7: Billing Service Unit Tests

**User Story:** As a developer, I want unit tests for all billing-service routes, so that I can verify payment session creation, subscription lifecycle, and invoice listing.

#### Acceptance Criteria

1. THE Test_Suite SHALL include tests for POST /billing/session, POST /billing/subscriptions, PUT /billing/subscriptions/:id, DELETE /billing/subscriptions/:id, POST /billing/subscriptions/:id/reactivate, and GET /billing/invoices
2. WHEN a payment session is created, THE Test_Suite SHALL verify that the handler calls the Adyen sessions API and returns sessionId and sessionData
3. WHEN a subscription is created for a user who already has an active subscription, THE Test_Suite SHALL verify that the handler returns status 409
4. WHEN a cancelled subscription is reactivated, THE Test_Suite SHALL verify that the handler sets the status to "active" and resets the billing period
5. WHEN a subscription that is neither cancelled nor past_due is reactivated, THE Test_Suite SHALL verify that the handler returns status 400

### Requirement 8: Admin Service Unit Tests

**User Story:** As a developer, I want unit tests for all admin-service routes, so that I can verify user management, package CRUD, feature flag management, and audit logging.

#### Acceptance Criteria

1. THE Test_Suite SHALL include tests for all 15 admin-service routes plus the public GET /packages/public route
2. WHEN a non-admin user calls any admin route, THE Test_Suite SHALL verify that the handler returns status 403
3. WHEN an admin deletes a package that has active subscribers, THE Test_Suite SHALL verify that the handler returns status 409
4. WHEN an admin writes to any admin route, THE Test_Suite SHALL verify that the handler creates an admin_audit_log entry with the correct admin_sub, action, target_type, target_id, and payload
5. WHEN GET /packages/public is called without authentication, THE Test_Suite SHALL verify that the handler returns only packages where publicly_visible is true, ordered by sort_order

### Requirement 9: Remaining Service Unit Tests

**User Story:** As a developer, I want unit tests for log-service, download-service, spam-filter-service, call-screening-service, and retention-job, so that every Lambda handler has test coverage.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a test file for log-service covering GET /logs/calls and GET /logs/sms with filter combinations (date range, numberId, callerId/sender, disposition/status)
2. THE Test_Suite SHALL include a test file for download-service covering GET /download/voicemail/:id and GET /download/sms/:numberId, verifying pre-signed URL generation and 404 for deleted items
3. THE Test_Suite SHALL include a test file for spam-filter-service covering GET /spam-log and PUT /spam-log/:itemId/false-positive, verifying spam evaluation and allow-list creation
4. THE Test_Suite SHALL include a test file for call-screening-service verifying the screening state machine: prompt, record, timeout, playback, DTMF gather, accept/reject
5. THE Test_Suite SHALL include a test file for retention-job verifying that only items past their retention window are marked as deleted and that Telnyx Object Storage objects are removed

### Requirement 10: Telnyx Webhook Retry and Edge Case Tests

**User Story:** As a developer, I want tests that cover Telnyx webhook retry logic and edge cases, so that I can be confident the system handles real-world Telnyx behavior correctly.

#### Acceptance Criteria

1. THE Test_Suite SHALL include tests verifying that Telnyx API calls use exponential backoff with a maximum of 3 retries and a maximum delay of 8 seconds
2. WHEN a Telnyx API call receives a 429 (rate limited) response, THE Test_Suite SHALL verify that the handler retries the request
3. WHEN a Telnyx API call receives a 4xx response (other than 429), THE Test_Suite SHALL verify that the handler does not retry and returns an error
4. WHEN a Telnyx webhook payload is missing required fields (call_control_id, from, to for calls; from.phone_number, to for SMS), THE Test_Suite SHALL verify that the handler returns status 400
5. WHEN a Telnyx voicemail webhook is received for a phone number that is not parked, THE Test_Suite SHALL verify that the handler returns status 200 with "Number not parked"

### Requirement 11: OpenAPI 3.0 Specification

**User Story:** As an API consumer, I want a complete OpenAPI 3.0 specification for the KeepNum API, so that I can understand all available endpoints, request/response schemas, and authentication requirements.

#### Acceptance Criteria

1. THE OpenAPI_Spec SHALL be a valid OpenAPI 3.0 YAML document stored at docs/openapi.yaml in the repository
2. THE OpenAPI_Spec SHALL document all 42 API routes defined in the API Gateway module, grouped by tag (Auth, Numbers, Voicemails, Logs, Downloads, Billing, Admin, Public, Webhooks)
3. THE OpenAPI_Spec SHALL define request body schemas for all POST and PUT routes using JSON Schema, matching the TypeScript types in packages/shared/src/types
4. THE OpenAPI_Spec SHALL define response schemas for all routes, including success responses and error responses (400, 401, 403, 404, 409, 500, 502, 503)
5. THE OpenAPI_Spec SHALL declare a securityScheme of type "http" with scheme "bearer" (Cognito JWT) and apply it to all authenticated routes
6. THE OpenAPI_Spec SHALL mark webhook routes (POST /webhooks/telnyx/call, POST /webhooks/telnyx/sms, POST /webhooks/telnyx/voicemail, POST /webhooks/adyen) as unauthenticated with a description noting WAF-allowlisting or HMAC validation
7. THE OpenAPI_Spec SHALL include example request and response payloads for each route
8. FOR ALL routes defined in the API Gateway Terraform module, the OpenAPI_Spec SHALL contain a matching path and method entry (round-trip completeness)

### Requirement 12: Swagger UI Documentation Site

**User Story:** As an API consumer, I want an interactive Swagger UI page served from the repository, so that I can browse, understand, and try the KeepNum API.

#### Acceptance Criteria

1. THE Swagger_UI SHALL be a static HTML page at docs/index.html that loads the OpenAPI_Spec from docs/openapi.yaml
2. THE Swagger_UI SHALL use the swagger-ui-dist npm package or a CDN-hosted Swagger UI bundle
3. WHEN a user opens docs/index.html in a browser, THE Swagger_UI SHALL render all API routes grouped by tag with expandable operation details
4. THE Swagger_UI SHALL display request parameters, request body schemas, response schemas, and example values for each operation
5. THE Swagger_UI SHALL indicate which routes require Bearer token authentication and which are public or webhook-only

### Requirement 13: Test Infrastructure and Configuration

**User Story:** As a developer, I want a consistent test infrastructure across all Lambda services, so that tests are easy to write, run, and maintain.

#### Acceptance Criteria

1. THE Test_Suite SHALL use Jest as the test runner, consistent with the existing project configuration
2. THE Test_Suite SHALL mock all external dependencies (AWS SDK clients, Telnyx API, Adyen API, pg Pool, fetch) using Jest mock functions so that tests run without network access
3. THE Test_Suite SHALL place test files adjacent to source files using the naming convention src/__tests__/index.test.ts within each Lambda service directory
4. THE Test_Suite SHALL be runnable via the existing turbo run test command from the monorepo root
5. WHEN all tests pass, THE Test_Suite SHALL achieve a minimum of one test per route per Lambda handler

