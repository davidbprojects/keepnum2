# Requirements Document — YouMail Feature Parity

## Introduction

This specification covers 15 new features that bring KeepNum to feature parity with YouMail.com. These features extend the existing KeepNum platform (authentication, number parking, basic call/SMS forwarding, voicemail transcription, spam filtering, call screening, per-caller rules, block lists, custom greetings, admin panel, billing, and feature flags) with advanced voicemail management, virtual phone lines, IVR, auto-reply SMS, a unified inbox, privacy scanning, push notifications, a greetings marketplace, caller ID lookup, voicemail-to-text via SMS, contact-aware routing, DND scheduling, voicemail sharing, call recording, and conference bridging.

All new features integrate with the existing AWS + Telnyx + Adyen stack and are gated by the existing three-level feature flag system. No existing functionality is duplicated or redefined here.

## Glossary

- **System**: The KeepNum application as a whole
- **User**: An authenticated account holder
- **Parked_Number**: A phone number owned and stored under a User account (existing)
- **Virtual_Number**: An additional phone number provisioned for active use (calling, texting) that rings on the User's device, distinct from a Parked_Number
- **Voicemail_Inbox_Service**: The subsystem that manages visual voicemail folders, search, and bulk actions
- **Virtual_Number_Service**: The subsystem that provisions and manages Virtual_Numbers
- **IVR_Service**: The subsystem that provides auto-attendant / interactive voice response menus
- **Auto_Reply_Service**: The subsystem that sends automatic SMS replies to missed calls
- **Unified_Inbox_Service**: The subsystem that aggregates voicemails, missed calls, and SMS across all numbers into a single feed
- **Privacy_Scan_Service**: The subsystem that scans public databases for the User's phone number exposure
- **Push_Notification_Service**: The subsystem that delivers real-time push notifications to mobile devices
- **Greetings_Marketplace_Service**: The subsystem that manages the library of professional greetings
- **Caller_ID_Service**: The subsystem that performs reverse phone lookup and caller identification
- **Smart_Routing_Service**: The subsystem that applies contact-aware call routing logic
- **DND_Schedule_Service**: The subsystem that manages time-based Do Not Disturb rules
- **Voicemail_Sharing_Service**: The subsystem that generates shareable voicemail links
- **Call_Recording_Service**: The subsystem that records calls with consent
- **Conference_Service**: The subsystem that provides multi-party conference calling
- **Telnyx**: The third-party telephony provider (existing)
- **Storage_Service**: Telnyx Object Storage for media files (existing)
- **Feature_Flag**: A named toggle controlling feature availability via the three-level priority chain (existing)

---

## Requirements

### Requirement 1: Visual Voicemail Inbox

**User Story:** As a User, I want a rich visual voicemail inbox with folders, search, and bulk actions, so that I can efficiently manage large volumes of voicemail.

#### Acceptance Criteria

1. THE Voicemail_Inbox_Service SHALL organise voicemails into three folders: Inbox, Saved, and Trash.
2. WHEN a new voicemail is received, THE Voicemail_Inbox_Service SHALL place the voicemail in the Inbox folder with an "unread" status.
3. THE Voicemail_Inbox_Service SHALL allow a User to move one or more voicemails between the Inbox, Saved, and Trash folders in a single operation.
4. THE Voicemail_Inbox_Service SHALL allow a User to mark one or more voicemails as read or unread in a single operation.
5. THE Voicemail_Inbox_Service SHALL allow a User to permanently delete one or more voicemails from the Trash folder in a single operation.
6. THE Voicemail_Inbox_Service SHALL allow a User to search voicemails by caller ID, transcription text, date range, and folder.
7. WHEN a voicemail is moved to Trash, THE Voicemail_Inbox_Service SHALL retain the voicemail in Trash for 30 days before automatic permanent deletion.
8. THE Voicemail_Inbox_Service SHALL display each voicemail entry with: caller ID, date/time, duration, transcription preview (first 100 characters), read/unread status, and folder.
9. THE Voicemail_Inbox_Service SHALL be gated by the `visual_voicemail_inbox` feature flag.

---

### Requirement 2: Virtual Phone Numbers (Second Lines)

**User Story:** As a User, I want to add virtual phone numbers that ring on my device with independent settings, so that I can separate personal, business, and other identities on a single device.

#### Acceptance Criteria

