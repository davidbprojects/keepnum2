/**
 * API request/response types shared across all clients and Lambda functions.
 */

import type {
  RetentionPolicy,
  CallerRuleAction,
  CallerRuleActionData,
  GreetingType,
  FlagValue,
  VoicemailFolder,
  NumberType as AuroraNumberType,
  IvrActionType,
  AutoReplyScenario,
  ContactTier,
  TierActionType,
  GreetingCategory,
} from './aurora';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

export type SearchNumberType = 'local' | 'toll-free' | 'mobile';

export interface NumberSearchParams {
  areaCode?: string;
  region?: string;
  country?: string;
  type?: SearchNumberType;
  pattern?: string;
}

export interface AvailableNumber {
  telnyxNumberId: string;
  phoneNumber: string;
  numberType: SearchNumberType;
  monthlyCostCents: number;
  available: boolean;
}

export interface ProvisionNumberRequest {
  telnyxNumberId: string;
}

export interface SetForwardingRuleRequest {
  destination: string; // E.164
  enabled: boolean;
}

export interface SetRetentionRequest {
  policy: RetentionPolicy;
}

export interface SetGreetingRequest {
  greetingType: GreetingType;
  audioUrl?: string;
  text?: string;
}

export interface AddCallerRuleRequest {
  callerId: string;
  action: CallerRuleAction;
  actionData?: CallerRuleActionData;
}

