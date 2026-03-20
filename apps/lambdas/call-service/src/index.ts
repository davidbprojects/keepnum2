import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { Pool } from 'pg';
import {
  checkSpam,
  resolveFlag,
  makeCallLogPk,
  makeCallLogSk,
  makeTtl,
} from '@keepnum/shared';
import type { CallDisposition, CallLogItem } from '@keepnum/shared';
import type { CallerRuleAction } from '@keepnum/shared';
import { screenCall } from '@keepnum/call-screening-service';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TelnyxCallWebhookPayload {
  data: {
    event_type: string;
    payload: {
      call_control_id: string;
      from: string;
      to: string;
      direction: string;
      call_leg_id: string;
    };
  };
}

interface RoutingDecision {
  disposition: CallDisposition;
  action: 'disconnect' | 'forward' | 'voicemail' | 'custom_greeting' | 'ivr' | 'recording';
  forwardTo?: string;
  spamScore?: number;
  callerIdInfo?: { name: string; city: string; state: string; carrier: string; spam_score: number };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TELNYX_API_BASE = 'https://api.telnyx.com/v2/calls';
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 8000;

// ─── Clients (initialised once per cold start) ──────────────────────────────

const ssm = new SSMClient({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;
const CALL_LOGS_TABLE = process.env.CALL_LOGS_TABLE ?? 'call_logs';

let cachedTelnyxApiKey: string | undefined;

async function getTelnyxApiKey(): Promise<string> {
  if (cachedTelnyxApiKey) return cachedTelnyxApiKey;
  const result = await ssm.send(
    new GetParameterCommand({
      Name: TELNYX_API_KEY_SSM_PATH,
      WithDecryption: true,
    }),
  );
  cachedTelnyxApiKey = result.Parameter?.Value ?? '';
  return cachedTelnyxApiKey;
}

// ─── Retry helper with exponential backoff ───────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function telnyxCallAction(
  callControlId: string,
  action: string,
  apiKey: string,
  body: Record<string, unknown> = {},
): Promise<void> {
  const url = `${TELNYX_API_BASE}/${callControlId}/actions/${action}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) return;

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const text = await response.text();
        throw new Error(`Telnyx ${action} failed: ${response.status} ${text}`);
      }

      if (attempt < MAX_RETRIES) {
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
        await sleep(backoff);
        continue;
      }

      throw new Error(`Telnyx ${action} failed after ${MAX_RETRIES + 1} attempts`);
    } catch (err) {
      if (attempt < MAX_RETRIES && (err as Error).message?.includes('fetch')) {
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ─── Idempotency check ──────────────────────────────────────────────────────

async function callLogExists(callLegId: string): Promise<boolean> {
  // Scan for existing call_leg_id across all partitions is expensive;
  // instead we use a GSI or filter. For simplicity, we query with a
  // filter expression on the table. In production, a GSI on call_leg_id
  // would be more efficient.
  // Here we use a simple approach: store call_leg_id as the callId field
  // and check before processing.
  const result = await ddb.send(
    new QueryCommand({
      TableName: CALL_LOGS_TABLE,
      IndexName: 'callId-index',
      KeyConditionExpression: 'callId = :cid',
      ExpressionAttributeValues: { ':cid': callLegId },
      Limit: 1,
    }),
  );
  return (result.Items?.length ?? 0) > 0;
}

// ─── Aurora lookups ──────────────────────────────────────────────────────────

interface NumberOwner {
  numberId: string;
  userId: string;
  parkedNumberId: string;
  phoneNumber?: string;
}

async function lookupParkedNumber(toNumber: string): Promise<NumberOwner | null> {
  const { rows } = await pool.query<{
    id: string;
    user_id: string;
  }>(
    `SELECT id, user_id FROM parked_numbers
     WHERE phone_number = $1 AND status = 'active'
     LIMIT 1`,
    [toNumber],
  );
  if (rows.length === 0) return null;
  return {
    numberId: rows[0].id,
    userId: rows[0].user_id,
    parkedNumberId: rows[0].id,
    phoneNumber: toNumber,
  };
}

async function isCallerBlocked(
  parkedNumberId: string,
  callerId: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM block_list
     WHERE parked_number_id = $1 AND caller_id = $2
     LIMIT 1`,
    [parkedNumberId, callerId],
  );
  return rows.length > 0;
}

async function getCallerRule(
  parkedNumberId: string,
  callerId: string,
): Promise<{ action: CallerRuleAction; action_data: Record<string, unknown> | null } | null> {
  const { rows } = await pool.query<{
    action: CallerRuleAction;
    action_data: Record<string, unknown> | null;
  }>(
    `SELECT action, action_data FROM caller_rules
     WHERE parked_number_id = $1 AND caller_id = $2
     LIMIT 1`,
    [parkedNumberId, callerId],
  );
  return rows.length > 0 ? rows[0] : null;
}

async function getForwardingRule(
  parkedNumberId: string,
): Promise<{ destination: string } | null> {
  const { rows } = await pool.query<{ destination: string }>(
    `SELECT destination FROM forwarding_rules
     WHERE parked_number_id = $1 AND enabled = true
     LIMIT 1`,
    [parkedNumberId],
  );
  return rows.length > 0 ? rows[0] : null;
}

// ─── Telnyx call control actions ─────────────────────────────────────────────

async function transferCall(
  callControlId: string,
  destination: string,
  apiKey: string,
): Promise<void> {
  await telnyxCallAction(callControlId, 'transfer', apiKey, {
    to: destination,
  });
}

async function hangupCall(
  callControlId: string,
  apiKey: string,
): Promise<void> {
  await telnyxCallAction(callControlId, 'hangup', apiKey);
}

async function speakAndHangup(
  callControlId: string,
  message: string,
  apiKey: string,
): Promise<void> {
  await telnyxCallAction(callControlId, 'speak', apiKey, {
    payload: message,
    voice: 'female',
    language: 'en-US',
  });
  await hangupCall(callControlId, apiKey);
}

// ─── Write call log to DynamoDB ──────────────────────────────────────────────

async function writeCallLog(
  userId: string,
  numberId: string,
  callLegId: string,
  callerId: string,
  disposition: CallDisposition,
  spamScore?: number,
): Promise<void> {
  const timestamp = new Date().toISOString();

  const item: CallLogItem = {
    pk: makeCallLogPk(userId, numberId),
    sk: makeCallLogSk(timestamp, callLegId),
    callId: callLegId,
    callerId,
    direction: 'inbound',
    duration: 0, // duration unknown at routing time; updated later
    disposition,
    ttl: makeTtl(90),
    ...(spamScore !== undefined && { spamScore }),
  };

  await ddb.send(
    new PutCommand({
      TableName: CALL_LOGS_TABLE,
      Item: item,
    }),
  );
}

// ─── New routing helpers ─────────────────────────────────────────────────────

async function lookupCallerId(callerId: string): Promise<{ name: string; city: string; state: string; carrier: string; spam_score: number } | null> {
  try {
    // Internal call to caller-id-service (in production this would be a Lambda invoke)
    const res = await fetch(`${process.env.CALLER_ID_SERVICE_URL ?? 'http://localhost:3000'}/internal/caller-id/${encodeURIComponent(callerId)}`);
    if (!res.ok) return null;
    const data: any = await res.json();
    return data;
  } catch { return null; }
}

async function checkDndSchedule(parkedNumberId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM dnd_schedules WHERE number_id = $1 AND enabled = true
     AND EXTRACT(DOW FROM now() AT TIME ZONE timezone) = ANY(days_of_week)
     AND (now() AT TIME ZONE timezone)::time BETWEEN start_time AND end_time LIMIT 1`,
    [parkedNumberId]);
  return rows.length > 0;
}

async function getContactTier(userId: string, callerId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT tier FROM contacts WHERE user_id = $1 AND phone_number = $2 LIMIT 1`, [userId, callerId]);
  return rows[0]?.tier ?? null;
}

