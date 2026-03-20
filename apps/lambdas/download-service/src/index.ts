import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import { resolveFlag } from '@keepnum/shared';

// ─── Constants ───────────────────────────────────────────────────────────────

const TELNYX_STORAGE_BASE = 'https://api.telnyx.com/v2/storage/buckets';
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 8000;
const PRESIGNED_URL_EXPIRY_SECONDS = 900; // 15 minutes

// ─── Clients (initialised once per cold start) ──────────────────────────────

const ssm = new SSMClient({});

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;
const STORAGE_BUCKET = process.env.TELNYX_STORAGE_BUCKET ?? 'keepnum-media';

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

function getUserId(event: APIGatewayProxyEvent): string | undefined {
  return event.requestContext.authorizer?.claims?.sub as string | undefined;
}

async function getDbUserId(cognitoSub: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE cognito_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [cognitoSub],
  );
  return rows.length > 0 ? rows[0].id : null;
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

// ─── Telnyx Object Storage: generate pre-signed download URL ─────────────────

async function generatePresignedUrl(
  storageKey: string,
  apiKey: string,
): Promise<{ url: string; expiresAt: string }> {
  const response = await telnyxApiCall(
    `${TELNYX_STORAGE_BASE}/${STORAGE_BUCKET}/${encodeURIComponent(storageKey)}/presigned-url`,
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({
        expires_in: PRESIGNED_URL_EXPIRY_SECONDS,
        method: 'GET',
      }),
    },
  );

  const data = (await response.json()) as { data?: { presigned_url?: string } };
  const presignedUrl = data?.data?.presigned_url;

  if (!presignedUrl) {
    throw new Error('Failed to generate pre-signed URL from Telnyx');
  }

  const expiresAt = new Date(Date.now() + PRESIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();
  return { url: presignedUrl, expiresAt };
}

// ─── Upload buffer to Telnyx Object Storage ──────────────────────────────────

async function uploadToObjectStorage(
  storageKey: string,
  content: Buffer,
  contentType: string,
  apiKey: string,
): Promise<void> {
  await telnyxApiCall(
    `${TELNYX_STORAGE_BASE}/${STORAGE_BUCKET}/${encodeURIComponent(storageKey)}`,
    apiKey,
    {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: content,
    },
  );
}

// ─── CSV generation helper ───────────────────────────────────────────────────

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function generateSmsCsv(
  rows: Array<{
    sender: string;
    recipient: string;
    body: string | null;
    received_at: string;
    direction: string;
  }>,
): string {
  const header = 'sender,recipient,body,received_at,direction';
  const lines = rows.map((r) =>
    [
      escapeCsvField(r.sender),
      escapeCsvField(r.recipient),
      escapeCsvField(r.body ?? ''),
      escapeCsvField(r.received_at),
      escapeCsvField(r.direction),
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

// ─── Route: GET /download/voicemail/:id (Req 7.1, 7.3, 7.4) ────────────────

async function handleDownloadVoicemail(
  voicemailId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  // Verify voicemail exists, user owns it, and it's not deleted
  const { rows } = await pool.query<{
    id: string;
    storage_key: string;
    deleted_at: string | null;
  }>(
    `SELECT v.id, v.storage_key, v.deleted_at
     FROM voicemails v
     JOIN parked_numbers pn ON pn.id = v.parked_number_id
     WHERE v.id = $1 AND pn.user_id = $2
     LIMIT 1`,
    [voicemailId, dbUserId],
  );

  if (rows.length === 0) {
    return json(404, { error: 'Voicemail not found' });
  }

  // Req 7.4: deleted items return 404
  if (rows[0].deleted_at !== null) {
    return json(404, { error: 'Voicemail not found' });
  }

  const apiKey = await getTelnyxApiKey();

  // Req 7.3: generate time-limited pre-signed URL (15 minutes)
  const { url, expiresAt } = await generatePresignedUrl(rows[0].storage_key, apiKey);

  return json(200, { url, expiresAt });
}

// ─── Route: GET /download/sms/:numberId (Req 7.2, 7.3, 7.4) ────────────────

async function handleDownloadSms(
  numberId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  // Verify user owns the parked number and it's active
  const { rows: pnRows } = await pool.query<{
    id: string;
    phone_number: string;
  }>(
    `SELECT id, phone_number FROM parked_numbers
     WHERE id = $1 AND user_id = $2 AND status = 'active'
     LIMIT 1`,
    [numberId, dbUserId],
  );

  if (pnRows.length === 0) {
    return json(404, { error: 'Parked number not found' });
  }

  // Query all non-deleted SMS messages for this number
  const { rows: smsRows } = await pool.query<{
    sender: string;
    recipient: string;
    body: string | null;
    received_at: string;
    direction: string;
  }>(
    `SELECT sender, recipient, body, received_at, direction
     FROM sms_messages
     WHERE parked_number_id = $1 AND deleted_at IS NULL
     ORDER BY received_at ASC`,
    [numberId],
  );

  if (smsRows.length === 0) {
    return json(404, { error: 'No SMS messages found for this number' });
  }

  // Generate CSV export
  const csvContent = generateSmsCsv(smsRows);

  const apiKey = await getTelnyxApiKey();

  // Upload CSV to Telnyx Object Storage under a temp key
  const exportId = crypto.randomUUID();
  const tempKey = `exports/${dbUserId}/${numberId}/sms-export-${exportId}.csv`;
  await uploadToObjectStorage(tempKey, Buffer.from(csvContent, 'utf-8'), 'text/csv', apiKey);

  // Generate 15-minute pre-signed URL for the CSV
  const { url, expiresAt } = await generatePresignedUrl(tempKey, apiKey);

  return json(200, { url, expiresAt });
}

// ─── Path matching helper ────────────────────────────────────────────────────

function matchPath(
  path: string,
  pattern: string,
): Record<string, string> | null {
  const pathParts = path.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;

  try {
    // All download routes are authenticated
    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });

    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'User not found' });

    // GET /download/voicemail/:id
    const vmParams = matchPath(path, '/download/voicemail/:id');
    if (httpMethod === 'GET' && vmParams) {
      // Feature flag check: download_voicemails (Req 16.1)
      const canDownloadVoicemails = await resolveFlag(dbUserId, 'download_voicemails', pool);
      if (canDownloadVoicemails === false) {
        return json(403, {
          error: "Feature 'download_voicemails' is not available on your current plan.",
        });
      }
      return handleDownloadVoicemail(vmParams.id, dbUserId);
    }

    // GET /download/sms/:numberId
    const smsParams = matchPath(path, '/download/sms/:numberId');
    if (httpMethod === 'GET' && smsParams) {
      // Feature flag check: download_sms (Req 16.1)
      const canDownloadSms = await resolveFlag(dbUserId, 'download_sms', pool);
      if (canDownloadSms === false) {
        return json(403, {
          error: "Feature 'download_sms' is not available on your current plan.",
        });
      }
      return handleDownloadSms(smsParams.numberId, dbUserId);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Download service error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