1. THE Virtual_Number_Service SHALL allow a User to provision up to the limit defined by the `max_virtual_numbers` numeric feature flag.
2. WHEN a User provisions a Virtual_Number, THE Virtual_Number_Service SHALL provision the number via the Telnyx API and associate it with the User account as a Virtual_Number distinct from a Parked_Number.
3. EACH Virtual_Number SHALL support independent voicemail greetings, call handling rules, and voicemail boxes separate from Parked_Numbers.
4. THE Virtual_Number_Service SHALL allow a User to select a Virtual_Number by area code, region, or vanity pattern using the Telnyx number search API.
5. WHEN an inbound call arrives on a Virtual_Number, THE System SHALL ring the User's device and identify which Virtual_Number is receiving the call.
6. THE Virtual_Number_Service SHALL allow a User to place outbound calls and send outbound SMS using any of the User's Virtual_Numbers as the caller/sender ID via Telnyx.
7. WHEN a User releases a Virtual_Number, THE Virtual_Number_Service SHALL release the number via Telnyx and remove all associated data.
8. THE Virtual_Number_Service SHALL be gated by the `virtual_numbers` feature flag.

---

### Requirement 3: Auto Attendant (IVR)

**User Story:** As a User, I want to set up an interactive voice response menu on my numbers, so that callers can self-route to the correct destination.

#### Acceptance Criteria

1. THE IVR_Service SHALL allow a User to create an IVR menu for any Parked_Number or Virtual_Number.
2. EACH IVR menu SHALL support up to 9 configurable key-press options (digits 1–9), each mapped to one of the following actions: forward to a phone number, forward to a voicemail box, play a sub-menu, play a message and disconnect.
3. THE IVR_Service SHALL allow a User to configure a greeting audio or TTS text that plays before the menu options.
4. WHEN an inbound call arrives on a number with an active IVR menu, THE IVR_Service SHALL play the greeting and wait up to 10 seconds for a key-press input via Telnyx call control.
5. WHEN a caller presses a valid key, THE IVR_Service SHALL execute the mapped action within 2 seconds.
6. IF a caller does not press any key within the timeout period, THEN THE IVR_Service SHALL route the call to the default action configured by the User (voicemail or disconnect).
7. IF a caller presses an invalid key, THEN THE IVR_Service SHALL replay the menu options up to 2 additional times before routing to the default action.
8. THE IVR_Service SHALL be gated by the `ivr_auto_attendant` feature flag.

---

### Requirement 4: Auto-Reply SMS

**User Story:** As a User, I want to automatically text back missed callers with a configurable message, so that callers know I received their call and can provide them with useful links.

#### Acceptance Criteria

1. THE Auto_Reply_Service SHALL allow a User to configure an auto-reply SMS template per Parked_Number or Virtual_Number.
2. EACH auto-reply template SHALL support plain text up to 480 characters and may include URLs.
3. THE Auto_Reply_Service SHALL allow a User to configure different auto-reply templates for the following scenarios: all missed calls, busy, after-hours (linked to DND schedule), and specific caller IDs.
4. WHEN an inbound call is missed or routed to voicemail, THE Auto_Reply_Service SHALL send the matching auto-reply SMS to the caller within 60 seconds via Telnyx.
5. THE Auto_Reply_Service SHALL not send an auto-reply to callers on the User's block list.
6. THE Auto_Reply_Service SHALL not send more than one auto-reply to the same caller ID within a 24-hour period per number to prevent spam.
7. THE Auto_Reply_Service SHALL log each sent auto-reply in the SMS log.
8. THE Auto_Reply_Service SHALL be gated by the `auto_reply_sms` feature flag.

---

### Requirement 5: Unified Inbox

**User Story:** As a User, I want a single inbox that aggregates voicemails, missed calls, and SMS from all my numbers, so that I can see all communications in one place.

#### Acceptance Criteria

1. THE Unified_Inbox_Service SHALL aggregate voicemails, missed calls, and SMS messages from all of a User's Parked_Numbers and Virtual_Numbers into a single chronological feed.
2. THE Unified_Inbox_Service SHALL display each item with: item type (voicemail, missed call, SMS), source number, caller/sender ID, timestamp, and a content preview (transcription for voicemails, message body for SMS).
3. THE Unified_Inbox_Service SHALL allow a User to filter the unified feed by item type, source number, and date range.
4. THE Unified_Inbox_Service SHALL allow a User to tap an item to navigate to the full detail view (voicemail player, SMS thread, or call log entry).
5. THE Unified_Inbox_Service SHALL update in near-real-time when new items arrive, reflecting new entries within 5 seconds on connected clients.
6. THE Unified_Inbox_Service SHALL support pagination with a default page size of 50 items.
7. THE Unified_Inbox_Service SHALL be gated by the `unified_inbox` feature flag.

