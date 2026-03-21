import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Pool } from 'pg';
import { resolveFlag, assertFlag } from '@keepnum/shared';
import type { TranscriptionStatus } from '@keepnum/shared';
import type {
  BulkMoveVoicemailsRequest,
  BulkReadVoicemailsRequest,
  BulkDeleteVoicemailsRequest,
  ShareVoicemailRequest,
  ShareExpiration,
  ApplyGreetingRequest,
  RequestCustomGreetingRequest,
  SetVoicemailSmsConfigRequest,
} from '@keepnum/shared';
import type { VoicemailFolder } from '@keepnum/shared';
import { logger, initLogger } from '@keepnum/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TelnyxVoicemailWebhookPayload {
  data: {
    event_type: string;
    payload: {
      call_control_id?: string;
      call_leg_id?: string;
      connection_id?: string;
      recording_urls?: {
        mp3?: string;
        wav?: string;
      };
      recording_id?: string;
      from?: string;
      to?: string;
      duration_secs?: number;
      transcription?: {
        text?: string;
        status?: string;
      };
      // For transcription.completed events
      media_name?: string;
      media_url?: string;
    };
  };
}

interface NumberOwner {
  parkedNumberId: string;
  userId: string;
  userEmail: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';
const TELNYX_STORAGE_BASE = 'https://api.telnyx.com/v2/storage/buckets';
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 8000;

// ─── Clients (initialised once per cold start) ──────────────────────────────

const ssm = new SSMClient({});
const ses = new SESClient({});

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;
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
    parkedNumberId: rows[0].id,
    userId: rows[0].user_id,
    userEmail: rows[0].email,
  };
}

async function lookupParkedNumberById(parkedNumberId: string): Promise<NumberOwner | null> {
  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    email: string;
  }>(
    `SELECT pn.id, pn.user_id, u.email
     FROM parked_numbers pn
     JOIN users u ON u.id = pn.user_id
     WHERE pn.id = $1 AND pn.status = 'active'
     LIMIT 1`,
    [parkedNumberId],
  );
  if (rows.length === 0) return null;
  return {
    parkedNumberId: rows[0].id,
    userId: rows[0].user_id,
    userEmail: rows[0].email,
  };
}

// ─── Telnyx Object Storage ───────────────────────────────────────────────────

async function storeAudioInObjectStorage(
  storageKey: string,
  audioBuffer: ArrayBuffer,
  apiKey: string,
): Promise<void> {
  await telnyxApiCall(
    `${TELNYX_STORAGE_BASE}/${STORAGE_BUCKET}/${encodeURIComponent(storageKey)}`,
    apiKey,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'audio/mpeg' },
      body: Buffer.from(audioBuffer),
    },
  );
}

// ─── Telnyx Transcription ────────────────────────────────────────────────────

async function triggerTranscription(
  recordingId: string,
  apiKey: string,
): Promise<void> {
  await telnyxApiCall(
    `${TELNYX_API_BASE}/recordings/${recordingId}/actions/transcribe`,
    apiKey,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

// ─── SES Email ───────────────────────────────────────────────────────────────

async function sendTranscriptionEmail(
  toEmail: string,
  callerNumber: string,
  parkedNumber: string,
  transcription: string,
  receivedAt: string,
): Promise<void> {
  await ses.send(
    new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: {
          Data: `Voicemail transcription from ${callerNumber}`,
        },
        Body: {
          Text: {
            Data: [
              `You received a voicemail on ${parkedNumber}.`,
              `From: ${callerNumber}`,
              `Received: ${receivedAt}`,
              '',
              'Transcription:',
              transcription,
            ].join('\n'),
          },
        },
      },
    }),
  );
}

async function sendTranscriptionFailureEmail(
  toEmail: string,
  callerNumber: string,
  parkedNumber: string,
  receivedAt: string,
): Promise<void> {
  await ses.send(
    new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: {
          Data: `New voicemail from ${callerNumber}`,
        },
        Body: {
          Text: {
            Data: [
              `You received a voicemail on ${parkedNumber}.`,
              `From: ${callerNumber}`,
              `Received: ${receivedAt}`,
              '',
              'Transcription is currently unavailable for this voicemail.',
              'You can listen to the audio recording in the KeepNum app.',
            ].join('\n'),
          },
        },
      },
    }),
  );
}

