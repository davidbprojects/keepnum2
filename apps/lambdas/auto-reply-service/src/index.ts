import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Pool } from 'pg';
import { assertFlag } from '@keepnum/shared';
import type { AutoReplyScenario } from '@keepnum/shared';
import { logger, initLogger } from '@keepnum/shared';

const ssm = new SSMClient({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const pool = new Pool({
  host: process.env.DB_HOST, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;
const AUTO_REPLY_LOG_TABLE = process.env.AUTO_REPLY_LOG_TABLE ?? 'auto_reply_log';
const MAX_MESSAGE_LENGTH = 480;
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

// ─── Scenario priority (most specific first) ─────────────────────────────────
const SCENARIO_PRIORITY: AutoReplyScenario[] = ['specific_caller', 'after_hours', 'busy', 'all_missed'];

async function handleCreateTemplate(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'auto_reply_sms', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  const { number_id, scenario, message, caller_id } = body;
  if (!number_id || !scenario || !message) return json(400, { error: 'number_id, scenario, and message are required' });
  if (message.length > MAX_MESSAGE_LENGTH) return json(400, { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` });

  const { rows } = await pool.query(
    `INSERT INTO auto_reply_templates (user_id, number_id, scenario, message, caller_id, enabled)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
    [dbUserId, number_id, scenario, message, caller_id ?? null]);
  return json(201, rows[0]);
}

async function handleListTemplates(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'auto_reply_sms', pool);
  if (flagBlock) return flagBlock;
  const numberId = event.queryStringParameters?.number_id;
  let query = `SELECT * FROM auto_reply_templates WHERE user_id = $1`;
  const params: unknown[] = [dbUserId];
  if (numberId) { query += ` AND number_id = $2`; params.push(numberId); }
  query += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(query, params);
  return json(200, { templates: rows });
}

async function handleUpdateTemplate(event: APIGatewayProxyEvent, dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'auto_reply_sms', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  if (body.message && body.message.length > MAX_MESSAGE_LENGTH) {
    return json(400, { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` });
  }
  await pool.query(
    `UPDATE auto_reply_templates SET message = COALESCE($1, message), scenario = COALESCE($2, scenario),
     caller_id = COALESCE($3, caller_id), enabled = COALESCE($4, enabled), updated_at = now()
     WHERE id = $5 AND user_id = $6`,
    [body.message, body.scenario, body.caller_id, body.enabled, id, dbUserId]);
  return json(200, { message: 'Template updated' });
}

async function handleDeleteTemplate(dbUserId: string, id: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'auto_reply_sms', pool);
  if (flagBlock) return flagBlock;
  await pool.query(`DELETE FROM auto_reply_templates WHERE id = $1 AND user_id = $2`, [id, dbUserId]);
  return json(200, { message: 'Template deleted' });
}

async function handleInternalTrigger(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body ?? '{}');
  const { user_id, number_id, caller_id, scenario, from_number } = body;
  if (!user_id || !number_id || !caller_id || !scenario || !from_number) {
    return json(400, { error: 'Missing required fields' });
  }

  // Check feature flag
  const flagBlock = await assertFlag(user_id, 'auto_reply_sms', pool);
  if (flagBlock) return flagBlock;

  // Check blocklist
  const { rows: blocked } = await pool.query(
    `SELECT 1 FROM spam_numbers WHERE phone_number = $1 LIMIT 1`, [caller_id]);
  if (blocked.length > 0) return json(200, { status: 'blocked' });

  // Check 24h rate limit via DynamoDB
  const now = Date.now();
  const oneDayAgo = new Date(now - 86400000).toISOString();
  const rateCheck = await ddb.send(new QueryCommand({
    TableName: AUTO_REPLY_LOG_TABLE,
    KeyConditionExpression: 'pk = :pk AND sk > :since',
    ExpressionAttributeValues: { ':pk': `${number_id}#${caller_id}`, ':since': oneDayAgo },
  }));
  if ((rateCheck.Count ?? 0) > 0) return json(200, { status: 'rate_limited' });

  // Find best matching template
  const { rows: templates } = await pool.query(
    `SELECT * FROM auto_reply_templates WHERE user_id = $1 AND number_id = $2 AND enabled = true ORDER BY created_at`,
    [user_id, number_id]);

  let bestTemplate = null;
  for (const s of SCENARIO_PRIORITY) {
    const match = templates.find((t: { scenario: string; caller_id?: string | null }) => {
      if (t.scenario !== s) return false;
      if (s === 'specific_caller') return t.caller_id === caller_id;
      return true;
    });
    if (match) { bestTemplate = match; break; }
  }
  if (!bestTemplate) return json(200, { status: 'no_template' });

  // Send SMS via Telnyx
  const apiKey = await getTelnyxApiKey();
  await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: from_number, to: caller_id, text: bestTemplate.message }),
  });

  // Log to DynamoDB
  await ddb.send(new PutCommand({
    TableName: AUTO_REPLY_LOG_TABLE,
    Item: { pk: `${number_id}#${caller_id}`, sk: new Date().toISOString(), template_id: bestTemplate.id, scenario },
  }));

  // Log to SMS log in Aurora
  await pool.query(
    `INSERT INTO sms_logs (user_id, parked_number_id, direction, from_number, to_number, body, status)
     VALUES ($1, $2, 'outbound', $3, $4, $5, 'sent')`,
    [user_id, number_id, from_number, caller_id, bestTemplate.message]);

  return json(200, { status: 'sent', template_id: bestTemplate.id });
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;

  try {
    // Internal trigger (service-to-service, no user auth)
    if (httpMethod === 'POST' && path === '/internal/auto-reply/trigger') {
      return handleInternalTrigger(event);
    }

    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });
    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'Unauthorized' });

    if (httpMethod === 'POST' && path === '/auto-reply-templates') return handleCreateTemplate(event, dbUserId);
    if (httpMethod === 'GET' && path === '/auto-reply-templates') return handleListTemplates(event, dbUserId);

    let params = matchPath(path, '/auto-reply-templates/:id');
    if (params) {
      if (httpMethod === 'PUT') return handleUpdateTemplate(event, dbUserId, params.id);
      if (httpMethod === 'DELETE') return handleDeleteTemplate(dbUserId, params.id);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    logger.error('Unhandled error', err);
    return json(500, { error: 'Internal server error' });
  }
}