---

### Requirement 6: Privacy Scan

**User Story:** As a User, I want to scan the internet for exposure of my phone number, so that I can protect my privacy and request removal from data brokers.

#### Acceptance Criteria

1. THE Privacy_Scan_Service SHALL scan a configurable list of public databases and data broker sites for the presence of a User-specified phone number.
2. WHEN a scan is initiated, THE Privacy_Scan_Service SHALL return results within 30 seconds.
3. THE Privacy_Scan_Service SHALL report each finding with: source name, URL where the number was found, data type exposed (phone, name, address), and a risk severity level (low, medium, high).
4. THE Privacy_Scan_Service SHALL provide removal guidance for each finding, including a direct link to the data broker's opt-out page where available.
5. THE Privacy_Scan_Service SHALL allow a User to re-scan at any time and SHALL compare results against the previous scan to highlight new exposures and resolved exposures.
6. THE Privacy_Scan_Service SHALL store scan history per User for up to 12 months.
7. IF a data broker site is unreachable during a scan, THEN THE Privacy_Scan_Service SHALL mark that source as "scan incomplete" and include it in the results without blocking the overall scan.
8. THE Privacy_Scan_Service SHALL be gated by the `privacy_scan` feature flag.

---

### Requirement 7: Push Notifications for Voicemail

**User Story:** As a User, I want real-time push notifications when a new voicemail arrives, so that I can respond promptly without polling the app.

#### Acceptance Criteria

1. WHEN a new voicemail is received, THE Push_Notification_Service SHALL send a push notification to all of the User's registered mobile devices within 10 seconds.
2. EACH push notification SHALL include: the caller ID, the source number that received the voicemail, and the first 100 characters of the transcription (when available).
3. THE Push_Notification_Service SHALL allow a User to enable or disable push notifications per Parked_Number and per Virtual_Number.
4. THE Push_Notification_Service SHALL allow a User to opt in to receiving voicemail arrival notifications via SMS to a designated phone number as an alternative or supplement to push.
5. THE Push_Notification_Service SHALL use platform-native push services (APNs for iOS, FCM for Android).
6. IF push delivery fails, THEN THE Push_Notification_Service SHALL retry delivery up to 3 times with exponential backoff.
7. THE Push_Notification_Service SHALL be gated by the `push_notifications` feature flag.

---

### Requirement 8: Professional Greetings Marketplace

**User Story:** As a User, I want to browse and apply professionally recorded greetings, so that my voicemail sounds polished without recording my own.

#### Acceptance Criteria

1. THE Greetings_Marketplace_Service SHALL provide a browsable catalogue of professionally recorded greeting audio files, organised by category (business, personal, holiday, humorous).
2. EACH catalogue entry SHALL include: a title, category, duration, voice talent name, and a preview audio URL.
3. THE Greetings_Marketplace_Service SHALL allow a User to preview any greeting before applying it.
4. THE Greetings_Marketplace_Service SHALL allow a User to apply a marketplace greeting to any Parked_Number or Virtual_Number as the active voicemail greeting.
5. THE Greetings_Marketplace_Service SHALL allow a User to request a custom professionally recorded greeting by submitting a script; the System SHALL return the recorded greeting within 48 hours.
6. WHEN a User applies a marketplace greeting, THE System SHALL store a reference to the greeting and SHALL NOT duplicate the audio file per User.
7. THE Greetings_Marketplace_Service SHALL allow an administrator to add, update, and remove greetings from the catalogue via the Admin Panel.
8. THE Greetings_Marketplace_Service SHALL be gated by the `greetings_marketplace` feature flag.

---

### Requirement 9: Caller ID Lookup / Reverse Phone Lookup

**User Story:** As a User, I want unknown callers automatically identified with name, location, and spam risk, so that I can make informed decisions about answering or returning calls.

#### Acceptance Criteria

1. WHEN an inbound call arrives from a number not in the User's contacts, THE Caller_ID_Service SHALL perform a reverse phone lookup and return the caller's name, city/state, and carrier where available.
2. THE Caller_ID_Service SHALL assign a spam risk score (0–100) to each looked-up caller based on aggregated reputation data.
3. THE Caller_ID_Service SHALL display the lookup result (name, location, spam score) in the call log entry and in real-time call notifications.
4. THE Caller_ID_Service SHALL allow a User to manually trigger a reverse lookup for any phone number from the call log or contacts screen.
5. THE Caller_ID_Service SHALL cache lookup results for 30 days to reduce redundant API calls.
6. IF the lookup provider is unavailable, THEN THE Caller_ID_Service SHALL display "Unknown" for the caller name and log the lookup failure.
7. THE Caller_ID_Service SHALL be gated by the `caller_id_lookup` feature flag.

