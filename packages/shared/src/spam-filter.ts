/**
 * Shared spam filter helper — importable by call-service and sms-service.
 *
 * Calls the Telnyx Caller ID lookup API to retrieve a spam reputation score.
 * Threshold: score >= 70 is considered spam.
 */

export interface SpamCheckResult {
  isSpam: boolean;
  score: number;
}

const SPAM_THRESHOLD = 70;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Evaluate a caller/sender against Telnyx spam reputation data.
 *
 * @param callerId  E.164 phone number to check
 * @param telnyxApiKey  Telnyx API key for authentication
 * @returns Spam check result with score and boolean flag
 */
export async function checkSpam(
  callerId: string,
  telnyxApiKey: string,
): Promise<SpamCheckResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `https://api.telnyx.com/v2/phone_numbers/${encodeURIComponent(callerId)}/caller_id`,
        {
          headers: {
            Authorization: `Bearer ${telnyxApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!res.ok) {
        // Non-retryable client errors
        if (res.status >= 400 && res.status < 500) {
          return { isSpam: false, score: 0 };
        }
        throw new Error(`Telnyx API error: ${res.status}`);
      }

      const data = (await res.json()) as {
        data?: { spam_score?: number };
      };

      const score = data.data?.spam_score ?? 0;
      return { isSpam: score >= SPAM_THRESHOLD, score };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, 8000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.warn('Telnyx spam check failed after retries:', lastError);
  // Fail open — don't block calls/SMS if spam check is unavailable
  return { isSpam: false, score: 0 };
}
