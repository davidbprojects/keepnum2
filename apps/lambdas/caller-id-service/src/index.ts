import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import { assertFlag } from '@keepnum/shared';

const ssm = new SSMClient({});
const pool = new Pool({
  host: process.env.DB_HOST, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
const CALLER_ID_API_KEY_SSM_PATH = process.env.CALLER_ID_API_KEY_SSM_PATH ?? '/keepnum/caller-id-api-key';
const CACHE_TTL_DAYS = 30;
let cachedApiKey: string | undefined;

async function getCallerIdApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const r = await ssm.send(new GetParameterCommand({ Name: CALLER_ID_API_KEY_SSM_PATH, WithDecryption: true }));
  cachedApiKey = r.Parameter?.Value ?? '';
  return cachedApiKey;
}

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function getUserId(event: APIGatewayProxyEvent): string | undefined {
  return event.requestContext.authorizer?.claims?.sub as string | undefined;
}
async function getDbUserId(cognitoSub: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE cognito_id = $1 AND deleted_at IS NULL LIMIT 1`, [cognitoSub]);
  return rows[0]?.id ?? null;
}
function matchPath(path: string, pattern: string): Record<string, string> | null {
  const pp = path.split('/').filter(Boolean), pt = pattern.split('/').filter(Boolean);
  if (pp.length !== pt.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pt.length; i++) {
    if (pt[i].startsWith(':')) params[pt[i].slice(1)] = pp[i];
    else if (pt[i] !== pp[i]) return null;
  }
  return params;
}

interface CallerIdResult {
  name: string; city: string; state: string; carrier: string; spam_score: number;
}

const UNKNOWN_RESULT: CallerIdResult = { name: 'Unknown', city: '', state: '', carrier: '', spam_score: 0 };

async function lookupPhone(phoneNumber: string): Promise<CallerIdResult> {
  // Check cache first
  const { rows: cached } = await pool.query(
    `SELECT name, city, state, carrier, spam_score FROM caller_id_cache
     WHERE phone_number = $1 AND expires_at > now() LIMIT 1`, [phoneNumber]);
  if (cached[0]) return cached[0] as CallerIdResult;

  // Call external provider
  try {
    const apiKey = await getCallerIdApiKey();
    const res = await fetch(`https://api.callerid-provider.com/v1/lookup/${encodeURIComponent(phoneNumber)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return UNKNOWN_RESULT;
    const data: any = await res.json();
    const result: CallerIdResult = {
      name: data.name ?? 'Unknown', city: data.city ?? '', state: data.state ?? '',
      carrier: data.carrier ?? '', spam_score: Math.max(0, Math.min(100, data.spam_score ?? 0)),
    };

    // Cache result
    await pool.query(
      `INSERT INTO caller_id_cache (phone_number, name, city, state, carrier, spam_score, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + interval '${CACHE_TTL_DAYS} days')
       ON CONFLICT (phone_number) DO UPDATE SET name=$2, city=$3, state=$4, carrier=$5, spam_score=$6, expires_at=now() + interval '${CACHE_TTL_DAYS} days'`,
      [phoneNumber, result.name, result.city, result.state, result.carrier, result.spam_score]);

    return result;
  } catch {
    return UNKNOWN_RESULT;
  }
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;
  try {
    // Internal endpoint (service-to-service, no user auth)
    let params = matchPath(path, '/internal/caller-id/:phoneNumber');
    if (params && httpMethod === 'GET') {
      const result = await lookupPhone(params.phoneNumber);
      return json(200, result);
    }

    // User-facing endpoints
    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });
    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'Unauthorized' });

    params = matchPath(path, '/caller-id/lookup/:phoneNumber');
    if (params && httpMethod === 'GET') {
      const flagBlock = await assertFlag(dbUserId, 'caller_id_lookup', pool);
      if (flagBlock) return flagBlock;
      const result = await lookupPhone(params.phoneNumber);
      return json(200, result);
    }

    if (httpMethod === 'POST' && path === '/caller-id/lookup') {
      const flagBlock = await assertFlag(dbUserId, 'caller_id_lookup', pool);
      if (flagBlock) return flagBlock;
      const body = JSON.parse(event.body ?? '{}');
      if (!body.phone_number) return json(400, { error: 'phone_number is required' });
      const result = await lookupPhone(body.phone_number);
      return json(200, result);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
