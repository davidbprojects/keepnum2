import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Pool } from 'pg';
import {
  checkSpam,
  resolveFlag,
  makeSmsLogPk,
  makeSmsLogSk,
  makeSpamLogPk,
  makeSpamLogSk,
  makeTtl,
} from '@keepnum/shared';
import type { SmsLogItem, SmsLogStatus, SpamLogItem } from '@keepnum/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TelnyxSmsWebhookPayload {
  data: {
    event_type: string;
    payload: {
      id: string;
      from: { phone_number: string };
      to: Array<{ phone_number: string }>;
      text: string;
      media: Array<{ url: string; content_type: string }>;
    };
  };
}

interface NumberOwner {
  numberId: string;
  userId: string;
  parkedNumberId: string;
  userEmail: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';
const TELNYX_STORAGE_BASE = 'https://api.telnyx.com/v2/storage/buckets';
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 8000;

// ─── Clients (initialised once per cold start) ──────────────────────────────

const ssm = new SSMClient({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const ses = new SESClient({});

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;
const SMS_LOGS_TABLE = process.env.SMS_LOGS_TABLE ?? 'sms_logs';
const SPAM_LOG_TABLE = process.env.SPAM_LOG_TABLE ?? 'spam_log';
const STORAGE_BUCKET = process.env.TELNYX_STORAGE_BUCKET ?? 'keepnum-media';
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL ?? 'noreply@keepnum.com';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Retry helper with exponential backoff ───────────────────────────────────

async function telnyxApiCall(
  url: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (response.ok) return response;

      // Non-retryable client errors (except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`Telnyx API error: ${response.status} ${await response.text()}`);
      }

      if (attempt < MAX_RETRIES) {
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
        await sleep(backoff);
        continue;
      }

      throw new Error(`Telnyx API failed after ${MAX_RETRIES + 1} attempts`);
    } catch (err) {
      if (attempt < MAX_RETRIES && (err as Error).message?.includes('fetch')) {
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Telnyx API call exhausted retries');
}

// ─── Aurora lookups ──────────────────────────────────────────────────────────

async function lookupParkedNumber(toNumber: string): Promise<NumberOwner | null> {
  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    email: string;
  }>(
    `SELECT pn.id, pn.user_id, u.email
     FROM parked_numbers pn
     JOIN users u ON u.id = pn.user_id
     WHERE pn.phone_number = $1 AND pn.status = 'active'
     LIMIT 1`,
    [toNumber],
  );
  if (rows.length === 0) return null;
  return {
    numberId: rows[0].id,
    userId: rows[0].user_id,
    parkedNumberId: rows[0].id,
    userEmail: rows[0].email,
  };
}

async function getForwardingDestination(
  parkedNumberId: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ destination: string }>(
    `SELECT destination FROM forwarding_rules
     WHERE parked_number_id = $1 AND enabled = true
     LIMIT 1`,
    [parkedNumberId],
  );
  return rows.length > 0 ? rows[0].destination : null;
}

// ─── DynamoDB log writers ────────────────────────────────────────────────────

async function writeSmsLog(
  userId: string,
  numberId: string,
  messageId: string,
  sender: string,
  recipient: string,
  status: SmsLogStatus,
): Promise<void> {
  const timestamp = new Date().toISOString();

  const item: SmsLogItem = {
    pk: makeSmsLogPk(userId, numberId),
    sk: makeSmsLogSk(timestamp, messageId),
    messageId,
    sender,
    recipient,
    status,
    direction: 'inbound',
    ttl: makeTtl(90),
  };

  await ddb.send(
    new PutCommand({
      TableName: SMS_LOGS_TABLE,
      Item: item,
    }),
  );
}

async function writeSpamLog(
  userId: string,
  sender: string,
  messageId: string,
): Promise<void> {
  const timestamp = new Date().toISOString();

  const item: SpamLogItem = {
    pk: makeSpamLogPk(userId),
    sk: makeSpamLogSk(timestamp, messageId),
    itemId: messageId,
    itemType: 'sms',
    callerId: sender,
    falsePositive: false,
    ttl: makeTtl(90),
  };

  await ddb.send(
    new PutCommand({
      TableName: SPAM_LOG_TABLE,
      Item: item,
    }),
  );
}

// ─── SMS forwarding via Telnyx ───────────────────────────────────────────────

async function forwardViaSms(
  from: string,
  to: string,
  text: string,
  apiKey: string,
): Promise<void> {
  await telnyxApiCall(
    `${TELNYX_API_BASE}/messages`,
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({ from, to, text }),
    },
  );
}

// ─── Email forwarding via SES ────────────────────────────────────────────────

async function forwardViaEmail(
  toEmail: string,
  sender: string,
  parkedNumber: string,
  text: string,
): Promise<void> {
  await ses.send(
    new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: `SMS from ${sender} to ${parkedNumber}` },
        Body: {
          Text: { Data: `From: ${sender}\nTo: ${parkedNumber}\n\n${text}` },
        },
      },
    }),
  );
}

// ─── MMS media storage ───────────────────────────────────────────────────────

