import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import { assertFlag, assertNumericLimit } from '@keepnum/shared';
import { logger, initLogger } from '@keepnum/shared';

// ─── Clients ─────────────────────────────────────────────────────────────────

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
    new GetParameterCommand({ Name: TELNYX_API_KEY_SSM_PATH, WithDecryption: true }),
  );
  cachedTelnyxApiKey = result.Parameter?.Value ?? '';
  return cachedTelnyxApiKey;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function getUserId(event: APIGatewayProxyEvent): string | undefined {
  return event.requestContext.authorizer?.claims?.sub as string | undefined;
}

async function getDbUserId(cognitoSub: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE cognito_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [cognitoSub],
  );
  return rows[0]?.id ?? null;
}

function matchPath(path: string, pattern: string): Record<string, string> | null {
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

// ─── Route handlers ──────────────────────────────────────────────────────────

async function handleSearchAvailable(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;

  const areaCode = event.queryStringParameters?.area_code ?? '';
  const region = event.queryStringParameters?.region ?? '';
  const pattern = event.queryStringParameters?.pattern ?? '';

  const apiKey = await getTelnyxApiKey();
  const params = new URLSearchParams();
  if (areaCode) params.set('filter[national_destination_code]', areaCode);
  if (region) params.set('filter[administrative_area]', region);
  if (pattern) params.set('filter[phone_number][contains]', pattern);
  params.set('filter[limit]', '20');

  const res = await fetch(`https://api.telnyx.com/v2/available_phone_numbers?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data: any = await res.json();
  return json(200, { numbers: data.data ?? [] });
}

async function handleProvision(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM virtual_numbers WHERE user_id = $1 AND released_at IS NULL`, [dbUserId]);
  const limitBlock = await assertNumericLimit(dbUserId, 'max_virtual_numbers', countRows[0]?.count ?? 0, pool);
  if (limitBlock) return limitBlock;

  const body = JSON.parse(event.body ?? '{}');
  const { phone_number, label } = body;
  if (!phone_number) return json(400, { error: 'phone_number is required' });

  const apiKey = await getTelnyxApiKey();
  const telnyxRes = await fetch('https://api.telnyx.com/v2/number_orders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_numbers: [{ phone_number }] }),
  });
  if (!telnyxRes.ok) return json(502, { error: 'Failed to provision number with carrier' });
  const telnyxData: any = await telnyxRes.json();
  const telnyxId = telnyxData.data?.id ?? '';

  const { rows } = await pool.query(
    `INSERT INTO virtual_numbers (user_id, phone_number, telnyx_number_id, label, number_type)
     VALUES ($1, $2, $3, $4, 'virtual')
     RETURNING *`,
    [dbUserId, phone_number, telnyxId, label ?? null],
  );
  return json(201, rows[0]);
}

async function handleList(dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;
  const { rows } = await pool.query(
    `SELECT * FROM virtual_numbers WHERE user_id = $1 AND released_at IS NULL ORDER BY created_at DESC`, [dbUserId]);
  return json(200, { virtual_numbers: rows });
}

async function handleGet(dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;
  const { rows } = await pool.query(
    `SELECT * FROM virtual_numbers WHERE id = $1 AND user_id = $2 AND released_at IS NULL`, [id, dbUserId]);
  if (!rows[0]) return json(404, { error: 'Virtual number not found' });
  return json(200, rows[0]);
}

async function handleRelease(dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;

  const { rows } = await pool.query<{ telnyx_number_id: string }>(
    `SELECT telnyx_number_id FROM virtual_numbers WHERE id = $1 AND user_id = $2 AND released_at IS NULL`, [id, dbUserId]);
  if (!rows[0]) return json(404, { error: 'Virtual number not found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Cascade delete associated data
    await client.query(`DELETE FROM ivr_menus WHERE virtual_number_id = $1`, [id]);
    await client.query(`DELETE FROM greetings WHERE parked_number_id IN (SELECT id FROM parked_numbers WHERE id = $1)`, [id]);
    await client.query(`UPDATE virtual_numbers SET released_at = now() WHERE id = $1`, [id]);
    await client.query('COMMIT');

    // Release via Telnyx
    const apiKey = await getTelnyxApiKey();
    await fetch(`https://api.telnyx.com/v2/number_orders/${rows[0].telnyx_number_id}/actions/release`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    }).catch(() => {});

    return json(200, { message: 'Virtual number released' });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Release failed', err);
    return json(500, { error: 'Release failed' });
  } finally {
    client.release();
  }
}

async function handleSetGreeting(event: APIGatewayProxyEvent, dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  await pool.query(`UPDATE virtual_numbers SET greeting_id = $1 WHERE id = $2 AND user_id = $3`, [body.greeting_id, id, dbUserId]);
  return json(200, { message: 'Greeting updated' });
}

async function handleSetForwardingRule(event: APIGatewayProxyEvent, dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  await pool.query(`UPDATE virtual_numbers SET forwarding_number = $1 WHERE id = $2 AND user_id = $3`, [body.forwarding_number, id, dbUserId]);
  return json(200, { message: 'Forwarding rule updated' });
}

