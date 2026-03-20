# Requirements Document

## Introduction

KeepNum is a cross-platform application (web, iOS, Android) that provides phone number management, call parking, voicemail transcription, SMS forwarding, spam/call screening, and number search services. It is powered by Telnyx for telephony, AWS for infrastructure (Lambda, Aurora Serverless Postgres, DynamoDB, Cognito, Amplify, API Gateway, WAF), and React for the frontend. All frontend and backend functionality is exposed through a unified API layer.

## Glossary

- **System**: The KeepNum application as a whole
- **User**: An authenticated account holder
- **Parked_Number**: A phone number owned and stored under a User account
- **Call_Parking_Service**: The subsystem responsible for storing, managing, and routing phone numbers
- **Forwarding_Rule**: A configuration that routes inbound calls or SMS from a Parked_Number to a destination
- **Voicemail_Transcription_Service**: The subsystem that converts voicemail audio to text
- **SMS_Forwarding_Service**: The subsystem that forwards inbound SMS to a User-defined destination
- **Spam_Filter_Service**: The paid add-on subsystem that detects and blocks spam calls and SMS
- **Call_Screening_Service**: The paid add-on subsystem that screens inbound calls before connecting
- **Number_Search_Service**: The subsystem that queries Telnyx for available phone numbers
- **Log_Service**: The subsystem that records call and SMS activity
- **Storage_Service**: Telnyx Object Storage used for voicemail audio and SMS media
- **Auth_Service**: AWS Cognito used for user authentication and authorization
- **Retention_Policy**: A User-configured period (30 days, 60 days, 90 days, or forever) for retaining voicemails and SMS
- **Telnyx**: The third-party telephony provider used for number provisioning, call routing, and messaging
- **WAF**: AWS Web Application Firewall protecting all public endpoints

---

## Requirements

### Requirement 1: User Authentication and Account Management

**User Story:** As a visitor, I want to register and log in securely, so that I can manage my phone numbers and services.

#### Acceptance Criteria

1. THE Auth_Service SHALL register new Users using AWS Cognito with email and password.
2. WHEN a User submits valid credentials, THE Auth_Service SHALL issue a JWT access token and refresh token.
3. IF a User submits invalid credentials, THEN THE Auth_Service SHALL return an authentication error without revealing which field is incorrect.
4. WHEN a JWT access token expires, THE Auth_Service SHALL allow the User to obtain a new access token using a valid refresh token.
5. THE System SHALL enforce WAF rules on all authentication endpoints.
6. WHEN a User requests account deletion, THE System SHALL deactivate all Parked_Numbers and delete User data within 30 days.

---

### Requirement 2: Phone Number Parking

**User Story:** As a User, I want to park and store phone numbers in my account, so that I can retain and manage them without active use.

#### Acceptance Criteria

1. THE Call_Parking_Service SHALL allow a User to park one or more phone numbers under a single account.
2. WHEN a User parks a number, THE Call_Parking_Service SHALL provision the number via the Telnyx API and associate it with the User account.
3. THE Call_Parking_Service SHALL display all Parked_Numbers for the authenticated User.
4. WHEN a User removes a Parked_Number, THE Call_Parking_Service SHALL release the number via the Telnyx API and remove it from the User account.
5. THE Call_Parking_Service SHALL be available as a paid add-on service with subscription billing.
6. IF the Telnyx API returns an error during provisioning, THEN THE Call_Parking_Service SHALL return a descriptive error message to the User and not charge the User for the failed number.

---

### Requirement 3: Call Forwarding

**User Story:** As a User, I want to forward calls from my parked numbers to another phone number, so that I never miss important calls.

#### Acceptance Criteria

1. THE Call_Parking_Service SHALL allow a User to configure a Forwarding_Rule that routes inbound calls from a Parked_Number to a User-specified destination number.
2. WHEN an inbound call arrives on a Parked_Number with an active Forwarding_Rule, THE Call_Parking_Service SHALL forward the call to the configured destination via Telnyx.
3. THE Call_Parking_Service SHALL allow a User to enable, disable, or delete a Forwarding_Rule at any time.
4. IF a forwarded call cannot be connected, THEN THE Call_Parking_Service SHALL route the call to voicemail.
5. THE Call_Parking_Service SHALL support one active Forwarding_Rule per Parked_Number at a time.