async function storeMmsMedia(
  userId: string,
  parkedNumberId: string,
  messageId: string,
  media: Array<{ url: string; content_type: string }>,
  apiKey: string,
): Promise<string[]> {
  const storedKeys: string[] = [];

  for (const item of media) {
    try {
      // Download media from Telnyx-provided URL
      const mediaResponse = await fetch(item.url);
      if (!mediaResponse.ok) {
        console.warn(`Failed to download media from ${item.url}: ${mediaResponse.status}`);
        continue;
      }
      const mediaBuffer = await mediaResponse.arrayBuffer();

      // Derive filename from URL or use index
      const urlPath = new URL(item.url).pathname;
      const filename = urlPath.split('/').pop() ?? `media_${storedKeys.length}`;
      const storageKey = `sms-media/${userId}/${parkedNumberId}/${messageId}/${filename}`;

      // Upload to Telnyx Object Storage
      await telnyxApiCall(
        `${TELNYX_STORAGE_BASE}/${STORAGE_BUCKET}/${encodeURIComponent(storageKey)}`,
        apiKey,
        {
          method: 'PUT',
          headers: { 'Content-Type': item.content_type },
          body: Buffer.from(mediaBuffer),
        },
      );

      storedKeys.push(storageKey);
    } catch (err) {
      console.error(`Failed to store MMS media: ${item.url}`, err);
    }
  }

  return storedKeys;
}

// ─── Failure: store original message in Aurora ───────────────────────────────

async function storeFailedMessage(
  parkedNumberId: string,
  sender: string,
  recipient: string,
  body: string | null,
  mediaKeys: string[],
): Promise<void> {
  await pool.query(
    `INSERT INTO sms_messages (parked_number_id, direction, sender, recipient, body, media_keys, received_at)
     VALUES ($1, 'inbound', $2, $3, $4, $5, NOW())`,
    [parkedNumberId, sender, recipient, body, mediaKeys],
  );
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body: TelnyxSmsWebhookPayload = event.body
      ? JSON.parse(event.body)
      : {};

    const eventType = body?.data?.event_type;
    if (eventType !== 'message.received') {
      // Only process inbound SMS; acknowledge other events
      return json(200, { message: 'Event acknowledged' });
    }

    const payload = body.data.payload;
    if (!payload?.from?.phone_number || !payload?.to?.length) {
      return json(400, { error: 'Invalid webhook payload' });
    }

    const messageId = payload.id;
    const sender = payload.from.phone_number;
    const toNumber = payload.to[0].phone_number;
    const text = payload.text ?? '';
    const media = payload.media ?? [];

    // Look up the parked number
    const owner = await lookupParkedNumber(toNumber);
    if (!owner) {
      console.warn(`No parked number found for ${toNumber}`);
      return json(200, { message: 'Number not parked' });
    }

    const apiKey = await getTelnyxApiKey();

    // ── Step 1: Spam filter (if add-on enabled) ──────────────────────────
    const spamEnabled = await resolveFlag(owner.userId, 'spam_filtering', pool);
    if (spamEnabled) {
      const spamResult = await checkSpam(sender, apiKey);
      if (spamResult.isSpam) {
        // Req 9.4: discard message and log the event
        await writeSpamLog(owner.userId, sender, messageId);
        await writeSmsLog(owner.userId, owner.numberId, messageId, sender, toNumber, 'spam');
        console.info(`SMS from ${sender} to ${toNumber} blocked as spam (score: ${spamResult.score})`);
        return json(200, { message: 'Spam blocked', status: 'spam' });
      }
    }

    // ── Step 2: Store MMS media in Telnyx Object Storage ─────────────────
    let mediaKeys: string[] = [];
    if (media.length > 0) {
      mediaKeys = await storeMmsMedia(
        owner.userId,
        owner.parkedNumberId,
        messageId,
        media,
        apiKey,
      );
    }

    // ── Step 3: Forward via SMS and/or email ─────────────────────────────
    const smsForwardingEnabled = await resolveFlag(owner.userId, 'sms_forwarding_sms', pool);
    const emailForwardingEnabled = await resolveFlag(owner.userId, 'sms_forwarding_email', pool);

    let forwardingFailed = false;
    const errors: string[] = [];

    // Forward via SMS to configured destination
    if (smsForwardingEnabled) {
      const destination = await getForwardingDestination(owner.parkedNumberId);
      if (destination) {
        try {
          await forwardViaSms(toNumber, destination, text, apiKey);
        } catch (err) {
          console.error('SMS forwarding failed:', err);
          forwardingFailed = true;
          errors.push('sms');
        }
      }
    }

    // Forward via email
    if (emailForwardingEnabled) {
      try {
        await forwardViaEmail(owner.userEmail, sender, toNumber, text);
      } catch (err) {
        console.error('Email forwarding failed:', err);
        forwardingFailed = true;
        errors.push('email');
      }
    }

    // ── Step 4: Handle forwarding failure ────────────────────────────────
    if (forwardingFailed) {
      // Req 4.5: store original message for user retrieval
      await storeFailedMessage(
        owner.parkedNumberId,
        sender,
        toNumber,
        text || null,
        mediaKeys,
      );
      await writeSmsLog(owner.userId, owner.numberId, messageId, sender, toNumber, 'failed');
      console.warn(`SMS forwarding failed for message ${messageId}: ${errors.join(', ')}`);
      return json(200, { message: 'Forwarding failed, message stored', status: 'failed' });
    }

    // ── Step 5: Write success log ────────────────────────────────────────
    await writeSmsLog(owner.userId, owner.numberId, messageId, sender, toNumber, 'delivered');

    return json(200, { message: 'SMS processed', status: 'delivered' });
  } catch (err) {
    console.error('SMS service error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