export interface AddBlockListRequest {
  callerId: string;
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export interface CallLogQueryParams {
  numberId?: string;
  from?: string; // ISO timestamp
  to?: string;   // ISO timestamp
  callerId?: string;
  disposition?: string;
}

export interface SmsLogQueryParams {
  numberId?: string;
  from?: string;
  to?: string;
  sender?: string;
  status?: string;
}

// ─── Downloads ────────────────────────────────────────────────────────────────

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string; // ISO timestamp
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export interface CreateSessionResponse {
  sessionId: string;
  sessionData: string;
}

export interface CreateSubscriptionRequest {
  packageId: string;
}

export interface UpdateSubscriptionRequest {
  packageId: string;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface SetUserStatusRequest {
  enabled: boolean;
}

export interface SetUserPackageRequest {
  packageId: string;
  effectiveImmediately: boolean;
}

export interface SetUserFeatureFlagsRequest {
  [flagName: string]: FlagValue;
}

export interface CreatePackageRequest {
  name: string;
  description?: string;
  priceMonthly: number; // cents
  perNumberPrice?: number; // cents
  publiclyVisible: boolean;
  sortOrder: number;
  flags?: Record<string, FlagValue>;
}

// ─── Generic API response wrapper ─────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── Virtual Numbers ──────────────────────────────────────────────────────────

export interface VirtualNumberSearchParams {
  areaCode?: string;
  region?: string;
  pattern?: string;
}

export interface ProvisionVirtualNumberRequest {
  telnyxNumberId: string;
}

export interface SetVirtualNumberGreetingRequest {
  greetingType: 'audio' | 'tts';
  audioUrl?: string;
  text?: string;
}

export interface SetVirtualNumberForwardingRuleRequest {
  destination: string; // E.164
  enabled: boolean;
}

export interface AddVirtualNumberCallerRuleRequest {
  callerId: string;
  action: CallerRuleAction;
}

export interface AddVirtualNumberBlockListRequest {
  callerId: string;
}

export interface PlaceOutboundCallRequest {
  to: string; // E.164
}

export interface SendOutboundSmsRequest {
  to: string; // E.164
  body: string;
}

// ─── IVR ──────────────────────────────────────────────────────────────────────

export interface IvrOptionInput {
  digit: number; // 1–9
  action: IvrActionType;
  actionData?: Record<string, unknown>;
}

export interface CreateIvrMenuRequest {
  numberId: string;
  numberType: AuroraNumberType;
  greeting: {
    type: 'audio' | 'tts';
    audioUrl?: string;
    text?: string;
  };
  options: IvrOptionInput[];
  defaultAction: 'voicemail' | 'disconnect';
}

export interface UpdateIvrMenuRequest {
  greeting?: {
    type: 'audio' | 'tts';
    audioUrl?: string;
    text?: string;
  };
  options?: IvrOptionInput[];
  defaultAction?: 'voicemail' | 'disconnect';
}

// ─── Auto-Reply ───────────────────────────────────────────────────────────────

export interface CreateAutoReplyTemplateRequest {
  numberId: string;
  numberType: AuroraNumberType;
  scenario: AutoReplyScenario;
  callerIdFilter?: string; // E.164, only for specific_caller
  message: string; // max 480 chars
}

export interface UpdateAutoReplyTemplateRequest {
  scenario?: AutoReplyScenario;
  callerIdFilter?: string;
  message?: string;
  enabled?: boolean;
}

export interface TriggerAutoReplyRequest {
  numberId: string;
  numberType: AuroraNumberType;
  callerId: string;
  scenario: AutoReplyScenario;
}

// ─── Voicemail Bulk Operations ────────────────────────────────────────────────

export interface BulkMoveVoicemailsRequest {
  voicemailIds: string[];
  folder: VoicemailFolder;
}

export interface BulkReadVoicemailsRequest {
  voicemailIds: string[];
  read: boolean;
}

export interface BulkDeleteVoicemailsRequest {
  voicemailIds: string[];
}

export interface VoicemailSearchParams {
  q?: string;
  callerId?: string;
  dateFrom?: string; // ISO timestamp
  dateTo?: string;   // ISO timestamp
  folder?: VoicemailFolder;
}

// ─── Voicemail Sharing ────────────────────────────────────────────────────────

export type ShareExpiration = '24h' | '7d' | '30d';

export interface ShareVoicemailRequest {
  expiresIn: ShareExpiration;
  email?: string[];
  sms?: string[];
}

export interface ShareVoicemailResponse {
  shareToken: string;
  shareUrl: string;
  expiresAt: string;
}

export interface SharedVoicemailResponse {
  audioUrl: string;
  transcription: string | null;
  callerId: string | null;
  duration: number | null;
  receivedAt: string;
}

// ─── Call Recording ───────────────────────────────────────────────────────────

export interface RecordingListParams {
  numberId?: string;
  from?: string;
  to?: string;
}

// ─── Unified Inbox ────────────────────────────────────────────────────────────

export interface UnifiedInboxParams {
  type?: 'voicemail' | 'missed_call' | 'sms';
  numberId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface UnifiedInboxItemResponse {
  itemId: string;
  itemType: 'voicemail' | 'missed_call' | 'sms';
  sourceNumber: string;
  callerId: string;
  timestamp: string;
  preview: string;
  read: boolean;
}

export interface UnreadCountResponse {
  count: number;
}

// ─── Privacy Scan ─────────────────────────────────────────────────────────────

export interface StartPrivacyScanRequest {
  phoneNumber: string; // E.164
}

export interface PrivacyScanFindingResponse {
  id: string;
  sourceName: string;
  sourceUrl: string;
  dataTypes: string[];
  severity: 'low' | 'medium' | 'high';
  optOutUrl: string | null;
  status: 'found' | 'resolved' | 'scan_incomplete';
}

export interface PrivacyScanResultResponse {
  scanId: string;
  phoneNumber: string;
  status: 'running' | 'complete' | 'partial';
  startedAt: string;
  completedAt: string | null;
  findings: PrivacyScanFindingResponse[];
}

export interface PrivacyScanComparisonResponse {
  newFindings: PrivacyScanFindingResponse[];
  resolvedFindings: PrivacyScanFindingResponse[];
  unchangedFindings: PrivacyScanFindingResponse[];
}

// ─── Caller ID ────────────────────────────────────────────────────────────────

export interface CallerIdLookupRequest {
  phoneNumber: string; // E.164
}

export interface CallerIdLookupResponse {
  name: string;
  city: string | null;
  state: string | null;
  carrier: string | null;
  spamScore: number | null; // 0–100
}

// ─── Conference ───────────────────────────────────────────────────────────────

export interface CreateConferenceRequest {
  numberId: string;
  numberType: AuroraNumberType;
}

export interface ConferenceResponse {
  conferenceId: string;
  dialInNumber: string;
  pin: string;
  status: 'active' | 'ended';
  startedAt: string;
  endedAt: string | null;
  participants: ConferenceParticipantResponse[];
}

export interface ConferenceParticipantResponse {
  participantId: string;
  callerId: string | null;
  muted: boolean;
  joinedAt: string;
  leftAt: string | null;
}

export interface MuteParticipantRequest {
  muted: boolean;
}

export interface MergeCallRequest {
  callId: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface RegisterDeviceRequest {
  token: string;
  platform: 'ios' | 'android';
}

export interface RegisterDeviceResponse {
  deviceId: string;
}

export interface UpdateNotificationSettingsRequest {
  numberId: string;
  numberType: AuroraNumberType;
  pushEnabled: boolean;
  smsEnabled: boolean;
  smsDestination?: string; // E.164
}

export interface NotificationSettingsResponse {
  numberId: string;
  numberType: AuroraNumberType;
  pushEnabled: boolean;
  smsEnabled: boolean;
  smsDestination: string | null;
}

export interface TriggerVoicemailNotificationRequest {
  userId: string;
  voicemailId: string;
  callerId: string;
  sourceNumber: string;
  transcriptionPreview: string;
}

// ─── DND Schedules ────────────────────────────────────────────────────────────

export interface CreateDndScheduleRequest {
  name: string;
  days: number[]; // 0=Sun..6=Sat
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  timezone: string;  // IANA
  action: 'voicemail' | 'greeting_disconnect' | 'forward';
  actionData?: Record<string, unknown>;
  greetingId?: string;
}

export interface UpdateDndScheduleRequest {
  name?: string;
  days?: number[];
  startTime?: string;
  endTime?: string;
  timezone?: string;
  action?: 'voicemail' | 'greeting_disconnect' | 'forward';
  actionData?: Record<string, unknown>;
  greetingId?: string;
}

export interface ToggleDndScheduleRequest {
  enabled: boolean;
}

// ─── Contacts & Smart Routing ─────────────────────────────────────────────────

export interface ContactInput {
  name: string;
  phoneNumber: string; // E.164
  tier?: ContactTier;
  groupName?: string;
}

export interface ImportContactsRequest {
  source: 'device' | 'csv';
  data: ContactInput[];
}

export interface UpdateContactRequest {
  tier?: ContactTier;
  name?: string;
  groupName?: string;
}

export interface ContactsQueryParams {
  tier?: ContactTier;
  search?: string;
}

export interface SetTierActionsRequest {
  vip: { action: TierActionType; actionData?: Record<string, unknown> };
  known: { action: TierActionType; actionData?: Record<string, unknown> };
  default: { action: TierActionType; actionData?: Record<string, unknown> };
}

// ─── Greetings Marketplace ────────────────────────────────────────────────────

export interface MarketplaceGreetingsParams {
  category?: GreetingCategory;
  page?: number;
  limit?: number;
}

export interface PreviewGreetingResponse {
  previewAudioUrl: string;
}

export interface ApplyGreetingRequest {
  numberId: string;
  numberType: AuroraNumberType;
}

export interface RequestCustomGreetingRequest {
  script: string;
  numberId: string;
  numberType: AuroraNumberType;
}

export interface AdminCreateGreetingRequest {
  title: string;
  category: GreetingCategory;
  durationSeconds: number;
  voiceTalent: string;
  audioKey: string;
  previewAudioKey: string;
}

export interface AdminUpdateGreetingRequest {
  title?: string;
  category?: GreetingCategory;
  durationSeconds?: number;
  voiceTalent?: string;
  audioKey?: string;
  previewAudioKey?: string;
  active?: boolean;
}

// ─── Voicemail-to-SMS Config ──────────────────────────────────────────────────

export interface SetVoicemailSmsConfigRequest {
  numberId: string;
  numberType: AuroraNumberType;
  enabled: boolean;
  destinationNumber: string; // E.164
}

export interface VoicemailSmsConfigResponse {
  numberId: string;
  numberType: AuroraNumberType;
  enabled: boolean;
  destinationNumber: string;
}

export interface VoicemailSmsConfigQueryParams {
  numberId?: string;
}

export interface NotificationSettingsQueryParams {
  numberId?: string;
}