---

### Requirement 4: SMS Forwarding

**User Story:** As a User, I want inbound SMS messages on my parked numbers forwarded to me, so that I can receive messages without actively monitoring each number.

#### Acceptance Criteria

1. WHEN an inbound SMS arrives on a Parked_Number, THE SMS_Forwarding_Service SHALL forward the message content to the User's configured destination.
2. THE SMS_Forwarding_Service SHALL support forwarding to a User-specified phone number via SMS.
3. THE SMS_Forwarding_Service SHALL support forwarding to a User-specified email address.
4. THE SMS_Forwarding_Service SHALL allow a User to configure both SMS and email forwarding simultaneously for a single Parked_Number.
5. IF the SMS forwarding destination is unreachable, THEN THE SMS_Forwarding_Service SHALL log the failure and store the original message for User retrieval.

---

### Requirement 5: Voicemail Transcription and Delivery

**User Story:** As a User, I want voicemails transcribed to text and emailed to me, so that I can read messages without listening to audio.

#### Acceptance Criteria

1. WHEN a voicemail is recorded on a Parked_Number, THE Voicemail_Transcription_Service SHALL transcribe the audio to text using Telnyx transcription capabilities.
2. WHEN transcription is complete, THE Voicemail_Transcription_Service SHALL send the transcribed text to the User's registered email address.
3. THE Storage_Service SHALL store voicemail audio files in Telnyx Object Storage.
4. THE Voicemail_Transcription_Service SHALL associate each voicemail with the Parked_Number and timestamp it was received.
5. IF transcription fails, THEN THE Voicemail_Transcription_Service SHALL notify the User by email that a voicemail was received and that transcription is unavailable, and SHALL still store the audio file.

---

### Requirement 6: Retention Policy

**User Story:** As a User, I want to configure how long my voicemails and SMS messages are stored, so that I can manage storage and privacy.

#### Acceptance Criteria

1. THE System SHALL allow a User to set a Retention_Policy per Parked_Number with options of 30 days, 60 days, 90 days, or forever.
2. WHEN a voicemail or SMS message exceeds the configured Retention_Policy duration, THE Storage_Service SHALL permanently delete the item.
3. THE System SHALL apply the Retention_Policy independently to voicemails and SMS messages.
4. WHEN a User changes the Retention_Policy, THE System SHALL apply the new policy to all future items and SHALL apply it to existing items within 24 hours.
5. THE System SHALL display the current Retention_Policy setting to the User for each Parked_Number.

---

### Requirement 7: Download of Voicemails and SMS

**User Story:** As a User, I want to download my voicemails and SMS messages through the app, so that I can keep local copies.

#### Acceptance Criteria

1. THE System SHALL allow a User to download voicemail audio files from the application.
2. THE System SHALL allow a User to download SMS message history as a structured file (e.g., CSV or JSON).
3. WHEN a User requests a download, THE System SHALL generate a time-limited, authenticated download URL from Telnyx Object Storage.
4. IF a requested voicemail or SMS item has been deleted per the Retention_Policy, THEN THE System SHALL return a not-found error to the User.

---

### Requirement 8: Call and SMS Logs

**User Story:** As a User, I want detailed logs of all calls and SMS activity on my parked numbers, so that I can review communication history.

#### Acceptance Criteria

1. THE Log_Service SHALL record every inbound and outbound call event for each Parked_Number, including timestamp, caller ID, duration, and call disposition.
2. THE Log_Service SHALL record every inbound and outbound SMS event for each Parked_Number, including timestamp, sender, recipient, and message status.
3. THE System SHALL allow a User to filter call logs by date range, Parked_Number, caller ID, and call disposition.
4. THE System SHALL allow a User to filter SMS logs by date range, Parked_Number, sender, and message status.
5. THE Log_Service SHALL retain call and SMS log entries for a minimum of 90 days regardless of the Retention_Policy applied to voicemail and SMS content.

---

### Requirement 9: Spam Filtering (Paid Add-On)

**User Story:** As a User, I want spam calls and SMS blocked automatically, so that I am not disturbed by unwanted communications.

#### Acceptance Criteria

