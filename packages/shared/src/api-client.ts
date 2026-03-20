/**
 * API client helpers using Amplify Libraries REST API category.
 * All requests automatically attach the Cognito JWT.
 */
// @ts-nocheck — Amplify REST API types use DocumentType which conflicts with strict casts

import { get, post, put, del } from 'aws-amplify/api';
import type {
  NumberSearchParams,
  AvailableNumber,
  ProvisionNumberRequest,
  SetForwardingRuleRequest,
  SetRetentionRequest,
  SetGreetingRequest,
  AddCallerRuleRequest,
  AddBlockListRequest,
  CallLogQueryParams,
  SmsLogQueryParams,
  DownloadUrlResponse,
  CreateSessionResponse,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  LoginResponse,
  RefreshResponse,
  RegisterRequest,
  LoginRequest,
  RefreshRequest,
} from './types/api';
import type {
  ParkedNumber,
  ForwardingRule,
  CallerRule,
  Voicemail,
  SmsMessage,
  Package,
  Subscription,
  Invoice,
} from './types/aurora';
import type { CallLogItem, SmsLogItem, SpamLogItem } from './types/dynamodb';

const API_NAME = 'keepnumApi';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function register(req: RegisterRequest): Promise<void> {
  const { body } = await post({ apiName: API_NAME, path: '/auth/register', options: { body: req as unknown as Record<string, unknown> } }).response;
  await body.json();
}

export async function login(req: LoginRequest): Promise<LoginResponse> {
  const { body } = await post({ apiName: API_NAME, path: '/auth/login', options: { body: req as unknown as Record<string, unknown> } }).response;
  return body.json() as Promise<LoginResponse>;
}

export async function refreshToken(req: RefreshRequest): Promise<RefreshResponse> {
  const { body } = await post({ apiName: API_NAME, path: '/auth/refresh', options: { body: req as unknown as Record<string, unknown> } }).response;
  return body.json() as Promise<RefreshResponse>;
}

export async function deleteAccount(): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: '/auth/account' }).response;
  await body.json();
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

export async function searchNumbers(params: NumberSearchParams): Promise<AvailableNumber[]> {
  const queryParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  );
  const { body } = await get({ apiName: API_NAME, path: '/numbers/search', options: { queryParams } }).response;
  return body.json() as Promise<AvailableNumber[]>;
}

export async function provisionNumber(req: ProvisionNumberRequest): Promise<ParkedNumber> {
  const { body } = await post({ apiName: API_NAME, path: '/numbers', options: { body: req as unknown as Record<string, unknown> } }).response;
  return body.json() as Promise<ParkedNumber>;
}

export async function listNumbers(): Promise<ParkedNumber[]> {
  const { body } = await get({ apiName: API_NAME, path: '/numbers' }).response;
  return body.json() as Promise<ParkedNumber[]>;
}

export async function releaseNumber(numberId: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/numbers/${numberId}` }).response;
  await body.json();
}

export async function setForwardingRule(numberId: string, req: SetForwardingRuleRequest): Promise<ForwardingRule> {
  const { body } = await put({ apiName: API_NAME, path: `/numbers/${numberId}/forwarding-rule`, options: { body: req as unknown as Record<string, unknown> } }).response;
  return body.json() as Promise<ForwardingRule>;
}

export async function setRetentionPolicy(numberId: string, req: SetRetentionRequest): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: `/numbers/${numberId}/retention`, options: { body: req as unknown as Record<string, unknown> } }).response;
  await body.json();
}

export async function setGreeting(numberId: string, req: SetGreetingRequest): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: `/numbers/${numberId}/greeting`, options: { body: req as unknown as Record<string, unknown> } }).response;
  await body.json();
}

export async function addCallerRule(numberId: string, req: AddCallerRuleRequest): Promise<CallerRule> {
  const { body } = await post({ apiName: API_NAME, path: `/numbers/${numberId}/caller-rules`, options: { body: req as unknown as Record<string, unknown> } }).response;
  return body.json() as Promise<CallerRule>;
}

export async function deleteCallerRule(numberId: string, ruleId: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/numbers/${numberId}/caller-rules/${ruleId}` }).response;
  await body.json();
}

export async function addToBlockList(numberId: string, req: AddBlockListRequest): Promise<void> {
  const { body } = await post({ apiName: API_NAME, path: `/numbers/${numberId}/blocklist`, options: { body: req as unknown as Record<string, unknown> } }).response;
  await body.json();
}

