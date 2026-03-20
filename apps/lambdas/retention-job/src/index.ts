/**
 * retention-job Lambda
 *
 * EventBridge-scheduled daily job that enforces retention policies.
 * Scans Aurora for voicemails and SMS messages past their retention window,
 * deletes objects from Telnyx Object Storage, and sets deleted_at on DB records.
 *
 * Requirements: 6.2, 6.3, 6.4
 */

import { ScheduledEvent } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import { RetentionPolicy } from '@keepnum/shared';

// ─── Configuration ────────────────────────────────────────────────────────────

const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH ?? '/keepnum/telnyx-api-key';
const TELNYX_STORAGE_BASE_URL =
  process.env.TELNYX_STORAGE_BASE_URL ?? 'https://api.telnyx.com/v2/storage';
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 8000;

const ssm = new SSMClient({});
let cachedTelnyxApiKey: string | undefined;

const pool = new Pool({
  host: process.env.AURORA_HOST,
  port: Number(process.env.AURORA_PORT ?? '5432'),
  database: process.env.AURORA_DB ?? 'keepnum',
  user: process.env.AURORA_USER,
  password: process.env.AURORA_PASSWORD,
  ssl: process.env.AURORA_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 5,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Telnyx API call with exponential backoff retry (3 retries, max 8s).
 * Returns the Response object. For 404 on DELETE, returns the response
 * without throwing so callers can handle "not found" gracefully.
 */
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

      // Return 404 directly so callers can handle "object not found"
      if (response.status === 404) return response;

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

/**
 * Convert a retention policy string to a number of days.
 * Returns null for 'forever' (never delete).
 */
function retentionDays(policy: RetentionPolicy): number | null {
  switch (policy) {
    case '30d':
      return 30;
    case '60d':
      return 60;
    case '90d':
      return 90;
    case 'forever':
      return null;
  }
}

interface ParkedNumberRetention {
  id: string;
  retention_policy: RetentionPolicy;
}

interface ExpiredVoicemail {
  id: string;
  storage_key: string;
}

interface ExpiredSms {
  id: string;
  media_keys: string[];
}

/**
 * Delete a single object from Telnyx Object Storage.
 * Logs a warning if the object is not found (404) but does not throw.
 */
async function deleteStorageObject(key: string, apiKey: string): Promise<void> {
  const url = `${TELNYX_STORAGE_BASE_URL}/${encodeURIComponent(key)}`;
  const response = await telnyxApiCall(url, apiKey, { method: 'DELETE' });

  if (response.status === 404) {
    console.warn(`[retention-job] Object not found in storage (already deleted?): ${key}`);
    return;
  }

  if (!response.ok) {
    throw new Error(`Failed to delete storage object ${key}: ${response.status}`);
  }
}

// ─── Core retention logic ─────────────────────────────────────────────────────

/**
 * Process expired voicemails for a single parked number.
 * Deletes storage objects and marks records as deleted.
 */
async function processExpiredVoicemails(
  parkedNumberId: string,
  cutoffDate: Date,
  apiKey: string,
): Promise<number> {
  const { rows: expired } = await pool.query<ExpiredVoicemail>(
    `SELECT id, storage_key FROM voicemails
     WHERE parked_number_id = $1
       AND received_at < $2
       AND deleted_at IS NULL`,
    [parkedNumberId, cutoffDate.toISOString()],
  );

  let deletedCount = 0;

  for (const vm of expired) {
    try {
      await deleteStorageObject(vm.storage_key, apiKey);
    } catch (err) {
      console.error(`[retention-job] Failed to delete voicemail storage object ${vm.storage_key}:`, err);
      // Still mark as deleted in DB — storage cleanup can be retried separately
    }

    await pool.query(
      `UPDATE voicemails SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [vm.id],
    );
    deletedCount++;
  }

  return deletedCount;
}

/**
 * Process expired SMS messages for a single parked number.
 * Deletes all media_keys from storage and marks records as deleted.
 */
async function processExpiredSmsMessages(
  parkedNumberId: string,
  cutoffDate: Date,
  apiKey: string,
): Promise<number> {
  const { rows: expired } = await pool.query<ExpiredSms>(
    `SELECT id, media_keys FROM sms_messages
     WHERE parked_number_id = $1
       AND received_at < $2
       AND deleted_at IS NULL`,
    [parkedNumberId, cutoffDate.toISOString()],
  );

  let deletedCount = 0;

  for (const sms of expired) {
    // Delete all media objects for this SMS
    for (const key of sms.media_keys) {
      try {
        await deleteStorageObject(key, apiKey);
      } catch (err) {
        console.error(`[retention-job] Failed to delete SMS media object ${key}:`, err);
        // Still mark as deleted — storage cleanup can be retried separately
      }
    }

    await pool.query(
      `UPDATE sms_messages SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [sms.id],
    );
    deletedCount++;
  }

  return deletedCount;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handler(_event: ScheduledEvent): Promise<void> {
  console.log('[retention-job] Starting daily retention enforcement');

  const apiKey = await getTelnyxApiKey();

  // 1. Query all active parked numbers with their retention policy
  const { rows: parkedNumbers } = await pool.query<ParkedNumberRetention>(
    `SELECT id, retention_policy FROM parked_numbers WHERE status = 'active'`,
  );

  console.log(`[retention-job] Found ${parkedNumbers.length} active parked numbers`);

  let totalVoicemailsDeleted = 0;
  let totalSmsDeleted = 0;

  for (const pn of parkedNumbers) {
    const days = retentionDays(pn.retention_policy);

    // 'forever' — skip this number entirely
    if (days === null) {
      continue;
    }

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Process voicemails and SMS independently (Req 6.3)
    const vmDeleted = await processExpiredVoicemails(pn.id, cutoffDate, apiKey);
    const smsDeleted = await processExpiredSmsMessages(pn.id, cutoffDate, apiKey);

    if (vmDeleted > 0 || smsDeleted > 0) {
      console.log(
        `[retention-job] Parked number ${pn.id} (policy=${pn.retention_policy}): ` +
          `deleted ${vmDeleted} voicemails, ${smsDeleted} SMS messages`,
      );
    }

    totalVoicemailsDeleted += vmDeleted;
    totalSmsDeleted += smsDeleted;
  }

  console.log(
    `[retention-job] Completed. Total deleted: ${totalVoicemailsDeleted} voicemails, ${totalSmsDeleted} SMS messages`,
  );

  // ── New cleanup tasks ──────────────────────────────────────────────────────

  // Trash auto-deletion: permanently delete voicemails in trash for 30+ days
  const { rowCount: trashDeleted } = await pool.query(
    `DELETE FROM voicemails WHERE folder = 'trash' AND trashed_at < now() - interval '30 days'`,
  );
  if (trashDeleted && trashDeleted > 0) {
    console.log(`[retention-job] Trash auto-deletion: ${trashDeleted} voicemails permanently deleted`);
  }

  // Call recording cleanup: apply retention policy to recordings
  for (const pn of parkedNumbers) {
    const days = retentionDays(pn.retention_policy);
    if (days === null) continue;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const { rowCount: recDeleted } = await pool.query(
      `DELETE FROM call_recordings WHERE parked_number_id = $1 AND recorded_at < $2`,
      [pn.id, cutoffDate.toISOString()],
    );
    if (recDeleted && recDeleted > 0) {
      console.log(`[retention-job] Recording cleanup for ${pn.id}: ${recDeleted} recordings deleted`);
    }
  }

  // Expired share link cleanup
  const { rowCount: sharesDeleted } = await pool.query(
    `DELETE FROM voicemail_shares WHERE expires_at < now()`,
  );
  if (sharesDeleted && sharesDeleted > 0) {
    console.log(`[retention-job] Share link cleanup: ${sharesDeleted} expired shares deleted`);
  }

  // Expired caller ID cache cleanup
  const { rowCount: cacheDeleted } = await pool.query(
    `DELETE FROM caller_id_cache WHERE expires_at < now()`,
  );
  if (cacheDeleted && cacheDeleted > 0) {
    console.log(`[retention-job] Caller ID cache cleanup: ${cacheDeleted} expired entries deleted`);
  }

  console.log('[retention-job] All cleanup tasks completed');
}