---

### Requirement 10: Voicemail-to-Text via SMS

**User Story:** As a User, I want to receive voicemail transcriptions as SMS messages, so that I can read them instantly on any phone without opening the app.

#### Acceptance Criteria

1. THE System SHALL allow a User to configure a destination phone number to receive voicemail transcriptions via SMS, independently per Parked_Number and per Virtual_Number.
2. WHEN a voicemail transcription is complete and SMS delivery is configured, THE System SHALL send the transcription text to the configured destination number via Telnyx within 60 seconds of transcription completion.
3. IF the transcription exceeds 160 characters, THE System SHALL split the message into multiple SMS segments following standard concatenation.
4. THE System SHALL prepend each transcription SMS with the source number and caller ID for context.
5. IF SMS delivery fails, THEN THE System SHALL retry delivery up to 3 times with exponential backoff and log the failure.
6. THE System SHALL be gated by the `voicemail_to_sms` feature flag.

---

### Requirement 11: Contact-Aware Smart Routing

**User Story:** As a User, I want calls routed differently based on whether the caller is a known contact, unknown, or VIP, so that important calls always get through while unknowns are screened.

#### Acceptance Criteria

1. THE Smart_Routing_Service SHALL allow a User to import contacts from the device address book or upload a CSV of contacts (name, phone number, group).
2. THE Smart_Routing_Service SHALL allow a User to assign contacts to one of three tiers: VIP, Known, or Default (unknown).
3. THE Smart_Routing_Service SHALL allow a User to configure a call handling action per tier: ring through, forward to a number, send to voicemail, or screen (if call screening is enabled).
4. WHEN an inbound call arrives, THE Smart_Routing_Service SHALL match the caller ID against the User's contact list and apply the handling action for the matching tier.
5. WHEN a caller matches the VIP tier, THE Smart_Routing_Service SHALL bypass Do Not Disturb rules and ring the User's device.
6. IF a caller does not match any contact, THE Smart_Routing_Service SHALL apply the Default tier action.
7. THE Smart_Routing_Service SHALL be gated by the `smart_routing` feature flag.

---

### Requirement 12: Do Not Disturb Scheduling

**User Story:** As a User, I want time-based rules that automatically change call handling, so that I am not disturbed outside business hours or on weekends.

#### Acceptance Criteria

1. THE DND_Schedule_Service SHALL allow a User to create one or more DND schedules per Parked_Number or Virtual_Number.
2. EACH DND schedule SHALL specify: a name, days of the week, start time, end time, and a timezone.
3. THE DND_Schedule_Service SHALL allow a User to configure the call handling action during a DND window: send all calls to voicemail, play a custom greeting and disconnect, or forward to an alternate number.
4. WHILE a DND schedule is active, THE System SHALL apply the configured DND action to all inbound calls on the associated number, except for callers in the VIP tier (if smart routing is enabled).
5. THE DND_Schedule_Service SHALL allow a User to configure a different voicemail greeting to play during DND windows.
6. THE DND_Schedule_Service SHALL allow a User to enable or disable individual schedules without deleting them.
7. WHEN multiple DND schedules overlap for the same number, THE System SHALL apply the schedule with the earliest start time.
8. THE DND_Schedule_Service SHALL be gated by the `dnd_scheduling` feature flag.

---

### Requirement 13: Voicemail Sharing

**User Story:** As a User, I want to share a voicemail with others via email, SMS, or a link, so that I can forward important messages to colleagues or family.

#### Acceptance Criteria

1. THE Voicemail_Sharing_Service SHALL allow a User to generate a shareable link for any voicemail that includes the audio file and the transcription text.
2. EACH shareable link SHALL have a configurable expiration period chosen by the User: 24 hours, 7 days, or 30 days.
3. THE Voicemail_Sharing_Service SHALL allow a User to share a voicemail directly via email by specifying one or more recipient email addresses.
4. THE Voicemail_Sharing_Service SHALL allow a User to share a voicemail directly via SMS by specifying one or more recipient phone numbers.
5. WHEN a shareable link expires, THE System SHALL return a 410 Gone response for any access attempt and delete the shared resource.
6. THE Voicemail_Sharing_Service SHALL allow a User to revoke a shareable link before its expiration.
7. THE Voicemail_Sharing_Service SHALL not require the recipient to have a KeepNum account to access the shared voicemail.
8. THE Voicemail_Sharing_Service SHALL be gated by the `voicemail_sharing` feature flag.

