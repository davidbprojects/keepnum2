/**
 * Aurora Serverless Postgres data model types.
 * These mirror the SQL schema defined in the design document.
 */

// ─── Core entities ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  cognito_id: string;
  email: string;
  created_at: string;
  deleted_at: string | null;
}

export type NumberStatus = 'active' | 'released';
export type RetentionPolicy = '30d' | '60d' | '90d' | 'forever';

export interface ParkedNumber {
  id: string;
  user_id: string;
  telnyx_number_id: string;
  phone_number: string; // E.164
  status: NumberStatus;
  retention_policy: RetentionPolicy;
  created_at: string;
  released_at: string | null;
}

export interface ForwardingRule {
  id: string;
  parked_number_id: string;
  destination: string; // E.164
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type CallerRuleAction = 'voicemail' | 'disconnect' | 'forward' | 'custom_greeting';

export interface CallerRuleActionData {
  forwardTo?: string; // E.164
  greetingId?: string;
}

export interface CallerRule {
  id: string;
  parked_number_id: string;
  caller_id: string; // E.164 or pattern
  action: CallerRuleAction;
  action_data: CallerRuleActionData | null;
  created_at: string;
}

export interface BlockListEntry {
  id: string;
  parked_number_id: string;
  caller_id: string;
  created_at: string;
}

export type TranscriptionStatus = 'pending' | 'complete' | 'failed';

export type VoicemailFolder = 'inbox' | 'saved' | 'trash';

export interface Voicemail {
  id: string;
  parked_number_id: string;
  caller_id: string | null;
  duration_seconds: number | null;
  storage_key: string; // Telnyx Object Storage key
  transcription: string | null;
  transcription_status: TranscriptionStatus;
  received_at: string;
  deleted_at: string | null;
  folder: VoicemailFolder;
  read: boolean;
  trashed_at: string | null;
}

export type MessageDirection = 'inbound' | 'outbound';

export interface SmsMessage {
  id: string;
  parked_number_id: string;
  direction: MessageDirection;
  sender: string;
  recipient: string;
  body: string | null;
  media_keys: string[]; // Telnyx Object Storage keys for MMS
  received_at: string;
  deleted_at: string | null;
}

export type GreetingType = 'default' | 'smart_known' | 'smart_unknown';

export interface Greeting {
  id: string;
  parked_number_id: string;
  greeting_type: GreetingType;
  audio_key: string | null; // Telnyx Object Storage key
  tts_text: string | null;
  created_at: string;
  marketplace_greeting_id: string | null;
}

export type AddOnType = 'spam_filter' | 'call_screening';

export interface AddOn {
  id: string;
  user_id: string;
  add_on_type: AddOnType;
  enabled: boolean;
  updated_at: string;
}

// ─── Packages & feature flags ─────────────────────────────────────────────────

export interface Package {
  id: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  per_number_price_cents: number | null;
  publicly_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type FlagValue = boolean | number;

export interface FeatureFlag {
  flag_name: string;
  value: FlagValue;
  updated_at: string;
  updated_by: string | null; // admin Cognito sub
}

export interface PackageFlag {
  id: string;
  package_id: string;
  flag_name: string;
  value: FlagValue;
}

export interface UserFeatureOverride {
  id: string;
  user_id: string;
  flag_name: string;
  value: FlagValue;
  set_by: string; // admin Cognito sub
  updated_at: string;
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing';

export interface Subscription {
  id: string;
  user_id: string;
  package_id: string;
  status: SubscriptionStatus;
  adyen_shopper_ref: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  user_id: string;
  adyen_token: string; // Adyen recurring token — never raw card data
  card_last_four: string | null;
  card_brand: string | null;
  expiry_month: number | null;
  expiry_year: number | null;
  is_default: boolean;
  created_at: string;
}

export type InvoiceStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'chargeback';

export interface Invoice {
  id: string;
  user_id: string;
  subscription_id: string;
  amount_cents: number;
  currency: string;
  status: InvoiceStatus;
  adyen_psp_ref: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export type AdminActionType =
  | 'disable_user'
  | 'enable_user'
  | 'change_package'
  | 'set_flag_override'
  | 'create_package'
  | 'update_package'
  | 'delete_package'
  | 'update_feature_flag_default'
  | 'marketplace_greeting_created'
  | 'marketplace_greeting_updated'
  | 'marketplace_greeting_deleted';

export type AdminTargetType = 'user' | 'package' | 'feature_flag' | 'marketplace_greeting';

export interface AdminAuditLog {
  id: string;
  admin_sub: string; // Cognito sub of acting admin
  action: AdminActionType;
  target_type: AdminTargetType;
  target_id: string;
  payload: Record<string, unknown> | null; // before/after values
  created_at: string;
}

// ─── New type unions (YouMail feature parity) ─────────────────────────────────

export type NumberType = 'parked' | 'virtual';

export type IvrActionType = 'forward_number' | 'voicemail' | 'sub_menu' | 'play_and_disconnect';

export type AutoReplyScenario = 'all_missed' | 'busy' | 'after_hours' | 'specific_caller';

export type ContactTier = 'vip' | 'known' | 'default';

export type TierActionType = 'ring' | 'forward' | 'voicemail' | 'screen';

export type ScanStatus = 'running' | 'complete' | 'partial';

export type FindingSeverity = 'low' | 'medium' | 'high';

export type GreetingCategory = 'business' | 'personal' | 'holiday' | 'humorous';

export type ConferenceStatus = 'active' | 'ended';

export type RecordingDirection = 'inbound' | 'outbound';

// ─── Virtual Numbers ──────────────────────────────────────────────────────────

export interface VirtualNumber {
  id: string;
  user_id: string;
  telnyx_number_id: string;
  phone_number: string; // E.164
  status: NumberStatus;
  retention_policy: RetentionPolicy;
  created_at: string;
  released_at: string | null;
}

// ─── IVR ──────────────────────────────────────────────────────────────────────

export interface IvrMenu {
  id: string;
  number_id: string;
  number_type: NumberType;
  user_id: string;
  greeting_type: 'audio' | 'tts';
  greeting_audio_key: string | null;
  greeting_tts_text: string | null;
  default_action: 'voicemail' | 'disconnect';
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface IvrOption {
  id: string;
  ivr_menu_id: string;
  digit: number; // 1–9
  action: IvrActionType;
  action_data: Record<string, unknown> | null; // JSONB
}

// ─── Auto-Reply ───────────────────────────────────────────────────────────────

export interface AutoReplyTemplate {
  id: string;
  number_id: string;
  number_type: NumberType;
  user_id: string;
  scenario: AutoReplyScenario;
  caller_id_filter: string | null; // E.164, only for specific_caller
  message: string; // max 480 chars
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Voicemail Sharing ────────────────────────────────────────────────────────

export interface VoicemailShare {
  id: string;
  voicemail_id: string;
  user_id: string;
  share_token: string;
  expires_at: string;
  revoked: boolean;
  created_at: string;
}

// ─── Call Recording ───────────────────────────────────────────────────────────

export interface CallRecording {
  id: string;
  user_id: string;
  number_id: string;
  number_type: NumberType;
  call_id: string; // Telnyx call leg ID
  caller_id: string | null;
  direction: RecordingDirection;
  duration_seconds: number | null;
  storage_key: string; // recordings/{userId}/{numberId}/{callId}.mp3
  consent_completed: boolean;
  created_at: string;
  deleted_at: string | null;
}

// ─── Conference ───────────────────────────────────────────────────────────────

export interface Conference {
  id: string;
  user_id: string;
  number_id: string;
  number_type: NumberType;
  telnyx_conf_id: string | null;
  dial_in_number: string; // E.164
  pin: string; // 6-digit numeric
  status: ConferenceStatus;
  started_at: string;
  ended_at: string | null;
}

export interface ConferenceParticipant {
  id: string;
  conference_id: string;
  telnyx_call_id: string;
  caller_id: string | null;
  muted: boolean;
  joined_at: string;
  left_at: string | null;
}

// ─── DND Scheduling ──────────────────────────────────────────────────────────

export interface DndSchedule {
  id: string;
  number_id: string;
  number_type: NumberType;
  user_id: string;
  name: string;
  days_of_week: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  start_time: string; // TIME
  end_time: string; // TIME
  timezone: string; // IANA timezone
  action: 'voicemail' | 'greeting_disconnect' | 'forward';
  action_data: Record<string, unknown> | null; // JSONB
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Contacts & Smart Routing ─────────────────────────────────────────────────

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  phone_number: string; // E.164
  tier: ContactTier;
  group_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TierAction {
  id: string;
  user_id: string;
  tier: ContactTier;
  action: TierActionType;
  action_data: Record<string, unknown> | null; // JSONB
}

// ─── Privacy Scan ─────────────────────────────────────────────────────────────

export interface PrivacyScan {
  id: string;
  user_id: string;
  phone_number: string;
  status: ScanStatus;
  started_at: string;
  completed_at: string | null;
}

export type FindingStatus = 'found' | 'resolved' | 'scan_incomplete';

export interface PrivacyScanFinding {
  id: string;
  scan_id: string;
  source_name: string;
  source_url: string;
  data_types: string[]; // phone | name | address | email
  severity: FindingSeverity;
  opt_out_url: string | null;
  status: FindingStatus;
}

export interface DataBrokerSource {
  id: string;
  name: string;
  check_url_template: string; // URL template with {phone} placeholder
  opt_out_url: string | null;
  enabled: boolean;
  created_at: string;
}

// ─── Greetings Marketplace ────────────────────────────────────────────────────

export interface MarketplaceGreeting {
  id: string;
  title: string;
  category: GreetingCategory;
  duration_seconds: number;
  voice_talent: string;
  audio_key: string; // Telnyx Object Storage key
  preview_audio_key: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomGreetingRequest {
  id: string;
  user_id: string;
  number_id: string;
  number_type: NumberType;
  script: string;
  status: 'pending' | 'recording' | 'delivered';
  result_audio_key: string | null;
  requested_at: string;
  delivered_at: string | null;
}

// ─── Caller ID Cache ──────────────────────────────────────────────────────────

export interface CallerIdCache {
  id: string;
  phone_number: string; // E.164
  name: string | null;
  city: string | null;
  state: string | null;
  carrier: string | null;
  spam_score: number | null; // 0–100
  looked_up_at: string;
  expires_at: string;
}

// ─── Voicemail-to-SMS Config ──────────────────────────────────────────────────

export interface VoicemailSmsConfig {
  id: string;
  user_id: string;
  number_id: string;
  number_type: NumberType;
  enabled: boolean;
  destination_number: string; // E.164
  created_at: string;
  updated_at: string;
}