export async function removeFromBlockList(numberId: string, callerId: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/numbers/${numberId}/blocklist/${encodeURIComponent(callerId)}` }).response;
  await body.json();
}

// ─── Voicemails ───────────────────────────────────────────────────────────────

export async function listVoicemails(): Promise<Voicemail[]> {
  const { body } = await get({ apiName: API_NAME, path: '/voicemails' }).response;
  return body.json() as Promise<Voicemail[]>;
}

export async function getVoicemail(voicemailId: string): Promise<Voicemail> {
  const { body } = await get({ apiName: API_NAME, path: `/voicemails/${voicemailId}` }).response;
  return body.json() as Promise<Voicemail>;
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export async function getCallLogs(params: CallLogQueryParams): Promise<CallLogItem[]> {
  const queryParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  );
  const { body } = await get({ apiName: API_NAME, path: '/logs/calls', options: { queryParams } }).response;
  return body.json() as Promise<CallLogItem[]>;
}

export async function getSmsLogs(params: SmsLogQueryParams): Promise<SmsLogItem[]> {
  const queryParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  );
  const { body } = await get({ apiName: API_NAME, path: '/logs/sms', options: { queryParams } }).response;
  return body.json() as Promise<SmsLogItem[]>;
}

export async function getSpamLog(): Promise<SpamLogItem[]> {
  const { body } = await get({ apiName: API_NAME, path: '/logs/spam' }).response;
  return body.json() as Promise<SpamLogItem[]>;
}

// ─── Downloads ────────────────────────────────────────────────────────────────

export async function getVoicemailDownloadUrl(voicemailId: string): Promise<DownloadUrlResponse> {
  const { body } = await get({ apiName: API_NAME, path: `/download/voicemail/${voicemailId}` }).response;
  return body.json() as Promise<DownloadUrlResponse>;
}

export async function getSmsDownloadUrl(numberId: string): Promise<DownloadUrlResponse> {
  const { body } = await get({ apiName: API_NAME, path: `/download/sms/${numberId}` }).response;
  return body.json() as Promise<DownloadUrlResponse>;
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export async function createBillingSession(): Promise<CreateSessionResponse> {
  const { body } = await post({ apiName: API_NAME, path: '/billing/session', options: { body: {} } }).response;
  return body.json() as Promise<CreateSessionResponse>;
}

export async function createSubscription(req: CreateSubscriptionRequest): Promise<Subscription> {
  const { body } = await post({ apiName: API_NAME, path: '/billing/subscriptions', options: { body: req as unknown as Record<string, unknown> } }).response;
  return body.json() as Promise<Subscription>;
}

export async function updateSubscription(subscriptionId: string, req: UpdateSubscriptionRequest): Promise<Subscription> {
  const { body } = await put({ apiName: API_NAME, path: `/billing/subscriptions/${subscriptionId}`, options: { body: req as unknown as Record<string, unknown> } }).response;
  return body.json() as Promise<Subscription>;
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/billing/subscriptions/${subscriptionId}` }).response;
  await body.json();
}

export async function reactivateSubscription(subscriptionId: string): Promise<Subscription> {
  const { body } = await post({ apiName: API_NAME, path: `/billing/subscriptions/${subscriptionId}/reactivate`, options: { body: {} } }).response;
  return body.json() as Promise<Subscription>;
}

export async function listInvoices(): Promise<Invoice[]> {
  const { body } = await get({ apiName: API_NAME, path: '/billing/invoices' }).response;
  return body.json() as Promise<Invoice[]>;
}

// ─── Public packages (unauthenticated) ───────────────────────────────────────

export async function getPublicPackages(): Promise<Package[]> {
  const { body } = await get({ apiName: API_NAME, path: '/packages/public' }).response;
  return body.json() as Promise<Package[]>;
}

// ─── SMS messages ─────────────────────────────────────────────────────────────

export async function listSmsMessages(numberId: string): Promise<SmsMessage[]> {
  const { body } = await get({ apiName: API_NAME, path: `/numbers/${numberId}/sms` }).response;
  return body.json() as Promise<SmsMessage[]>;
}


// ─── Virtual Numbers ──────────────────────────────────────────────────────────