// ─── Webhook: POST /webhooks/telnyx/voicemail ────────────────────────────────

async function handleVoicemailRecording(
  payload: TelnyxVoicemailWebhookPayload['data']['payload'],
): Promise<APIGatewayProxyResult> {
  const recordingUrl = payload.recording_urls?.mp3 ?? payload.recording_urls?.wav;
  const recordingId = payload.recording_id;
  const callerNumber = payload.from ?? 'unknown';
  const toNumber = payload.to ?? '';
  const durationSecs = payload.duration_secs ?? 0;

  if (!recordingUrl || !recordingId) {
    return json(400, { error: 'Missing recording URL or recording ID' });
  }

  // Look up the parked number
  const owner = await lookupParkedNumber(toNumber);
  if (!owner) {
    logger.warn(`No parked number found for ${toNumber}`);
    return json(200, { message: 'Number not parked' });
  }

  const apiKey = await getTelnyxApiKey();

  // Step 1: Fetch audio from Telnyx recording URL
  const audioResponse = await telnyxApiCall(recordingUrl, apiKey);
  const audioBuffer = await audioResponse.arrayBuffer();

  // Step 2: Store audio in Telnyx Object Storage (Req 5.3)
  const voicemailId = crypto.randomUUID();
  const storageKey = `voicemails/${owner.userId}/${owner.parkedNumberId}/${voicemailId}.mp3`;
  await storeAudioInObjectStorage(storageKey, audioBuffer, apiKey);

  // Step 3: Write voicemails Aurora record (Req 5.4)
  const receivedAt = new Date().toISOString();
  await pool.query(
    `INSERT INTO voicemails (id, parked_number_id, caller_id, duration_seconds, storage_key, transcription_status, received_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
    [voicemailId, owner.parkedNumberId, callerNumber, durationSecs, storageKey, receivedAt],
  );

  // Step 4: Trigger Telnyx transcription if voicemail_transcription is enabled (Req 5.1, 16.1)
  const transcriptionEnabled = await resolveFlag(owner.userId, 'voicemail_transcription', pool);
  if (!transcriptionEnabled) {
    // Transcription not available on user's plan — skip but still store audio
    await pool.query(
      `UPDATE voicemails SET transcription_status = 'failed' WHERE id = $1`,
      [voicemailId],
    );
    return json(200, { message: 'Voicemail stored, transcription not enabled', voicemailId });
  }

  try {
    await triggerTranscription(recordingId, apiKey);
  } catch (err) {
    // Transcription trigger failed — mark as failed, still store audio (Req 5.5)
    logger.error('Failed to trigger transcription', err);
    await pool.query(
      `UPDATE voicemails SET transcription_status = 'failed' WHERE id = $1`,
      [voicemailId],
    );

    // Look up parked number phone for email
    const { rows: pnRows } = await pool.query<{ phone_number: string }>(
      `SELECT phone_number FROM parked_numbers WHERE id = $1`,
      [owner.parkedNumberId],
    );
    const parkedPhone = pnRows[0]?.phone_number ?? toNumber;

    await sendTranscriptionFailureEmail(owner.userEmail, callerNumber, parkedPhone, receivedAt);
    return json(200, { message: 'Voicemail stored, transcription failed', voicemailId });
  }

  return json(200, { message: 'Voicemail stored, transcription pending', voicemailId });
}

// ─── Webhook: Transcription completed ────────────────────────────────────────

async function handleTranscriptionCompleted(
  payload: TelnyxVoicemailWebhookPayload['data']['payload'],
): Promise<APIGatewayProxyResult> {
  const recordingId = payload.recording_id;
  const transcriptionText = payload.transcription?.text ?? null;
  const transcriptionStatus = payload.transcription?.status;

  if (!recordingId) {
    return json(400, { error: 'Missing recording ID in transcription event' });
  }

  // Find the voicemail record by matching the storage_key pattern with recording_id
  // We stored the voicemail with a UUID id, so we look up by matching the recording context
  // The voicemail was created with transcription_status='pending', find it
  const { rows: vmRows } = await pool.query<{
    id: string;
    parked_number_id: string;
    caller_id: string;
    received_at: string;
  }>(
    `SELECT v.id, v.parked_number_id, v.caller_id, v.received_at
     FROM voicemails v
     WHERE v.transcription_status = 'pending'
     ORDER BY v.received_at DESC
     LIMIT 1`,
  );

  if (vmRows.length === 0) {
    logger.warn('No pending voicemail found for transcription event');
    return json(200, { message: 'No pending voicemail found' });
  }

  const voicemail = vmRows[0];
  const owner = await lookupParkedNumberById(voicemail.parked_number_id);
  if (!owner) {
    logger.warn(`Owner not found for parked number ${voicemail.parked_number_id}`);
    return json(200, { message: 'Owner not found' });
  }

  const { rows: pnRows } = await pool.query<{ phone_number: string }>(
    `SELECT phone_number FROM parked_numbers WHERE id = $1`,
    [voicemail.parked_number_id],
  );
  const parkedPhone = pnRows[0]?.phone_number ?? '';

  if (transcriptionStatus === 'completed' && transcriptionText) {
    // Transcription success (Req 5.1, 5.2)
    const newStatus: TranscriptionStatus = 'complete';
    await pool.query(
      `UPDATE voicemails SET transcription = $1, transcription_status = $2 WHERE id = $3`,
      [transcriptionText, newStatus, voicemail.id],
    );

    // Email transcription to user (Req 5.2)
    await sendTranscriptionEmail(
      owner.userEmail,
      voicemail.caller_id ?? 'unknown',
      parkedPhone,
      transcriptionText,
      voicemail.received_at,
    );

    return json(200, { message: 'Transcription complete', voicemailId: voicemail.id });
  } else {
    // Transcription failed (Req 5.5)
    const failedStatus: TranscriptionStatus = 'failed';
    await pool.query(
      `UPDATE voicemails SET transcription_status = $1 WHERE id = $2`,
      [failedStatus, voicemail.id],
    );

    // Email user that transcription is unavailable (Req 5.5)
    await sendTranscriptionFailureEmail(
      owner.userEmail,
      voicemail.caller_id ?? 'unknown',
      parkedPhone,
      voicemail.received_at,
    );

    return json(200, { message: 'Transcription failed, user notified', voicemailId: voicemail.id });
  }
}

// ─── Route: GET /voicemails ──────────────────────────────────────────────────

async function handleListVoicemails(
  event: APIGatewayProxyEvent,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const qs = event.queryStringParameters ?? {};
  const parkedNumberId = qs.parked_number_id;

  let query = `
    SELECT v.id, v.parked_number_id, v.caller_id, v.duration_seconds,
           v.storage_key, v.transcription_status, v.received_at,
           v.folder, v.read, v.trashed_at
    FROM voicemails v
    JOIN parked_numbers pn ON pn.id = v.parked_number_id
    WHERE pn.user_id = $1 AND v.deleted_at IS NULL
  `;
  const params: unknown[] = [dbUserId];

  if (parkedNumberId) {
    params.push(parkedNumberId);
    query += ` AND v.parked_number_id = $${params.length}`;
  }

  query += ` ORDER BY v.received_at DESC`;

  const { rows } = await pool.query(query, params);
  return json(200, { items: rows });
}

// ─── Route: GET /voicemails/:id ──────────────────────────────────────────────

async function handleGetVoicemail(
  voicemailId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const { rows } = await pool.query(
    `SELECT v.id, v.parked_number_id, v.caller_id, v.duration_seconds,
            v.storage_key, v.transcription, v.transcription_status, v.received_at,
            v.folder, v.read, v.trashed_at
     FROM voicemails v
     JOIN parked_numbers pn ON pn.id = v.parked_number_id
     WHERE v.id = $1 AND pn.user_id = $2 AND v.deleted_at IS NULL
     LIMIT 1`,
    [voicemailId, dbUserId],
  );

  if (rows.length === 0) {
    return json(404, { error: 'Voicemail not found' });
  }

  return json(200, rows[0]);
}

// ─── Route: PUT /voicemails/bulk/move ─────────────────────────────────────────

async function handleBulkMove(
  body: BulkMoveVoicemailsRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'visual_voicemail_inbox', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const validFolders: VoicemailFolder[] = ['inbox', 'saved', 'trash'];
  if (!validFolders.includes(body.folder)) {
    return json(400, { error: 'Invalid folder. Must be one of: inbox, saved, trash' });
  }
  if (!body.voicemailIds?.length) {
    return json(400, { error: 'voicemailIds is required and must not be empty' });
  }

  const trashedAt = body.folder === 'trash' ? 'now()' : 'NULL';
  const { rowCount } = await pool.query(
    `UPDATE voicemails SET folder = $1, trashed_at = ${trashedAt}, read = CASE WHEN $1 = 'trash' THEN read ELSE read END
     WHERE id = ANY($2::uuid[])
       AND parked_number_id IN (SELECT id FROM parked_numbers WHERE user_id = $3)
       AND deleted_at IS NULL`,
    [body.folder, body.voicemailIds, dbUserId],
  );

  return json(200, { updated: rowCount });
}

// ─── Route: PUT /voicemails/bulk/read ─────────────────────────────────────────

async function handleBulkRead(
  body: BulkReadVoicemailsRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'visual_voicemail_inbox', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  if (!body.voicemailIds?.length) {
    return json(400, { error: 'voicemailIds is required and must not be empty' });
  }
  if (typeof body.read !== 'boolean') {
    return json(400, { error: 'read is required and must be a boolean' });
  }

  const { rowCount } = await pool.query(
    `UPDATE voicemails SET read = $1
     WHERE id = ANY($2::uuid[])
       AND parked_number_id IN (SELECT id FROM parked_numbers WHERE user_id = $3)
       AND deleted_at IS NULL`,
    [body.read, body.voicemailIds, dbUserId],
  );

  return json(200, { updated: rowCount });
}

// ─── Route: DELETE /voicemails/bulk/delete ────────────────────────────────────

async function handleBulkDelete(
  body: BulkDeleteVoicemailsRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'visual_voicemail_inbox', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  if (!body.voicemailIds?.length) {
    return json(400, { error: 'voicemailIds is required and must not be empty' });
  }

  // Permanent delete only from trash
  const { rowCount } = await pool.query(
    `UPDATE voicemails SET deleted_at = now()
     WHERE id = ANY($1::uuid[])
       AND folder = 'trash'
       AND parked_number_id IN (SELECT id FROM parked_numbers WHERE user_id = $2)
       AND deleted_at IS NULL`,
    [body.voicemailIds, dbUserId],
  );

  return json(200, { deleted: rowCount });
}

// ─── Route: GET /voicemails/search ───────────────────────────────────────────

async function handleSearchVoicemails(
  event: APIGatewayProxyEvent,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'visual_voicemail_inbox', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const qs = event.queryStringParameters ?? {};
  let query = `
    SELECT v.id, v.parked_number_id, v.caller_id, v.duration_seconds,
           v.storage_key, v.transcription, v.transcription_status, v.received_at,
           v.folder, v.read, v.trashed_at
    FROM voicemails v
    JOIN parked_numbers pn ON pn.id = v.parked_number_id
    WHERE pn.user_id = $1 AND v.deleted_at IS NULL
  `;
  const params: unknown[] = [dbUserId];

  if (qs.callerId) {
    params.push(qs.callerId);
    query += ` AND v.caller_id = $${params.length}`;
  }
  if (qs.q) {
    params.push(`%${qs.q}%`);
    query += ` AND v.transcription ILIKE $${params.length}`;
  }
  if (qs.dateFrom) {
    params.push(qs.dateFrom);
    query += ` AND v.received_at >= $${params.length}`;
  }
  if (qs.dateTo) {
    params.push(qs.dateTo);
    query += ` AND v.received_at <= $${params.length}`;
  }
  if (qs.folder) {
    params.push(qs.folder);
    query += ` AND v.folder = $${params.length}`;
  }

  query += ` ORDER BY v.received_at DESC`;

  const { rows } = await pool.query(query, params);
  return json(200, { items: rows });
}

// ─── Route: POST /voicemails/:id/share ───────────────────────────────────────

const SHARE_EXPIRATION_MS: Record<ShareExpiration, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

async function handleShareVoicemail(
  voicemailId: string,
  body: ShareVoicemailRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'voicemail_sharing', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  if (!body.expiresIn || !SHARE_EXPIRATION_MS[body.expiresIn]) {
    return json(400, { error: 'expiresIn is required and must be one of: 24h, 7d, 30d' });
  }

  // Verify ownership
  const { rows: vmRows } = await pool.query(
    `SELECT v.id FROM voicemails v
     JOIN parked_numbers pn ON pn.id = v.parked_number_id
     WHERE v.id = $1 AND pn.user_id = $2 AND v.deleted_at IS NULL
     LIMIT 1`,
    [voicemailId, dbUserId],
  );
  if (vmRows.length === 0) return json(404, { error: 'Voicemail not found' });

  const shareToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + SHARE_EXPIRATION_MS[body.expiresIn]).toISOString();

  await pool.query(
    `INSERT INTO voicemail_shares (voicemail_id, user_id, share_token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [voicemailId, dbUserId, shareToken, expiresAt],
  );

  const shareUrl = `${process.env.APP_BASE_URL ?? 'https://app.keepnum.com'}/shared/voicemail/${shareToken}`;

  return json(201, { shareToken, shareUrl, expiresAt });
}

// ─── Route: DELETE /voicemails/:id/share/:shareToken ─────────────────────────

async function handleRevokeShare(
  voicemailId: string,
  shareToken: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const { rowCount } = await pool.query(
    `UPDATE voicemail_shares SET revoked = true
     WHERE voicemail_id = $1 AND share_token = $2 AND user_id = $3 AND revoked = false`,
    [voicemailId, shareToken, dbUserId],
  );

  if (!rowCount) return json(404, { error: 'Share link not found' });
  return json(200, { message: 'Share link revoked' });
}

// ─── Route: GET /shared/voicemail/:shareToken (public, no auth) ──────────────

async function handleGetSharedVoicemail(
  shareToken: string,
): Promise<APIGatewayProxyResult> {
  const { rows } = await pool.query(
    `SELECT vs.expires_at, vs.revoked,
            v.storage_key, v.transcription, v.caller_id, v.duration_seconds, v.received_at
     FROM voicemail_shares vs
     JOIN voicemails v ON v.id = vs.voicemail_id
     WHERE vs.share_token = $1
     LIMIT 1`,
    [shareToken],
  );

  if (rows.length === 0) return json(404, { error: 'Shared voicemail not found' });

  const share = rows[0];
  if (share.revoked || new Date(share.expires_at) < new Date()) {
    return json(410, { error: 'This shared voicemail link has expired or been revoked' });
  }

  return json(200, {
    audioUrl: share.storage_key,
    transcription: share.transcription,
    callerId: share.caller_id,
    duration: share.duration_seconds,
    receivedAt: share.received_at,
  });
}

// ─── Route: GET /recordings ──────────────────────────────────────────────────

async function handleListRecordings(
  event: APIGatewayProxyEvent,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'call_recording', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const qs = event.queryStringParameters ?? {};
  let query = `
    SELECT id, number_id, number_type, call_id, caller_id, direction,
           duration_seconds, storage_key, consent_completed, created_at
    FROM call_recordings
    WHERE user_id = $1 AND deleted_at IS NULL
  `;
  const params: unknown[] = [dbUserId];

  if (qs.numberId) {
    params.push(qs.numberId);
    query += ` AND number_id = $${params.length}`;
  }
  if (qs.from) {
    params.push(qs.from);
    query += ` AND created_at >= $${params.length}`;
  }
  if (qs.to) {
    params.push(qs.to);
    query += ` AND created_at <= $${params.length}`;
  }

  query += ` ORDER BY created_at DESC`;

  const { rows } = await pool.query(query, params);
  return json(200, { items: rows });
}

// ─── Route: GET /recordings/:callId ──────────────────────────────────────────

async function handleGetRecording(
  callId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'call_recording', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const { rows } = await pool.query(
    `SELECT id, number_id, number_type, call_id, caller_id, direction,
            duration_seconds, storage_key, consent_completed, created_at
     FROM call_recordings
     WHERE call_id = $1 AND user_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [callId, dbUserId],
  );

  if (rows.length === 0) return json(404, { error: 'Recording not found' });
  return json(200, rows[0]);
}

// ─── Route: GET /download/recording/:callId ──────────────────────────────────

async function handleDownloadRecording(
  callId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'call_recording', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const { rows } = await pool.query<{ storage_key: string }>(
    `SELECT storage_key FROM call_recordings
     WHERE call_id = $1 AND user_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [callId, dbUserId],
  );

  if (rows.length === 0) return json(404, { error: 'Recording not found' });

  const apiKey = await getTelnyxApiKey();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const url = `${TELNYX_STORAGE_BASE}/${STORAGE_BUCKET}/${encodeURIComponent(rows[0].storage_key)}?token=${apiKey}`;

  return json(200, { url, expiresAt });
}

// ─── Route: GET /greetings/marketplace ───────────────────────────────────────

async function handleListMarketplaceGreetings(
  event: APIGatewayProxyEvent,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'greetings_marketplace', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const qs = event.queryStringParameters ?? {};
  const page = parseInt(qs.page ?? '1', 10);
  const limit = Math.min(parseInt(qs.limit ?? '20', 10), 100);
  const offset = (page - 1) * limit;

  let query = `SELECT id, title, category, duration_seconds, voice_talent, preview_audio_key, created_at
               FROM marketplace_greetings WHERE active = true`;
  const params: unknown[] = [];

  if (qs.category) {
    params.push(qs.category);
    query += ` AND category = $${params.length}`;
  }

  // Count total
  const countQuery = query.replace(/SELECT .+ FROM/, 'SELECT COUNT(*)::int AS total FROM');
  const { rows: countRows } = await pool.query<{ total: number }>(countQuery, params);
  const total = countRows[0]?.total ?? 0;

  params.push(limit, offset);
  query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const { rows } = await pool.query(query, params);
  return json(200, { items: rows, total, page, limit });
}

// ─── Route: GET /greetings/marketplace/:id/preview ───────────────────────────

async function handlePreviewGreeting(
  greetingId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'greetings_marketplace', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const { rows } = await pool.query<{ preview_audio_key: string }>(
    `SELECT preview_audio_key FROM marketplace_greetings WHERE id = $1 AND active = true LIMIT 1`,
    [greetingId],
  );

  if (rows.length === 0) return json(404, { error: 'Greeting not found' });

  const apiKey = await getTelnyxApiKey();
  const previewAudioUrl = `${TELNYX_STORAGE_BASE}/${STORAGE_BUCKET}/${encodeURIComponent(rows[0].preview_audio_key)}?token=${apiKey}`;

  return json(200, { previewAudioUrl });
}

// ─── Route: POST /greetings/marketplace/:id/apply ────────────────────────────

async function handleApplyGreeting(
  greetingId: string,
  body: ApplyGreetingRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'greetings_marketplace', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  if (!body.numberId || !body.numberType) {
    return json(400, { error: 'numberId and numberType are required' });
  }

  // Verify marketplace greeting exists
  const { rows: mgRows } = await pool.query(
    `SELECT id FROM marketplace_greetings WHERE id = $1 AND active = true LIMIT 1`,
    [greetingId],
  );
  if (mgRows.length === 0) return json(404, { error: 'Greeting not found' });

  // Store reference (not copy) in greetings table
  const { rows } = await pool.query(
    `INSERT INTO greetings (parked_number_id, greeting_type, marketplace_greeting_id)
     VALUES ($1, 'default', $2)
     ON CONFLICT (parked_number_id, greeting_type)
       DO UPDATE SET marketplace_greeting_id = EXCLUDED.marketplace_greeting_id,
                     audio_key = NULL, tts_text = NULL
     RETURNING id, parked_number_id, greeting_type, marketplace_greeting_id, created_at`,
    [body.numberId, greetingId],
  );

  return json(200, rows[0]);
}

// ─── Route: POST /greetings/custom-request ───────────────────────────────────

async function handleCustomGreetingRequest(
  body: RequestCustomGreetingRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'greetings_marketplace', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  if (!body.script || !body.numberId || !body.numberType) {
    return json(400, { error: 'script, numberId, and numberType are required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO custom_greeting_requests (user_id, number_id, number_type, script)
     VALUES ($1, $2, $3, $4)
     RETURNING id, status, requested_at`,
    [dbUserId, body.numberId, body.numberType, body.script],
  );

  return json(201, rows[0]);
}

// ─── Route: PUT /voicemails/sms-config ───────────────────────────────────────

async function handleSetSmsConfig(
  body: SetVoicemailSmsConfigRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'voicemail_to_sms', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  if (!body.numberId || !body.numberType || !body.destinationNumber) {
    return json(400, { error: 'numberId, numberType, and destinationNumber are required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO voicemail_sms_config (user_id, number_id, number_type, enabled, destination_number)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, number_id)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     destination_number = EXCLUDED.destination_number,
                     number_type = EXCLUDED.number_type,
                     updated_at = now()
     RETURNING id, number_id, number_type, enabled, destination_number`,
    [dbUserId, body.numberId, body.numberType, body.enabled ?? true, body.destinationNumber],
  );

  return json(200, rows[0]);
}

// ─── Route: GET /voicemails/sms-config ───────────────────────────────────────

async function handleGetSmsConfig(
  event: APIGatewayProxyEvent,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'voicemail_to_sms', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const qs = event.queryStringParameters ?? {};
  let query = `SELECT id, number_id, number_type, enabled, destination_number, created_at, updated_at
               FROM voicemail_sms_config WHERE user_id = $1`;
  const params: unknown[] = [dbUserId];

  if (qs.numberId) {
    params.push(qs.numberId);
    query += ` AND number_id = $${params.length}`;
  }

  const { rows } = await pool.query(query, params);
  return json(200, { items: rows });
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
    // ── Webhook routes (unauthenticated — WAF-allowlisted) ───────────────
    if (httpMethod === 'POST' && path === '/webhooks/telnyx/voicemail') {
      const body: TelnyxVoicemailWebhookPayload = event.body
        ? JSON.parse(event.body)
        : {};

      const eventType = body?.data?.event_type;

      if (eventType === 'recording.completed' || eventType === 'call.recording.saved') {
        return handleVoicemailRecording(body.data.payload);
      }

      if (eventType === 'recording.transcription.completed') {
        return handleTranscriptionCompleted(body.data.payload);
      }

      // Acknowledge other event types
      return json(200, { message: 'Event acknowledged' });
    }

    // ── Public routes (no auth) ──────────────────────────────────────────

    // GET /shared/voicemail/:shareToken
    const sharedParams = matchPath(path, '/shared/voicemail/:shareToken');
    if (httpMethod === 'GET' && sharedParams) {
      return handleGetSharedVoicemail(sharedParams.shareToken);
    }

    // ── Authenticated routes ─────────────────────────────────────────────
    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });

    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'User not found' });

    // ── Voicemail bulk operations (4.1) ──────────────────────────────────

    // PUT /voicemails/bulk/move
    if (httpMethod === 'PUT' && path === '/voicemails/bulk/move') {
      const body: BulkMoveVoicemailsRequest = JSON.parse(event.body ?? '{}');
      return handleBulkMove(body, dbUserId);
    }

    // PUT /voicemails/bulk/read
    if (httpMethod === 'PUT' && path === '/voicemails/bulk/read') {
      const body: BulkReadVoicemailsRequest = JSON.parse(event.body ?? '{}');
      return handleBulkRead(body, dbUserId);
    }

    // DELETE /voicemails/bulk/delete
    if (httpMethod === 'DELETE' && path === '/voicemails/bulk/delete') {
      const body: BulkDeleteVoicemailsRequest = JSON.parse(event.body ?? '{}');
      return handleBulkDelete(body, dbUserId);
    }

    // GET /voicemails/search
    if (httpMethod === 'GET' && path === '/voicemails/search') {
      return handleSearchVoicemails(event, dbUserId);
    }

    // ── Voicemail SMS config (4.5) ───────────────────────────────────────

    // PUT /voicemails/sms-config
    if (httpMethod === 'PUT' && path === '/voicemails/sms-config') {
      const body: SetVoicemailSmsConfigRequest = JSON.parse(event.body ?? '{}');
      return handleSetSmsConfig(body, dbUserId);
    }

    // GET /voicemails/sms-config
    if (httpMethod === 'GET' && path === '/voicemails/sms-config') {
      return handleGetSmsConfig(event, dbUserId);
    }

    // GET /voicemails
    if (httpMethod === 'GET' && path === '/voicemails') {
      return handleListVoicemails(event, dbUserId);
    }

    // ── Voicemail sharing (4.2) ──────────────────────────────────────────

    // POST /voicemails/:id/share
    let params = matchPath(path, '/voicemails/:id/share');
    if (httpMethod === 'POST' && params) {
      const body: ShareVoicemailRequest = JSON.parse(event.body ?? '{}');
      return handleShareVoicemail(params.id, body, dbUserId);
    }

    // DELETE /voicemails/:id/share/:shareToken
    params = matchPath(path, '/voicemails/:id/share/:shareToken');
    if (httpMethod === 'DELETE' && params) {
      return handleRevokeShare(params.id, params.shareToken, dbUserId);
    }

    // GET /voicemails/:id
    params = matchPath(path, '/voicemails/:id');
    if (httpMethod === 'GET' && params) {
      return handleGetVoicemail(params.id, dbUserId);
    }

    // ── Call recordings (4.3) ────────────────────────────────────────────

    // GET /recordings
    if (httpMethod === 'GET' && path === '/recordings') {
      return handleListRecordings(event, dbUserId);
    }

    // GET /download/recording/:callId
    params = matchPath(path, '/download/recording/:callId');
    if (httpMethod === 'GET' && params) {
      return handleDownloadRecording(params.callId, dbUserId);
    }

    // GET /recordings/:callId
    params = matchPath(path, '/recordings/:callId');
    if (httpMethod === 'GET' && params) {
      return handleGetRecording(params.callId, dbUserId);
    }

    // ── Greetings marketplace (4.4) ──────────────────────────────────────

    // GET /greetings/marketplace
    if (httpMethod === 'GET' && path === '/greetings/marketplace') {
      return handleListMarketplaceGreetings(event, dbUserId);
    }

    // GET /greetings/marketplace/:id/preview
    params = matchPath(path, '/greetings/marketplace/:id/preview');
    if (httpMethod === 'GET' && params) {
      return handlePreviewGreeting(params.id, dbUserId);
    }

    // POST /greetings/marketplace/:id/apply
    params = matchPath(path, '/greetings/marketplace/:id/apply');
    if (httpMethod === 'POST' && params) {
      const body: ApplyGreetingRequest = JSON.parse(event.body ?? '{}');
      return handleApplyGreeting(params.id, body, dbUserId);
    }

    // POST /greetings/custom-request
    if (httpMethod === 'POST' && path === '/greetings/custom-request') {
      const body: RequestCustomGreetingRequest = JSON.parse(event.body ?? '{}');
      return handleCustomGreetingRequest(body, dbUserId);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    logger.error('Voicemail service error', err);
    return json(500, { error: 'Internal server error' });
  }
}
