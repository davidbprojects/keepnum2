import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import { assertFlag } from '@keepnum/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScreeningResult {
  accepted: boolean;
  callerNameRecordingUrl?: string;
  timedOut: boolean;
}

interface TelnyxActionResponse {
  data?: { result?: string; recording_urls?: { mp3?: string } };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TELNYX_API_BASE = 'https://api.telnyx.com/v2/calls';
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 8000;
const NAME_RECORDING_TIMEOUT_MS = 10_000;

// ─── Clients (initialised once per cold start) ──────────────────────────────

const ssm = new SSMClient({});

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;

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
): Promise<TelnyxActionResponse> {
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

      if (response.ok) {
        return (await response.json()) as TelnyxActionResponse;
      }

      // Don't retry 4xx client errors (except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const text = await response.text();
        throw new Error(`Telnyx ${action} failed: ${response.status} ${text}`);
      }

      // Retry on 5xx or 429
      if (attempt < MAX_RETRIES) {
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
        await sleep(backoff);
        continue;
      }

      throw new Error(`Telnyx ${action} failed after ${MAX_RETRIES + 1} attempts: ${response.status}`);
    } catch (err) {
      if (attempt < MAX_RETRIES && (err as Error).message?.includes('fetch')) {
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Telnyx ${action} failed: exhausted retries`);
}

// ─── Screening state machine ─────────────────────────────────────────────────

/**
 * Screens an inbound call using Telnyx Call Control API.
 *
 * State machine:
 * 1. Prompt caller to state their name (speak)
 * 2. Record caller's name (record_start, 10s timeout)
 * 3. If timeout → route to voicemail (return timedOut: true)
 * 4. Play recorded name to user (play_audio)
 * 5. Gather DTMF from user: 1 = accept, 2 = reject
 * 6. If reject → route to voicemail (return accepted: false)
 */
export async function screenCall(
  callControlId: string,
  telnyxApiKey: string,
): Promise<ScreeningResult> {
  // Step 1: Prompt caller to state their name
  await telnyxCallAction(callControlId, 'speak', telnyxApiKey, {
    payload: 'Please state your name after the tone.',
    voice: 'female',
    language: 'en-US',
  });

  // Step 2: Record caller's name with 10-second timeout
  let recordingUrl: string | undefined;
  try {
    const recordResult = await Promise.race([
      telnyxCallAction(callControlId, 'record_start', telnyxApiKey, {
        format: 'mp3',
        channels: 'single',
        max_length: 10,
      }),
      sleep(NAME_RECORDING_TIMEOUT_MS).then(() => {
        throw new TimeoutError('Name recording timed out');
      }),
    ]);

    // Stop recording after caller speaks
    const stopResult = await telnyxCallAction(
      callControlId,
      'record_stop',
      telnyxApiKey,
    );

    recordingUrl =
      (recordResult as TelnyxActionResponse)?.data?.recording_urls?.mp3 ??
      (stopResult as TelnyxActionResponse)?.data?.recording_urls?.mp3;
  } catch (err) {
    if (err instanceof TimeoutError) {
      // Step 3: Caller didn't provide name → route to voicemail
      // Stop any in-progress recording before returning
      try {
        await telnyxCallAction(callControlId, 'record_stop', telnyxApiKey);
      } catch {
        // Ignore — recording may not have started
      }
      return { accepted: false, timedOut: true };
    }
    throw err;
  }

  // Step 4: Play recorded name to the user
  if (recordingUrl) {
    await telnyxCallAction(callControlId, 'play_audio', telnyxApiKey, {
      audio_url: recordingUrl,
    });
  }

  // Step 5: Gather DTMF input from user (1 = accept, 2 = reject)
  const gatherResult = await telnyxCallAction(
    callControlId,
    'gather',
    telnyxApiKey,
    {
      minimum_digits: 1,
      maximum_digits: 1,
      timeout_millis: 15_000,
      valid_digits: '12',
      inter_digit_timeout_millis: 5_000,
    },
  );

  const digit = gatherResult?.data?.result ?? '';
  const accepted = digit === '1';

  // Step 6: If rejected → caller will be routed to voicemail by call-service
  return {
    accepted,
    callerNameRecordingUrl: recordingUrl,
    timedOut: false,
  };
}

// ─── Custom error for timeout ────────────────────────────────────────────────

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
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

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { callControlId, userId } = body;

    if (!callControlId) {
      return json(400, { error: 'callControlId is required' });
    }

    // Feature flag gate: call_screening (Req 16.1, 16.9)
    if (userId) {
      const denied = await assertFlag(userId, 'call_screening', pool);
      if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };
    }

    const apiKey = await getTelnyxApiKey();
    const result = await screenCall(callControlId, apiKey);

    return json(200, result);
  } catch (err) {
    console.error('Call screening error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