---

### Requirement 14: Call Recording

**User Story:** As a User, I want to record inbound and outbound calls with proper consent, so that I can review conversations later.

#### Acceptance Criteria

1. THE Call_Recording_Service SHALL allow a User to enable call recording per Parked_Number or Virtual_Number.
2. WHEN call recording is enabled and an inbound or outbound call is connected, THE Call_Recording_Service SHALL play a consent announcement to all parties before recording begins.
3. THE Call_Recording_Service SHALL use the Telnyx call control API to record the call audio.
4. THE Call_Recording_Service SHALL store call recordings in Telnyx Object Storage using the key scheme: `recordings/{userId}/{numberId}/{callId}.mp3`.
5. THE Call_Recording_Service SHALL associate each recording with the call log entry, including: call ID, caller ID, duration, and recording storage key.
6. THE System SHALL apply the same Retention_Policy configured for the associated number to call recordings.
7. THE Call_Recording_Service SHALL allow a User to download a call recording via a time-limited pre-signed URL (15-minute expiry).
8. IF a call party disconnects before the consent announcement completes, THEN THE Call_Recording_Service SHALL not record the call.
9. THE Call_Recording_Service SHALL be gated by the `call_recording` feature flag.

---

### Requirement 15: Conference Bridge / Multi-Party Calling

**User Story:** As a User, I want to set up conference calls with multiple participants, so that I can hold group conversations using my KeepNum numbers.

#### Acceptance Criteria

1. THE Conference_Service SHALL allow a User to create a conference bridge associated with any Parked_Number or Virtual_Number.
2. EACH conference bridge SHALL support up to the number of participants defined by the `max_conference_participants` numeric feature flag.
3. THE Conference_Service SHALL generate a dial-in number and access PIN for each conference bridge.
4. WHEN a participant dials the conference number and enters the correct PIN, THE Conference_Service SHALL add the participant to the active conference via Telnyx.
5. THE Conference_Service SHALL allow the User (host) to mute, unmute, and remove individual participants during an active conference.
6. THE Conference_Service SHALL allow the User to merge an active call into an existing conference bridge.
7. WHEN the host disconnects, THE Conference_Service SHALL end the conference and disconnect all remaining participants.
8. THE Conference_Service SHALL log each conference session with: conference ID, host user ID, participant count, start time, end time, and duration.
9. THE Conference_Service SHALL be gated by the `conference_calling` feature flag.

---

## Feature Flag Additions

The following new feature flags are required to gate the features defined in this specification. All flags integrate with the existing three-level priority chain (user override > package flag > system default).

### Boolean Feature Flags

| Flag Name | Default | Description |
|---|---|---|
| `visual_voicemail_inbox` | `false` | Gates visual voicemail folder management, search, and bulk actions |
| `virtual_numbers` | `false` | Gates provisioning and use of virtual phone numbers |
| `ivr_auto_attendant` | `false` | Gates IVR menu creation and call routing |
| `auto_reply_sms` | `false` | Gates automatic SMS replies to missed calls |
| `unified_inbox` | `false` | Gates the aggregated cross-number inbox view |
| `privacy_scan` | `false` | Gates internet privacy scanning for phone numbers |
| `push_notifications` | `false` | Gates real-time push notifications for voicemail |
| `greetings_marketplace` | `false` | Gates access to the professional greetings catalogue |
| `caller_id_lookup` | `false` | Gates reverse phone lookup and caller identification |
| `voicemail_to_sms` | `false` | Gates voicemail transcription delivery via SMS |
| `smart_routing` | `false` | Gates contact-aware call routing tiers |
| `dnd_scheduling` | `false` | Gates time-based Do Not Disturb rules |
| `voicemail_sharing` | `false` | Gates voicemail sharing via link, email, or SMS |
| `call_recording` | `false` | Gates call recording with consent |
| `conference_calling` | `false` | Gates conference bridge and multi-party calling |

### Numeric Limit Flags

| Flag Name | Default | Description |
|---|---|---|
| `max_virtual_numbers` | `0` | Maximum number of virtual phone numbers a User can provision |
| `max_conference_participants` | `0` | Maximum participants per conference bridge |