export async function searchVirtualNumbers(params: Record<string, string>): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/virtual-numbers/search', options: { queryParams: params } }).response;
  return body.json();
}
export async function provisionVirtualNumber(req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: '/virtual-numbers', options: { body: req } }).response;
  return body.json();
}
export async function listVirtualNumbers(): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/virtual-numbers' }).response;
  return body.json();
}
export async function getVirtualNumber(id: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/virtual-numbers/${id}` }).response;
  return body.json();
}
export async function releaseVirtualNumber(id: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/virtual-numbers/${id}` }).response;
  await body.json();
}
export async function setVirtualNumberGreeting(id: string, req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: `/virtual-numbers/${id}/greeting`, options: { body: req } }).response;
  await body.json();
}
export async function setVirtualNumberForwardingRule(id: string, req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: `/virtual-numbers/${id}/forwarding-rule`, options: { body: req } }).response;
  await body.json();
}
export async function addVirtualNumberCallerRule(id: string, req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: `/virtual-numbers/${id}/caller-rules`, options: { body: req } }).response;
  return body.json();
}
export async function deleteVirtualNumberCallerRule(id: string, ruleId: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/virtual-numbers/${id}/caller-rules/${ruleId}` }).response;
  await body.json();
}
export async function addVirtualNumberBlockList(id: string, req: Record<string, unknown>): Promise<void> {
  const { body } = await post({ apiName: API_NAME, path: `/virtual-numbers/${id}/blocklist`, options: { body: req } }).response;
  await body.json();
}
export async function removeVirtualNumberBlockList(id: string, callerId: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/virtual-numbers/${id}/blocklist/${encodeURIComponent(callerId)}` }).response;
  await body.json();
}
export async function placeOutboundCall(id: string, req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: `/virtual-numbers/${id}/outbound-call`, options: { body: req } }).response;
  return body.json();
}
export async function sendOutboundSms(id: string, req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: `/virtual-numbers/${id}/outbound-sms`, options: { body: req } }).response;
  return body.json();
}


// ─── IVR Menus ────────────────────────────────────────────────────────────────

export async function createIvrMenu(req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: '/ivr-menus', options: { body: req } }).response;
  return body.json();
}
export async function listIvrMenus(): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/ivr-menus' }).response;
  return body.json();
}
export async function getIvrMenu(id: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/ivr-menus/${id}` }).response;
  return body.json();
}
export async function updateIvrMenu(id: string, req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: `/ivr-menus/${id}`, options: { body: req } }).response;
  await body.json();
}
export async function deleteIvrMenu(id: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/ivr-menus/${id}` }).response;
  await body.json();
}

// ─── Auto-Reply Templates ─────────────────────────────────────────────────────

export async function createAutoReplyTemplate(req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: '/auto-reply-templates', options: { body: req } }).response;
  return body.json();
}
export async function listAutoReplyTemplates(params?: Record<string, string>): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/auto-reply-templates', options: params ? { queryParams: params } : undefined }).response;
  return body.json();
}
export async function updateAutoReplyTemplate(id: string, req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: `/auto-reply-templates/${id}`, options: { body: req } }).response;
  await body.json();
}
export async function deleteAutoReplyTemplate(id: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/auto-reply-templates/${id}` }).response;
  await body.json();
}

// ─── Voicemail Extensions ─────────────────────────────────────────────────────

export async function bulkMoveVoicemails(req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: '/voicemails/bulk/move', options: { body: req } }).response;
  await body.json();
}
export async function bulkReadVoicemails(req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: '/voicemails/bulk/read', options: { body: req } }).response;
  await body.json();
}
export async function bulkDeleteVoicemails(req: Record<string, unknown>): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: '/voicemails/bulk/delete', options: { body: req } }).response;
  await body.json();
}
export async function searchVoicemails(params: Record<string, string>): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/voicemails/search', options: { queryParams: params } }).response;
  return body.json();
}
export async function shareVoicemail(id: string, req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: `/voicemails/${id}/share`, options: { body: req } }).response;
  return body.json();
}
export async function revokeVoicemailShare(id: string, shareToken: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/voicemails/${id}/share/${shareToken}` }).response;
  await body.json();
}
export async function getSharedVoicemail(shareToken: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/shared/voicemail/${shareToken}` }).response;
  return body.json();
}

// ─── Recordings ───────────────────────────────────────────────────────────────

export async function listRecordings(): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/recordings' }).response;
  return body.json();
}
export async function getRecording(callId: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/recordings/${callId}` }).response;
  return body.json();
}
export async function getRecordingDownloadUrl(callId: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/download/recording/${callId}` }).response;
  return body.json();
}

// ─── Unified Inbox ────────────────────────────────────────────────────────────

export async function getUnifiedInbox(params?: Record<string, string>): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/unified-inbox', options: params ? { queryParams: params } : undefined }).response;
  return body.json();
}
export async function getUnifiedInboxItem(itemId: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/unified-inbox/${itemId}` }).response;
  return body.json();
}
export async function getUnreadCount(): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/unified-inbox/unread-count' }).response;
  return body.json();
}

// ─── Privacy Scan ─────────────────────────────────────────────────────────────

export async function startPrivacyScan(req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: '/privacy-scans', options: { body: req } }).response;
  return body.json();
}
export async function listPrivacyScans(): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/privacy-scans' }).response;
  return body.json();
}
export async function getPrivacyScanResults(scanId: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/privacy-scans/${scanId}` }).response;
  return body.json();
}
export async function comparePrivacyScans(scanId: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/privacy-scans/${scanId}/compare` }).response;
  return body.json();
}

// ─── Caller ID ────────────────────────────────────────────────────────────────