async function getTierAction(userId: string, tier: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT action FROM tier_actions WHERE user_id = $1 AND tier = $2 LIMIT 1`, [userId, tier]);
  return rows[0]?.action ?? null;
}

async function hasIvrMenu(parkedNumberId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id FROM ivr_menus WHERE number_id = $1 LIMIT 1`, [parkedNumberId]);
  return rows[0]?.id ?? null;
}

async function triggerAutoReply(userId: string, numberId: string, callerId: string, fromNumber: string): Promise<void> {
  try {
    await fetch(`${process.env.AUTO_REPLY_SERVICE_URL ?? 'http://localhost:3000'}/internal/auto-reply/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, number_id: numberId, caller_id: callerId, scenario: 'all_missed', from_number: fromNumber }),
    });
  } catch { /* best effort */ }
}

async function triggerPushNotification(userId: string, numberId: string, callerId: string, fromNumber: string): Promise<void> {
  try {
    await fetch(`${process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3000'}/internal/notifications/voicemail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, number_id: numberId, caller_id: callerId, from_number: fromNumber }),
    });
  } catch { /* best effort */ }
}

// ─── Routing decision tree ───────────────────────────────────────────────────

async function routeCall(
  callControlId: string,
  callerId: string,
  owner: NumberOwner,
  apiKey: string,
): Promise<RoutingDecision> {
  const { userId, parkedNumberId } = owner;

  // 1. Block list check → disconnect if matched
  const blocked = await isCallerBlocked(parkedNumberId, callerId);
  if (blocked) {
    await speakAndHangup(
      callControlId,
      'The number you have dialed is not available. Goodbye.',
      apiKey,
    );
    return { disposition: 'blocked', action: 'disconnect' };
  }

  // 2. Caller ID lookup (if enabled)
  let callerIdInfo: RoutingDecision['callerIdInfo'] | undefined;
  const callerIdEnabled = await resolveFlag(userId, 'caller_id_lookup', pool);
  if (callerIdEnabled) {
    const info = await lookupCallerId(callerId);
    if (info) callerIdInfo = info;
  }

  // 3. Spam filter (if enabled) → block if spam
  const spamEnabled = await resolveFlag(userId, 'spam_filtering', pool);
  if (spamEnabled) {
    const spamResult = await checkSpam(callerId, apiKey);
    if (spamResult.isSpam) {
      await speakAndHangup(
        callControlId,
        'The number you have dialed is not available. Goodbye.',
        apiKey,
      );
      return {
        disposition: 'blocked',
        action: 'disconnect',
        spamScore: spamResult.score,
      };
    }
  }

  // 4. Per-caller rules → apply custom action if matched
  const callerRule = await getCallerRule(parkedNumberId, callerId);
  if (callerRule) {
    switch (callerRule.action) {
      case 'voicemail':
        return { disposition: 'voicemail', action: 'voicemail' };
      case 'disconnect':
        await speakAndHangup(
          callControlId,
          'The number you have dialed is not available. Goodbye.',
          apiKey,
        );
        return { disposition: 'blocked', action: 'disconnect' };
      case 'forward': {
        const forwardTo = (callerRule.action_data as Record<string, string>)?.forwardTo;
        if (forwardTo) {
          await transferCall(callControlId, forwardTo, apiKey);
          return { disposition: 'forwarded', action: 'forward', forwardTo };
        }
        // No forward destination configured — fall through to voicemail
        return { disposition: 'voicemail', action: 'voicemail' };
      }
      case 'custom_greeting':
        // Custom greeting routes to voicemail with a specific greeting
        return { disposition: 'voicemail', action: 'custom_greeting' };
    }
  }

  // 5. Smart routing contacts (if enabled)
  const smartRoutingEnabled = await resolveFlag(userId, 'smart_routing', pool);
  if (smartRoutingEnabled) {
    const tier = await getContactTier(userId, callerId);
    if (tier) {
      const tierAction = await getTierAction(userId, tier);
      if (tierAction === 'voicemail') return { disposition: 'voicemail', action: 'voicemail', callerIdInfo };
      if (tierAction === 'block') {
        await speakAndHangup(callControlId, 'The number you have dialed is not available. Goodbye.', apiKey);
        return { disposition: 'blocked', action: 'disconnect', callerIdInfo };
      }
      // 'allow' or 'vip' — continue routing
    }
  }

  // 6. DND schedule check (if enabled) — VIP bypasses DND
  const dndEnabled = await resolveFlag(userId, 'dnd_scheduling', pool);
  if (dndEnabled) {
    const isDnd = await checkDndSchedule(parkedNumberId);
    if (isDnd) {
      // Check if caller is VIP (bypasses DND)
      const tier = smartRoutingEnabled ? await getContactTier(userId, callerId) : null;
      if (tier !== 'vip') {
        return { disposition: 'voicemail', action: 'voicemail', callerIdInfo };
      }
    }
  }

  // 7. Call screening (if enabled) → prompt for name
  const screeningEnabled = await resolveFlag(userId, 'call_screening', pool);
  if (screeningEnabled) {
    try {
      const screenResult = await screenCall(callControlId, apiKey);
      if (!screenResult.accepted || screenResult.timedOut) {
        return { disposition: 'screened', action: 'voicemail' };
      }
      // Caller accepted — continue to forwarding/default
    } catch (err) {
      console.error('Call screening error, routing to voicemail:', err);
      return { disposition: 'screened', action: 'voicemail' };
    }
  }

  // 8. IVR menu check (if enabled)
  const ivrEnabled = await resolveFlag(userId, 'ivr_auto_attendant', pool);
  if (ivrEnabled) {
    const menuId = await hasIvrMenu(parkedNumberId);
    if (menuId) {
      // Hand off to IVR — gather DTMF with menu state
      await telnyxCallAction(callControlId, 'gather', apiKey, {
        maximum_digits: 1, timeout_millis: 10000,
        client_state: Buffer.from(menuId).toString('base64'),
      });
      return { disposition: 'voicemail', action: 'ivr', callerIdInfo };
    }
  }

  // 9. Forwarding rule → forward if active
  const forwardingRule = await getForwardingRule(parkedNumberId);
  if (forwardingRule) {
    try {
      await transferCall(callControlId, forwardingRule.destination, apiKey);
      return {
        disposition: 'forwarded',
        action: 'forward',
        forwardTo: forwardingRule.destination,
      };
    } catch (err) {
      console.error('Call forwarding failed, routing to voicemail:', err);
      // Req 3.4: if forwarded call cannot be connected, route to voicemail
      return { disposition: 'voicemail', action: 'voicemail' };
    }
  }

  // 10. Call recording (if enabled)
  const recordingEnabled = await resolveFlag(userId, 'call_recording', pool);
  if (recordingEnabled) {
    // Play consent announcement and start recording
    await telnyxCallAction(callControlId, 'speak', apiKey, {
      payload: 'This call may be recorded for quality purposes.',
      language: 'en-US', voice: 'female',
    });
    await telnyxCallAction(callControlId, 'record_start', apiKey, {
      format: 'mp3', channels: 'single',
    });
  }

  // 11. Default → voicemail
  const decision: RoutingDecision = { disposition: 'voicemail', action: 'voicemail', callerIdInfo };

  // 12. Auto-reply trigger (if enabled) — on missed/voicemail
  const autoReplyEnabled = await resolveFlag(userId, 'auto_reply_sms', pool);
  if (autoReplyEnabled && (decision.action === 'voicemail')) {
    triggerAutoReply(userId, parkedNumberId, callerId, owner.phoneNumber ?? '').catch(() => {});
  }

  // 13. Push notification trigger (if enabled) — on voicemail
  const pushEnabled = await resolveFlag(userId, 'push_notifications', pool);
  if (pushEnabled && (decision.action === 'voicemail')) {
    triggerPushNotification(userId, parkedNumberId, callerId, owner.phoneNumber ?? '').catch(() => {});
  }

  return decision;
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body: TelnyxCallWebhookPayload = event.body
      ? JSON.parse(event.body)
      : {};

    const eventType = body?.data?.event_type;
    if (eventType !== 'call.initiated') {
      // Only process call.initiated events; acknowledge others
      return json(200, { message: 'Event acknowledged' });
    }

    const payload = body.data.payload;
    if (!payload?.call_control_id || !payload?.from || !payload?.to) {
      return json(400, { error: 'Invalid webhook payload' });
    }

    const { call_control_id, from: callerId, to: toNumber, call_leg_id } = payload;
    const callLegId = call_leg_id ?? call_control_id;

    // Idempotency: skip if already processed
    const alreadyProcessed = await callLogExists(callLegId);
    if (alreadyProcessed) {
      return json(200, { message: 'Already processed' });
    }

    // Look up the parked number
    const owner = await lookupParkedNumber(toNumber);
    if (!owner) {
      console.warn(`No parked number found for ${toNumber}`);
      return json(200, { message: 'Number not parked' });
    }

    const apiKey = await getTelnyxApiKey();

    // Execute routing decision tree
    const decision = await routeCall(call_control_id, callerId, owner, apiKey);

    // Write call log entry
    await writeCallLog(
      owner.userId,
      owner.numberId,
      callLegId,
      callerId,
      decision.disposition,
      decision.spamScore,
    );

    return json(200, {
      message: 'Call routed',
      disposition: decision.disposition,
      action: decision.action,
    });
  } catch (err) {
    console.error('Call service error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