async function handleAddCallerRule(event: APIGatewayProxyEvent, dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  const { rows } = await pool.query(
    `INSERT INTO caller_rules (virtual_number_id, caller_id, action) VALUES ($1, $2, $3) RETURNING *`,
    [id, body.caller_id, body.action ?? 'block']);
  return json(201, rows[0]);
}

async function handleDeleteCallerRule(dbUserId: string, id: string, ruleId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;
  await pool.query(`DELETE FROM caller_rules WHERE id = $1 AND virtual_number_id = $2`, [ruleId, id]);
  return json(200, { message: 'Caller rule deleted' });
}

async function handleAddBlocklist(event: APIGatewayProxyEvent, dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  await pool.query(
    `INSERT INTO blocklist (virtual_number_id, caller_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [id, body.caller_id]);
  return json(201, { message: 'Added to blocklist' });
}

async function handleDeleteBlocklist(dbUserId: string, id: string, callerId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;
  await pool.query(`DELETE FROM blocklist WHERE virtual_number_id = $1 AND caller_id = $2`, [id, callerId]);
  return json(200, { message: 'Removed from blocklist' });
}

async function handleOutboundCall(event: APIGatewayProxyEvent, dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  if (!body.to) return json(400, { error: 'to is required' });

  const { rows } = await pool.query<{ phone_number: string }>(
    `SELECT phone_number FROM virtual_numbers WHERE id = $1 AND user_id = $2 AND released_at IS NULL`, [id, dbUserId]);
  if (!rows[0]) return json(404, { error: 'Virtual number not found' });

  const apiKey = await getTelnyxApiKey();
  const res = await fetch('https://api.telnyx.com/v2/calls', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection_id: process.env.TELNYX_CONNECTION_ID, to: body.to, from: rows[0].phone_number }),
  });
  const data: any = await res.json();
  return json(200, { call: data.data });
}

async function handleOutboundSms(event: APIGatewayProxyEvent, dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'virtual_numbers', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  if (!body.to || !body.text) return json(400, { error: 'to and text are required' });

  const { rows } = await pool.query<{ phone_number: string }>(
    `SELECT phone_number FROM virtual_numbers WHERE id = $1 AND user_id = $2 AND released_at IS NULL`, [id, dbUserId]);
  if (!rows[0]) return json(404, { error: 'Virtual number not found' });

  const apiKey = await getTelnyxApiKey();
  const res = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: rows[0].phone_number, to: body.to, text: body.text }),
  });
  const data: any = await res.json();
  return json(200, { message: data.data });
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;

  try {
    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });
    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'Unauthorized' });

    if (httpMethod === 'GET' && path === '/virtual-numbers/search') return handleSearchAvailable(event, dbUserId);
    if (httpMethod === 'POST' && path === '/virtual-numbers') return handleProvision(event, dbUserId);
    if (httpMethod === 'GET' && path === '/virtual-numbers') return handleList(dbUserId);

    let params = matchPath(path, '/virtual-numbers/:id');
    if (params) {
      if (httpMethod === 'GET') return handleGet(dbUserId, params.id);
      if (httpMethod === 'DELETE') return handleRelease(dbUserId, params.id);
    }

    params = matchPath(path, '/virtual-numbers/:id/greeting');
    if (params && httpMethod === 'PUT') return handleSetGreeting(event, dbUserId, params.id);

    params = matchPath(path, '/virtual-numbers/:id/forwarding-rule');
    if (params && httpMethod === 'PUT') return handleSetForwardingRule(event, dbUserId, params.id);

    params = matchPath(path, '/virtual-numbers/:id/caller-rules');
    if (params && httpMethod === 'POST') return handleAddCallerRule(event, dbUserId, params.id);

    params = matchPath(path, '/virtual-numbers/:id/caller-rules/:ruleId');
    if (params && httpMethod === 'DELETE') return handleDeleteCallerRule(dbUserId, params.id, params.ruleId);

    params = matchPath(path, '/virtual-numbers/:id/blocklist');
    if (params && httpMethod === 'POST') return handleAddBlocklist(event, dbUserId, params.id);

    params = matchPath(path, '/virtual-numbers/:id/blocklist/:callerId');
    if (params && httpMethod === 'DELETE') return handleDeleteBlocklist(dbUserId, params.id, params.callerId);

    params = matchPath(path, '/virtual-numbers/:id/outbound-call');
    if (params && httpMethod === 'POST') return handleOutboundCall(event, dbUserId, params.id);

    params = matchPath(path, '/virtual-numbers/:id/outbound-sms');
    if (params && httpMethod === 'POST') return handleOutboundSms(event, dbUserId, params.id);

    return json(404, { error: 'Not found' });
  } catch (err) {
    logger.error('Unhandled error', err);
    return json(500, { error: 'Internal server error' });
  }
}
