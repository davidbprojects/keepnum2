/**
 * DynamoDB data model types for high-throughput event data.
 * These mirror the table schemas defined in the design document.
 */

// ─── call_logs table ──────────────────────────────────────────────────────────
// PK: userId#numberId   SK: timestamp#callId

export type CallDisposition = 'answered' | 'voicemail' | 'blocked' | 'screened' | 'forwarded';

export interface CallLogItem {
  /** Partition key: `{userId}#{numberId}` */
  pk: string;
  /** Sort key: `{timestamp}#{callId}` */
  sk: string;
  callId: string;
  callerId: string;
  direction: 'inbound' | 'outbound';
  duration: number; // seconds
  disposition: CallDisposition;
  spamScore?: number;
  /** TTL epoch seconds — minimum 90 days from creation */
  ttl: number;
}

// ─── sms_logs table ───────────────────────────────────────────────────────────
// PK: userId#numberId   SK: timestamp#messageId

export type SmsLogStatus = 'delivered' | 'failed' | 'blocked' | 'spam';

export interface SmsLogItem {
  /** Partition key: `{userId}#{numberId}` */
  pk: string;
  /** Sort key: `{timestamp}#{messageId}` */
  sk: string;
  messageId: string;
  sender: string;
  recipient: string;
  status: SmsLogStatus;
  direction: 'inbound' | 'outbound';
  /** TTL epoch seconds — minimum 90 days from creation */
  ttl: number;
}

// ─── spam_log table ───────────────────────────────────────────────────────────
// PK: userId   SK: timestamp#itemId

export type SpamItemType = 'call' | 'sms';

export interface SpamLogItem {
  /** Partition key: `{userId}` */
  pk: string;
  /** Sort key: `{timestamp}#{itemId}` */
  sk: string;
  itemId: string;
  itemType: SpamItemType;
  callerId: string;
  falsePositive: boolean;
  /** TTL epoch seconds */
  ttl: number;
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

export function makeCallLogPk(userId: string, numberId: string): string {
  return `${userId}#${numberId}`;
}

export function makeCallLogSk(timestamp: string, callId: string): string {
  return `${timestamp}#${callId}`;
}

export function makeSmsLogPk(userId: string, numberId: string): string {
  return `${userId}#${numberId}`;
}

export function makeSmsLogSk(timestamp: string, messageId: string): string {
  return `${timestamp}#${messageId}`;
}

export function makeSpamLogPk(userId: string): string {
  return userId;
}

export function makeSpamLogSk(timestamp: string, itemId: string): string {
  return `${timestamp}#${itemId}`;
}

/** Returns a TTL epoch value at least `minDays` days from now. */
export function makeTtl(minDays: number = 90): number {
  const now = Math.floor(Date.now() / 1000);
  return now + minDays * 24 * 60 * 60;
}

// ─── auto_reply_log table ─────────────────────────────────────────────────────
// PK: numberId#callerId   SK: sentAt

export interface AutoReplyLogItem {
  /** Partition key: `{numberId}#{callerId}` */
  pk: string;
  /** Sort key: sentAt ISO timestamp */
  sk: string;
  templateId: string;
  scenario: string;
  /** TTL epoch seconds — 24h from sentAt */
  ttl: number;
}

// ─── unified_inbox_items table ────────────────────────────────────────────────
// PK: userId   SK: timestamp#itemType#itemId

export type UnifiedInboxItemType = 'voicemail' | 'missed_call' | 'sms';

export interface UnifiedInboxItem {
  /** Partition key: `{userId}` */
  pk: string;
  /** Sort key: `{timestamp}#{itemType}#{itemId}` */
  sk: string;
  itemType: UnifiedInboxItemType;
  sourceNumber: string; // E.164
  callerId: string;
  preview: string; // first 100 chars of transcription or SMS body
  read: boolean;
  /** TTL epoch seconds */
  ttl: number;
}

// ─── device_tokens table ──────────────────────────────────────────────────────
// PK: userId   SK: deviceId

export type DevicePlatform = 'ios' | 'android';

export interface DeviceTokenItem {
  /** Partition key: `{userId}` */
  pk: string;
  /** Sort key: `{deviceId}` */
  sk: string;
  token: string;
  platform: DevicePlatform;
  snsEndpointArn: string;
  createdAt: string;
}

// ─── notification_settings table ──────────────────────────────────────────────
// PK: userId#numberId   SK: numberType

export interface NotificationSettingsItem {
  /** Partition key: `{userId}#{numberId}` */
  pk: string;
  /** Sort key: numberType (parked | virtual) */
  sk: string;
  pushEnabled: boolean;
  smsEnabled: boolean;
  smsDestination: string | null; // E.164, optional
}

// ─── conference_logs table ────────────────────────────────────────────────────
// PK: userId   SK: timestamp#conferenceId

export interface ConferenceLogItem {
  /** Partition key: `{userId}` */
  pk: string;
  /** Sort key: `{timestamp}#{conferenceId}` */
  sk: string;
  conferenceId: string;
  participantCount: number;
  startTime: string;
  endTime: string;
  duration: number; // seconds
  /** TTL epoch seconds */
  ttl: number;
}

// ─── New key helpers ──────────────────────────────────────────────────────────

export function makeAutoReplyLogPk(numberId: string, callerId: string): string {
  return `${numberId}#${callerId}`;
}

export function makeUnifiedInboxPk(userId: string): string {
  return userId;
}

export function makeUnifiedInboxSk(timestamp: string, itemType: string, itemId: string): string {
  return `${timestamp}#${itemType}#${itemId}`;
}

export function makeDeviceTokenPk(userId: string): string {
  return userId;
}

export function makeNotificationSettingsPk(userId: string, numberId: string): string {
  return `${userId}#${numberId}`;
}

export function makeConferenceLogPk(userId: string): string {
  return userId;
}

export function makeConferenceLogSk(timestamp: string, conferenceId: string): string {
  return `${timestamp}#${conferenceId}`;
}