1. WHERE the Spam_Filter_Service add-on is enabled, THE Spam_Filter_Service SHALL evaluate each inbound call against Telnyx spam detection data before routing.
2. WHERE the Spam_Filter_Service add-on is enabled, WHEN an inbound call is identified as spam, THE Spam_Filter_Service SHALL block the call and log the event.
3. WHERE the Spam_Filter_Service add-on is enabled, THE Spam_Filter_Service SHALL evaluate each inbound SMS against Telnyx spam detection data before delivery.
4. WHERE the Spam_Filter_Service add-on is enabled, WHEN an inbound SMS is identified as spam, THE Spam_Filter_Service SHALL discard the message and log the event.
5. THE System SHALL allow a User to review the spam log and mark items as false positives.
6. WHERE the Spam_Filter_Service add-on is enabled, WHEN a User marks a blocked item as a false positive, THE Spam_Filter_Service SHALL deliver the item and update the User's allow list.

---

### Requirement 10: Call Screening (Paid Add-On)

**User Story:** As a User, I want inbound calls screened before they connect to me, so that I can decide whether to answer unknown callers.

#### Acceptance Criteria

1. WHERE the Call_Screening_Service add-on is enabled, WHEN an inbound call arrives on a Parked_Number, THE Call_Screening_Service SHALL prompt the caller to state their name before connecting.
2. WHERE the Call_Screening_Service add-on is enabled, THE Call_Screening_Service SHALL play the caller's recorded name to the User before the call is connected.
3. WHERE the Call_Screening_Service add-on is enabled, THE Call_Screening_Service SHALL allow the User to accept or reject the call after hearing the caller's name.
4. WHERE the Call_Screening_Service add-on is enabled, WHEN a User rejects a screened call, THE Call_Screening_Service SHALL route the call to voicemail.
5. WHERE the Call_Screening_Service add-on is enabled, IF the caller does not provide a name within 10 seconds, THEN THE Call_Screening_Service SHALL route the call to voicemail.

---

### Requirement 11: Phone Number Search

**User Story:** As a User, I want to search and filter available phone numbers, so that I can find a number that suits my needs before purchasing.

#### Acceptance Criteria

1. THE Number_Search_Service SHALL query the Telnyx API for available phone numbers.
2. THE Number_Search_Service SHALL allow a User to filter available numbers by area code, region, country, number type (local, toll-free, mobile), and numeric pattern.
3. THE Number_Search_Service SHALL display search results including the phone number, number type, monthly cost, and availability status.
4. WHEN a User selects an available number, THE Number_Search_Service SHALL initiate the provisioning flow to add the number as a Parked_Number.
5. THE Number_Search_Service SHALL return search results within 5 seconds of a query submission.
6. IF the Telnyx API is unavailable during a search, THEN THE Number_Search_Service SHALL return a service-unavailable error and SHALL NOT display stale or cached number availability data.

---

### Requirement 12: YouMail-Style Call Management

**User Story:** As a User, I want advanced call management features similar to YouMail, so that I can control how different callers are handled.

#### Acceptance Criteria

1. THE Call_Parking_Service SHALL allow a User to configure per-caller rules that define custom handling (e.g., send to voicemail, play a disconnected message, forward to a number) based on caller ID.
2. WHEN an inbound call matches a per-caller rule, THE Call_Parking_Service SHALL apply the configured action for that caller.
3. THE Call_Parking_Service SHALL allow a User to maintain a personal block list of caller IDs that are automatically rejected.
4. WHEN a call arrives from a caller ID on the User's block list, THE Call_Parking_Service SHALL play a configurable message and disconnect the call.
5. THE Call_Parking_Service SHALL allow a User to configure a custom voicemail greeting per Parked_Number.
6. THE Call_Parking_Service SHALL allow a User to configure a "smart" voicemail greeting that plays a different message to known contacts versus unknown callers.

---

### Requirement 13: Cross-Platform Frontend

**User Story:** As a User, I want to access KeepNum on web, iOS, and Android, so that I can manage my numbers from any device.

#### Acceptance Criteria

1. THE System SHALL provide a React-based web application hosted on AWS Amplify.
2. THE System SHALL provide iOS and Android mobile applications that consume the same API as the web application.
3. THE System SHALL enforce WAF protection on all API Gateway and Amplify endpoints.
4. THE System SHALL use AWS Cognito for authentication across web, iOS, and Android clients.
5. WHILE a User is authenticated, THE System SHALL maintain session state consistently across all platforms using Cognito tokens.

