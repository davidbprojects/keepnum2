import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Pool } from 'pg';
import { assertFlag, assertNumericLimit } from '@keepnum/shared';

const ssm = new SSMClient({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const pool = new Pool({
  host: process.env.DB_HOST, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;
const CONFERENCE_LOG_TABLE = process.env.CONFERENCE_LOG_TABLE ?? 'conference_logs';
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

function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function handleCreate(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'conference_calling', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  const { name, number_id } = body;
  if (!name || !number_id) return json(400, { error: 'name and number_id are required' });

  const pin = generatePin();
  const apiKey = await getTelnyxApiKey();

  // Create conference via Telnyx
  const telnyxRes = await fetch('https://api.telnyx.com/v2/conferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ call_control_id: `conf-${Date.now()}`, name }),
  });
  const telnyxData: any = telnyxRes.ok ? await telnyxRes.json() : { data: {} };
  const telnyxConfId = telnyxData.data?.id ?? '';

  const { rows } = await pool.query(
    `INSERT INTO conferences (user_id, number_id, name, pin, telnyx_conference_id, status)
     VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`,
    [dbUserId, number_id, name, pin, telnyxConfId]);
  return json(201, rows[0]);
}

async function handleList(dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'conference_calling', pool);
  if (flagBlock) return flagBlock;
  const { rows } = await pool.query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM conference_participants WHERE conference_id = c.id AND left_at IS NULL) AS participant_count
     FROM conferences c WHERE c.user_id = $1 ORDER BY c.created_at DESC`, [dbUserId]);
  return json(200, { conferences: rows });
}

async function handleGet(dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'conference_calling', pool);
  if (flagBlock) return flagBlock;
  const { rows: confs } = await pool.query(`SELECT * FROM conferences WHERE id = $1 AND user_id = $2`, [id, dbUserId]);
  if (!confs[0]) return json(404, { error: 'Conference not found' });
  const { rows: participants } = await pool.query(
    `SELECT * FROM conference_participants WHERE conference_id = $1 ORDER BY joined_at`, [id]);
  return json(200, { ...confs[0], participants });
}

async function handleEnd(dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'conference_calling', pool);
  if (flagBlock) return flagBlock;
  const { rows } = await pool.query(
    `UPDATE conferences SET status = 'ended', ended_at = now() WHERE id = $1 AND user_id = $2 RETURNING telnyx_conference_id`,
    [id, dbUserId]);
  if (!rows[0]) return json(404, { error: 'Conference not found' });

  // End all participants
  await pool.query(`UPDATE conference_participants SET left_at = now() WHERE conference_id = $1 AND left_at IS NULL`, [id]);

  // Log to DynamoDB
  await ddb.send(new PutCommand({
    TableName: CONFERENCE_LOG_TABLE,
    Item: { pk: dbUserId, sk: `${new Date().toISOString()}#${id}`, conferenceId: id, action: 'ended' },
  }));

  return json(200, { message: 'Conference ended' });
}

async function handleMuteParticipant(dbUserId: string, confId: string, participantId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'conference_calling', pool);
  if (flagBlock) return flagBlock;
  const { rows } = await pool.query(
    `UPDATE conference_participants SET muted = NOT muted WHERE id = $1 AND conference_id = $2 RETURNING muted`,
    [participantId, confId]);
  if (!rows[0]) return json(404, { error: 'Participant not found' });
  return json(200, { muted: rows[0].muted });
}

async function handleRemoveParticipant(dbUserId: string, confId: string, participantId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'conference_calling', pool);
  if (flagBlock) return flagBlock;
  await pool.query(
    `UPDATE conference_participants SET left_at = now() WHERE id = $1 AND conference_id = $2`, [participantId, confId]);
  return json(200, { message: 'Participant removed' });
}

async function handleMergeCall(event: APIGatewayProxyEvent, dbUserId: string, confId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'conference_calling', pool);
  if (flagBlock) return flagBlock;

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM conference_participants WHERE conference_id = $1 AND left_at IS NULL`, [confId]);
  const limitBlock = await assertNumericLimit(dbUserId, 'max_conference_participants', countRows[0].count, pool);
  if (limitBlock) return limitBlock;

  const body = JSON.parse(event.body ?? '{}');
  const { call_control_id, caller_id } = body;
  if (!call_control_id) return json(400, { error: 'call_control_id is required' });

  const { rows } = await pool.query(
    `INSERT INTO conference_participants (conference_id, call_control_id, caller_id, is_host)
     VALUES ($1, $2, $3, false) RETURNING *`, [confId, call_control_id, caller_id ?? 'Unknown']);
  return json(200, rows[0]);
}

async function handleTelnyxConferenceWebhook(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body ?? '{}');
  const eventType = body.data?.event_type;
  const payload = body.data?.payload;

  if (eventType === 'conference.participant.joined') {
    const confId = payload?.conference_id;
    const callControlId = payload?.call_control_id;
    const callerId = payload?.from ?? 'Unknown';
    if (confId && callControlId) {
      await pool.query(
        `INSERT INTO conference_participants (conference_id, call_control_id, caller_id, is_host)
         VALUES ((SELECT id FROM conferences WHERE telnyx_conference_id = $1), $2, $3, false)
         ON CONFLICT DO NOTHING`, [confId, callControlId, callerId]);
    }
  } else if (eventType === 'conference.participant.left') {
    const callControlId = payload?.call_control_id;
    if (callControlId) {
      const { rows } = await pool.query(
        `UPDATE conference_participants SET left_at = now() WHERE call_control_id = $1 AND left_at IS NULL RETURNING conference_id, is_host`,
        [callControlId]);
      // If host left, end conference
      if (rows[0]?.is_host) {
        const confDbId = rows[0].conference_id;
        await pool.query(`UPDATE conferences SET status = 'ended', ended_at = now() WHERE id = $1`, [confDbId]);
        await pool.query(`UPDATE conference_participants SET left_at = now() WHERE conference_id = $1 AND left_at IS NULL`, [confDbId]);
      }
    }
  }

  return json(200, { status: 'processed' });
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;
  try {
    // Webhook (unauthenticated)
    if (httpMethod === 'POST' && path === '/webhooks/telnyx/conference') {
      return handleTelnyxConferenceWebhook(event);
    }

    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });
    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'Unauthorized' });

    if (httpMethod === 'POST' && path === '/conferences') return handleCreate(event, dbUserId);
    if (httpMethod === 'GET' && path === '/conferences') return handleList(dbUserId);

    let params = matchPath(path, '/conferences/:id');
    if (params) {
      if (httpMethod === 'GET') return handleGet(dbUserId, params.id);
      if (httpMethod === 'DELETE') return handleEnd(dbUserId, params.id);
    }

    params = matchPath(path, '/conferences/:id/participants/:participantId');
    if (params) {
      if (httpMethod === 'PUT') return handleMuteParticipant(dbUserId, params.id, params.participantId);
      if (httpMethod === 'DELETE') return handleRemoveParticipant(dbUserId, params.id, params.participantId);
    }

    params = matchPath(path, '/conferences/:id/merge');
    if (params && httpMethod === 'POST') return handleMergeCall(event, dbUserId, params.id);

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
