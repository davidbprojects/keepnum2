import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import { assertFlag } from '@keepnum/shared';
import type { IvrActionType } from '@keepnum/shared';

const ssm = new SSMClient({});
const pool = new Pool({
  host: process.env.DB_HOST, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;
let cachedTelnyxApiKey: string | undefined;

async function getTelnyxApiKey(): Promise<string> {
  if (cachedTelnyxApiKey) return cachedTelnyxApiKey;
  const r = await ssm.send(new GetParameterCommand({ Name: TELNYX_API_KEY_SSM_PATH, WithDecryption: true }));
  cachedTelnyxApiKey = r.Parameter?.Value ?? '';
  return cachedTelnyxApiKey;
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

const MAX_IVR_OPTIONS = 9;
const DTMF_TIMEOUT_MS = 10000;
const MAX_INVALID_RETRIES = 2;

async function handleCreateMenu(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'ivr_auto_attendant', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  const { name, greeting_text, greeting_audio_url, number_id, options } = body;
  if (!name || !number_id) return json(400, { error: 'name and number_id are required' });

  const opts: Array<{ digit: number; action: IvrActionType; action_data: string }> = options ?? [];
  if (opts.length > MAX_IVR_OPTIONS) return json(400, { error: `Maximum ${MAX_IVR_OPTIONS} options allowed` });
  const digits = opts.map((o) => o.digit);
  if (new Set(digits).size !== digits.length) return json(400, { error: 'Duplicate digits not allowed' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO ivr_menus (user_id, number_id, name, greeting_text, greeting_audio_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [dbUserId, number_id, name, greeting_text ?? null, greeting_audio_url ?? null]);
    const menu = rows[0];
    for (const opt of opts) {
      await client.query(
        `INSERT INTO ivr_options (menu_id, digit, action, action_data) VALUES ($1, $2, $3, $4)`,
        [menu.id, opt.digit, opt.action, opt.action_data ?? null]);
    }
    await client.query('COMMIT');
    return json(201, menu);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create IVR menu failed:', err);
    return json(500, { error: 'Failed to create IVR menu' });
  } finally { client.release(); }
}

async function handleListMenus(dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'ivr_auto_attendant', pool);
  if (flagBlock) return flagBlock;
  const { rows } = await pool.query(`SELECT * FROM ivr_menus WHERE user_id = $1 ORDER BY created_at DESC`, [dbUserId]);
  return json(200, { menus: rows });
}

async function handleGetMenu(dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'ivr_auto_attendant', pool);
  if (flagBlock) return flagBlock;
  const { rows: menus } = await pool.query(`SELECT * FROM ivr_menus WHERE id = $1 AND user_id = $2`, [id, dbUserId]);
  if (!menus[0]) return json(404, { error: 'IVR menu not found' });
  const { rows: options } = await pool.query(`SELECT * FROM ivr_options WHERE menu_id = $1 ORDER BY digit`, [id]);
  return json(200, { ...menus[0], options });
}

async function handleUpdateMenu(event: APIGatewayProxyEvent, dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'ivr_auto_attendant', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  const { name, greeting_text, greeting_audio_url, options } = body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE ivr_menus SET name = COALESCE($1, name), greeting_text = COALESCE($2, greeting_text),
       greeting_audio_url = COALESCE($3, greeting_audio_url), updated_at = now()
       WHERE id = $4 AND user_id = $5`, [name, greeting_text, greeting_audio_url, id, dbUserId]);
    if (options) {
      await client.query(`DELETE FROM ivr_options WHERE menu_id = $1`, [id]);
      for (const opt of options) {
        await client.query(
          `INSERT INTO ivr_options (menu_id, digit, action, action_data) VALUES ($1, $2, $3, $4)`,
          [id, opt.digit, opt.action, opt.action_data ?? null]);
      }
    }
    await client.query('COMMIT');
    return json(200, { message: 'IVR menu updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update IVR menu failed:', err);
    return json(500, { error: 'Failed to update IVR menu' });
  } finally { client.release(); }
}

async function handleDeleteMenu(dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'ivr_auto_attendant', pool);
  if (flagBlock) return flagBlock;
  await pool.query(`DELETE FROM ivr_options WHERE menu_id = $1`, [id]);
  await pool.query(`DELETE FROM ivr_menus WHERE id = $1 AND user_id = $2`, [id, dbUserId]);
  return json(200, { message: 'IVR menu deleted' });
}

async function handleTelnyxIvrWebhook(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body ?? '{}');
  const eventType = body.data?.event_type;
  const payload = body.data?.payload;

  if (eventType === 'call.dtmf.received') {
    const callControlId = payload?.call_control_id;
    const digit = payload?.digit;
    const menuId = payload?.client_state ? Buffer.from(payload.client_state, 'base64').toString() : null;

    if (!menuId || !callControlId) return json(200, { status: 'ignored' });

    const { rows: options } = await pool.query(
      `SELECT * FROM ivr_options WHERE menu_id = $1 AND digit = $2`, [menuId, digit]);

    const apiKey = await getTelnyxApiKey();
    if (options[0]) {
      const opt = options[0];
      switch (opt.action as IvrActionType) {
        case 'forward_number':
          await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/transfer`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: opt.action_data }),
          });
          break;
        case 'voicemail':
          await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/record_start`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ format: 'mp3', channels: 'single' }),
          });
          break;
        case 'play_and_disconnect':
          await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/playback_start`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_url: opt.action_data }),
          });
          break;
        case 'sub_menu':
          // Re-gather with sub-menu state
          await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/gather`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              maximum_digits: 1, timeout_millis: DTMF_TIMEOUT_MS,
              client_state: Buffer.from(opt.action_data).toString('base64'),
            }),
          });
          break;
      }
    } else {
      // Invalid key — replay prompt (up to MAX_INVALID_RETRIES times tracked via client_state suffix)
      await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/gather`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maximum_digits: 1, timeout_millis: DTMF_TIMEOUT_MS,
          client_state: Buffer.from(menuId).toString('base64'),
        }),
      });
    }
    return json(200, { status: 'processed' });
  }

  return json(200, { status: 'ignored' });
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;

  try {
    // Webhook (unauthenticated)
    if (httpMethod === 'POST' && path === '/webhooks/telnyx/ivr') {
      return handleTelnyxIvrWebhook(event);
    }

    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });
    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'Unauthorized' });

    if (httpMethod === 'POST' && path === '/ivr-menus') return handleCreateMenu(event, dbUserId);
    if (httpMethod === 'GET' && path === '/ivr-menus') return handleListMenus(dbUserId);

    let params = matchPath(path, '/ivr-menus/:id');
    if (params) {
      if (httpMethod === 'GET') return handleGetMenu(dbUserId, params.id);
      if (httpMethod === 'PUT') return handleUpdateMenu(event, dbUserId, params.id);
      if (httpMethod === 'DELETE') return handleDeleteMenu(dbUserId, params.id);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