---

### Requirement 14: Infrastructure and API

**User Story:** As a developer, I want a consistent, secure, and scalable backend, so that all clients receive reliable service.

#### Acceptance Criteria

1. THE System SHALL implement all backend logic as AWS Lambda functions.
2. THE System SHALL expose all backend functionality through AWS API Gateway endpoints.
3. THE System SHALL use Aurora Serverless Postgres for relational data (user accounts, Parked_Numbers, Forwarding_Rules, billing) and DynamoDB for high-throughput event data (call logs, SMS logs).
4. THE System SHALL store all media files (voicemail audio, SMS attachments) in Telnyx Object Storage.
5. THE System SHALL apply WAF rules to all API Gateway stages and Amplify distributions.
6. THE System SHALL use Telnyx APIs as the primary integration for all telephony operations before implementing custom logic.

---

### Requirement 15: Admin Panel

**User Story:** As an administrator, I want a dedicated admin web application, so that I can manage user accounts, monitor usage, and configure plans and feature flags across the platform.

#### Acceptance Criteria

1. THE System SHALL provide a separate React-based admin web application hosted on AWS Amplify and protected by AWS WAF.
2. THE System SHALL restrict access to the admin application to users who belong to the Cognito "admin" group; any request from a user not in the "admin" group SHALL be rejected with a 403 response.
3. THE Admin Panel SHALL allow an administrator to list, search, and view details for all user accounts, including email, registration date, account status, and current package.
4. THE Admin Panel SHALL display per-user usage metrics including number of parked numbers, voicemail count, SMS count, and enabled add-ons.
5. WHEN an administrator disables a user account, THE System SHALL prevent that user from authenticating and SHALL suspend all active services for that user.
6. WHEN an administrator re-enables a previously disabled user account, THE System SHALL restore the user's ability to authenticate and resume services.
7. THE Admin Panel SHALL allow an administrator to assign or change a user's package/plan, with the change taking effect at the next billing cycle or immediately depending on admin selection.
8. THE Admin Panel SHALL allow an administrator to set user-level feature flag overrides for any individual user, overriding both system-level defaults and package-level flags.
9. THE Admin Panel SHALL display billing history and payment status per user, including invoice records and subscription status.
10. THE System SHALL log all administrative actions (account enable/disable, plan changes, flag overrides) with the acting admin's identity and a timestamp.

---

### Requirement 16: Feature Flags System

**User Story:** As a platform operator, I want every feature controlled by a feature flag with a three-level priority chain, so that I can manage feature availability at the system, package, and individual user level.

#### Acceptance Criteria

1. THE System SHALL control every feature through a named feature flag; no feature logic SHALL execute without first evaluating the flag for the requesting user.
2. THE System SHALL evaluate feature flags using a three-level priority chain in the following order (highest priority first): (1) user-level override, (2) package-level flag, (3) system-level default.
3. WHEN a user-level override exists for a flag, THE System SHALL use that value regardless of the package-level or system-level values.
4. WHEN no user-level override exists but a package-level flag value exists, THE System SHALL use the package-level value.
5. WHEN neither a user-level override nor a package-level value exists, THE System SHALL use the system-level default value.
6. THE System SHALL support the following boolean feature flags: `call_parking`, `call_forwarding`, `sms_forwarding_sms`, `sms_forwarding_email`, `voicemail_transcription`, `voicemail_email_delivery`, `download_voicemails`, `download_sms`, `call_logs`, `sms_logs`, `spam_filtering`, `call_screening`, `number_search`, `youmail_caller_rules`, `youmail_block_list`, `youmail_custom_greetings`, `youmail_smart_greetings`.
7. THE System SHALL support the following retention availability flags: `retention_30d`, `retention_60d`, `retention_90d`, `retention_forever`, each controlling whether that retention option is selectable by the user.
8. THE System SHALL support the following numeric limit flags: `max_parked_numbers`, `max_sms_storage_mb`, `max_voicemail_storage_mb`.
9. WHEN a Lambda function is invoked for a feature-gated operation and the resolved flag value is disabled or the numeric limit is exceeded for the requesting user, THE System SHALL return a 403 response with a descriptive message identifying the disabled feature.
10. THE System SHALL allow an administrator to update system-level default flag values through the Admin Panel.

