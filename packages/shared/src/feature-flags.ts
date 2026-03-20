/**
 * Feature flag resolver — three-level priority chain.
 *
 * Priority (highest first):
 *   1. user_feature_overrides  — admin-set per-user override
 *   2. package_flags           — value from the user's active package
 *   3. feature_flags           — system-level global default
 *
 * Fails closed: returns false if no value is found at any level.
 */

import type { FlagValue } from './types/aurora';

/** Minimal DB client interface — compatible with pg's Pool/Client. */
export interface DbClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
}

/** All boolean feature flag names. */
export type BooleanFlagName =
  | 'call_parking'
  | 'call_forwarding'
  | 'sms_forwarding_sms'
  | 'sms_forwarding_email'
  | 'voicemail_transcription'
  | 'voicemail_email_delivery'
  | 'download_voicemails'
  | 'download_sms'
  | 'call_logs'
  | 'sms_logs'
  | 'spam_filtering'
  | 'call_screening'
  | 'number_search'
  | 'youmail_caller_rules'
  | 'youmail_block_list'
  | 'youmail_custom_greetings'
  | 'youmail_smart_greetings'
  | 'retention_30d'
  | 'retention_60d'
  | 'retention_90d'
  | 'retention_forever'
  // YouMail feature parity flags
  | 'visual_voicemail_inbox'
  | 'virtual_numbers'
  | 'ivr_auto_attendant'
  | 'auto_reply_sms'
  | 'unified_inbox'
  | 'privacy_scan'
  | 'push_notifications'
  | 'greetings_marketplace'
  | 'caller_id_lookup'
  | 'voicemail_to_sms'
  | 'smart_routing'
  | 'dnd_scheduling'
  | 'voicemail_sharing'
  | 'call_recording'
  | 'conference_calling';

/** All numeric limit flag names. */
export type NumericFlagName =
  | 'max_parked_numbers'
  | 'max_sms_storage_mb'
  | 'max_voicemail_storage_mb'
  // YouMail feature parity numeric flags
  | 'max_virtual_numbers'
  | 'max_conference_participants';

export type FlagName = BooleanFlagName | NumericFlagName;

/**
 * Resolves the effective value of a feature flag for a given user.
 *
 * Evaluation order:
 *   1. user_feature_overrides (highest priority)
 *   2. package_flags for the user's active subscription
 *   3. feature_flags system-level default
 *   4. false (fail closed)
 */
export async function resolveFlag(
  userId: string,
  flagName: FlagName,
  db: DbClient
): Promise<FlagValue> {
  // 1. User-level override
  const userOverride = await db.query<{ value: FlagValue }>(
    `SELECT value FROM user_feature_overrides
     WHERE user_id = $1 AND flag_name = $2
     LIMIT 1`,
    [userId, flagName]
  );
  if (userOverride.rows.length > 0) {
    return userOverride.rows[0].value;
  }

  // 2. Package-level flag (from the user's active subscription)
  const packageFlag = await db.query<{ value: FlagValue }>(
    `SELECT pf.value
     FROM package_flags pf
     JOIN subscriptions s ON s.package_id = pf.package_id
     WHERE s.user_id = $1
       AND s.status = 'active'
       AND pf.flag_name = $2
     LIMIT 1`,
    [userId, flagName]
  );
  if (packageFlag.rows.length > 0) {
    return packageFlag.rows[0].value;
  }

  // 3. System-level default
  const systemDefault = await db.query<{ value: FlagValue }>(
    `SELECT value FROM feature_flags
     WHERE flag_name = $1
     LIMIT 1`,
    [flagName]
  );
  if (systemDefault.rows.length > 0) {
    return systemDefault.rows[0].value;
  }

  // Fail closed
  return false;
}

/**
 * Asserts a boolean flag is enabled for a user.
 * Returns a 403 response object if disabled, or null if allowed.
 */
export async function assertFlag(
  userId: string,
  flagName: BooleanFlagName,
  db: DbClient
): Promise<{ statusCode: 403; body: string } | null> {
  const value = await resolveFlag(userId, flagName, db);
  if (!value) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: `Feature '${flagName}' is not available on your current plan.`,
      }),
    };
  }
  return null;
}

/**
 * Asserts a numeric limit flag is not exceeded.
 * Returns a 403 response object if the current count meets or exceeds the limit.
 */
export async function assertNumericLimit(
  userId: string,
  flagName: NumericFlagName,
  currentCount: number,
  db: DbClient
): Promise<{ statusCode: 403; body: string } | null> {
  const limit = await resolveFlag(userId, flagName, db);
  if (typeof limit === 'number' && currentCount >= limit) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: `You have reached the maximum allowed value for '${flagName}' on your current plan.`,
      }),
    };
  }
  return null;
}