export async function lookupCallerId(phoneNumber: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/caller-id/lookup/${encodeURIComponent(phoneNumber)}` }).response;
  return body.json();
}


// ─── Conference ───────────────────────────────────────────────────────────────

export async function createConference(req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: '/conferences', options: { body: req } }).response;
  return body.json();
}
export async function listConferences(): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/conferences' }).response;
  return body.json();
}
export async function getConference(id: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/conferences/${id}` }).response;
  return body.json();
}
export async function endConference(id: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/conferences/${id}` }).response;
  await body.json();
}
export async function muteParticipant(confId: string, participantId: string, body?: Record<string, unknown>): Promise<unknown> {
  const { body: resp } = await put({ apiName: API_NAME, path: `/conferences/${confId}/participants/${participantId}`, options: { body: body ?? {} } }).response;
  return resp.json();
}
export async function removeParticipant(confId: string, participantId: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/conferences/${confId}/participants/${participantId}` }).response;
  await body.json();
}
export async function mergeCallIntoConference(confId: string, req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: `/conferences/${confId}/merge`, options: { body: req } }).response;
  return body.json();
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function registerDevice(req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: '/devices', options: { body: req } }).response;
  return body.json();
}
export async function unregisterDevice(deviceId: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/devices/${deviceId}` }).response;
  await body.json();
}
export async function updateNotificationSettings(req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: '/notifications/settings', options: { body: req } }).response;
  await body.json();
}
export async function getNotificationSettings(params: Record<string, string>): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/notifications/settings', options: { queryParams: params } }).response;
  return body.json();
}

// ─── DND Schedules ────────────────────────────────────────────────────────────

export async function createDndSchedule(numberId: string, req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: `/numbers/${numberId}/dnd-schedules`, options: { body: req } }).response;
  return body.json();
}
export async function listDndSchedules(numberId: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/numbers/${numberId}/dnd-schedules` }).response;
  return body.json();
}
export async function updateDndSchedule(numberId: string, scheduleId: string, req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: `/numbers/${numberId}/dnd-schedules/${scheduleId}`, options: { body: req } }).response;
  await body.json();
}
export async function deleteDndSchedule(numberId: string, scheduleId: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/numbers/${numberId}/dnd-schedules/${scheduleId}` }).response;
  await body.json();
}
export async function toggleDndSchedule(numberId: string, scheduleId: string): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: `/numbers/${numberId}/dnd-schedules/${scheduleId}/toggle`, options: { body: {} } }).response;
  await body.json();
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function importContacts(req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: '/contacts/import', options: { body: req } }).response;
  return body.json();
}
export async function listContacts(params?: Record<string, string>): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/contacts', options: params ? { queryParams: params } : undefined }).response;
  return body.json();
}
export async function updateContact(contactId: string, req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: `/contacts/${contactId}`, options: { body: req } }).response;
  await body.json();
}
export async function deleteContact(contactId: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/contacts/${contactId}` }).response;
  await body.json();
}
export async function setTierActions(req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: '/contacts/tier-actions', options: { body: req } }).response;
  await body.json();
}

// ─── Marketplace Greetings ────────────────────────────────────────────────────

export async function listMarketplaceGreetings(params?: Record<string, string>): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/greetings/marketplace', options: params ? { queryParams: params } : undefined }).response;
  return body.json();
}
export async function previewGreeting(id: string): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: `/greetings/marketplace/${id}/preview` }).response;
  return body.json();
}
export async function applyGreeting(id: string, req: Record<string, unknown>): Promise<void> {
  const { body } = await post({ apiName: API_NAME, path: `/greetings/marketplace/${id}/apply`, options: { body: req } }).response;
  await body.json();
}
export async function requestCustomGreeting(req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: '/greetings/custom-request', options: { body: req } }).response;
  return body.json();
}

// ─── Voicemail SMS Config ─────────────────────────────────────────────────────

export async function setVoicemailSmsConfig(req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: '/voicemails/sms-config', options: { body: req } }).response;
  await body.json();
}
export async function getVoicemailSmsConfig(): Promise<unknown> {
  const { body } = await get({ apiName: API_NAME, path: '/voicemails/sms-config' }).response;
  return body.json();
}

// ─── Admin Greetings ──────────────────────────────────────────────────────────

export async function createAdminGreeting(req: Record<string, unknown>): Promise<unknown> {
  const { body } = await post({ apiName: API_NAME, path: '/admin/greetings', options: { body: req } }).response;
  return body.json();
}
export async function updateAdminGreeting(id: string, req: Record<string, unknown>): Promise<void> {
  const { body } = await put({ apiName: API_NAME, path: `/admin/greetings/${id}`, options: { body: req } }).response;
  await body.json();
}
export async function deleteAdminGreeting(id: string): Promise<void> {
  const { body } = await del({ apiName: API_NAME, path: `/admin/greetings/${id}` }).response;
  await body.json();
}