---

### Requirement 17: Package / Plan Management

**User Story:** As an administrator, I want to create and manage subscription packages, so that I can offer different tiers of service with distinct feature sets and pricing.

#### Acceptance Criteria

1. THE System SHALL allow an administrator to create, edit, and delete packages via the Admin Panel.
2. EACH package SHALL have: a name, a description, a monthly base price in cents, an optional per-number monthly price in cents, a set of feature flag values, numeric limit values (`max_parked_numbers`, `max_sms_storage_mb`, `max_voicemail_storage_mb`), a publicly-visible flag, and a sort order for display.
3. THE System SHALL store all package definitions in Aurora Postgres.
4. EACH user SHALL be subscribed to exactly one package at any given time.
5. WHEN an administrator changes a user's package, THE System SHALL record the effective date of the change; the change SHALL take effect at the next billing cycle unless the administrator selects immediate effect.
6. THE System SHALL provide at minimum the following default packages: Free (1 parked number, no paid add-ons), Basic (5 parked numbers, voicemail transcription), Pro (unlimited numbers, all features), Enterprise (custom pricing, all features, custom limits).
7. WHEN a package is deleted, THE System SHALL prevent deletion if any active users are subscribed to that package and SHALL return a descriptive error.
8. THE System SHALL expose a public API endpoint that returns all packages marked as publicly visible, ordered by sort order, for use by the sales landing page.

---

### Requirement 18: Sales Landing Page

**User Story:** As a prospective customer, I want to view a public marketing website with pricing information, so that I can understand KeepNum's features and sign up.

#### Acceptance Criteria

1. THE System SHALL provide a single-page marketing website that is publicly accessible without authentication.
2. THE Sales Landing Page SHALL include the following sections: hero, features overview, pricing table, testimonials placeholder, and a call-to-action / sign-up button.
3. THE Pricing Table section SHALL dynamically fetch and render all packages marked as publicly visible from the packages API, ordered by sort order.
4. WHEN the packages API is unavailable, THE Sales Landing Page SHALL display a fallback message in the pricing section rather than a broken UI.
5. THE Sales Landing Page SHALL link to the main application for user sign-up and login.
6. THE Sales Landing Page SHALL be mobile responsive and render correctly on viewports from 320px to 1920px wide.
7. THE Sales Landing Page SHALL be protected by AWS WAF.
8. THE Sales Landing Page SHALL be hosted as a separate AWS Amplify application or as a public route within the main Amplify application.

---

### Requirement 19: Adyen Payment Integration

**User Story:** As a user, I want to pay for my subscription using a secure payment flow, so that I can subscribe to and manage my KeepNum plan without leaving the application.

#### Acceptance Criteria

1. THE System SHALL use Adyen as the payment processor for all subscription billing.
2. THE Frontend SHALL integrate the Adyen Drop-in UI component for payment method collection; raw card data SHALL never be transmitted to or stored on KeepNum servers.
3. WHEN a user initiates a new subscription, THE billing-service Lambda SHALL create an Adyen payment session and return the session data to the frontend for Drop-in UI initialisation.
4. THE billing-service Lambda SHALL handle Adyen webhook events for the following payment event types: `AUTHORISATION`, `CANCELLATION`, `REFUND`, `CHARGEBACK`; each event SHALL update the corresponding subscription or invoice record in Aurora Postgres.
5. THE System SHALL store Adyen recurring payment tokens (shopper tokens) in Aurora Postgres; raw card numbers or CVVs SHALL never be stored.
6. THE billing-service Lambda SHALL support the full subscription lifecycle: create, update (plan change), cancel, and reactivate.
7. WHEN a billing cycle completes, THE billing-service Lambda SHALL generate an invoice record in Aurora Postgres containing: user ID, subscription ID, amount in cents, currency, billing period start and end, and payment status.
8. THE Adyen API key SHALL be stored in AWS SSM Parameter Store as a SecureString and injected into the billing-service Lambda at runtime; it SHALL NOT be hardcoded or stored in environment variable plaintext.
9. WHEN an Adyen webhook is received, THE System SHALL validate the webhook's HMAC signature before processing; invalid signatures SHALL be rejected with a 401 response.
10. IF a payment is declined, THE billing-service Lambda SHALL update the subscription status to `past_due` and notify the user by email.
