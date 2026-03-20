import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Pool } from 'pg';
import { assertFlag } from '@keepnum/shared';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const pool = new Pool({
  host: process.env.DB_HOST, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
const UNIFIED_INBOX_TABLE = process.env.UNIFIED_INBOX_TABLE ?? 'unified_inbox_items';
const DEFAULT_LIMIT = 50;

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

async function handleGetInbox(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'unified_inbox', pool);
  if (flagBlock) return flagBlock;

  const qs = event.queryStringParameters ?? {};
  const limit = Math.min(parseInt(qs.limit ?? String(DEFAULT_LIMIT), 10), 100);
  const dateFrom = qs.date_from;
  const dateTo = qs.date_to;
  const type = qs.type;
  const numberId = qs.number_id;

  let keyExpr = 'pk = :pk';
  const exprValues: Record<string, unknown> = { ':pk': dbUserId };

  if (dateFrom && dateTo) {
    keyExpr += ' AND sk BETWEEN :from AND :to';
    exprValues[':from'] = dateFrom;
    exprValues[':to'] = dateTo;
  } else if (dateFrom) {
    keyExpr += ' AND sk >= :from';
    exprValues[':from'] = dateFrom;
  } else if (dateTo) {
    keyExpr += ' AND sk <= :to';
    exprValues[':to'] = dateTo;
  }

  let filterExpr: string | undefined;
  if (type) { filterExpr = 'itemType = :type'; exprValues[':type'] = type; }
  if (numberId) {
    const nf = 'sourceNumber = :num';
    filterExpr = filterExpr ? `${filterExpr} AND ${nf}` : nf;
    exprValues[':num'] = numberId;
  }

  const result = await ddb.send(new QueryCommand({
    TableName: UNIFIED_INBOX_TABLE,
    KeyConditionExpression: keyExpr,
    FilterExpression: filterExpr,
    ExpressionAttributeValues: exprValues,
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: qs.cursor ? JSON.parse(Buffer.from(qs.cursor, 'base64').toString()) : undefined,
  }));

  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : null;

  return json(200, { items: result.Items ?? [], nextCursor });
}

async function handleGetUnreadCount(dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'unified_inbox', pool);
  if (flagBlock) return flagBlock;

  const result = await ddb.send(new QueryCommand({
    TableName: UNIFIED_INBOX_TABLE,
    KeyConditionExpression: 'pk = :pk',
    FilterExpression: 'isRead = :false',
    ExpressionAttributeValues: { ':pk': dbUserId, ':false': false },
    Select: 'COUNT',
  }));
  return json(200, { unread_count: result.Count ?? 0 });
}

async function handleGetItem(dbUserId: string, itemId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'unified_inbox', pool);
  if (flagBlock) return flagBlock;

  const result = await ddb.send(new QueryCommand({
    TableName: UNIFIED_INBOX_TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': dbUserId, ':prefix': itemId },
    Limit: 1,
  }));
  if (!result.Items?.length) return json(404, { error: 'Item not found' });
  return json(200, result.Items[0]);
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;

  try {
    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });
    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'Unauthorized' });

    if (httpMethod === 'GET' && path === '/unified-inbox') return handleGetInbox(event, dbUserId);
    if (httpMethod === 'GET' && path === '/unified-inbox/unread-count') return handleGetUnreadCount(dbUserId);

    const pp = path.split('/').filter(Boolean);
    if (httpMethod === 'GET' && pp[0] === 'unified-inbox' && pp.length === 2) {
      return handleGetItem(dbUserId, pp[1]);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
