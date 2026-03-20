import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Pool } from 'pg';
import {
  checkSpam,
  assertFlag,
  makeSpamLogPk,
  makeSpamLogSk,
  makeTtl,
} from '@keepnum/shared';
import type { SpamCheckResult, SpamLogItem } from '@keepnum/shared';

// ─── Clients (initialised once per cold start) ──────────────────────────────

const ssm = new SSMClient({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;
const SPAM_LOG_TABLE = process.env.SPAM_LOG_TABLE ?? 'spam_log';

let telnyxApiKey: string | undefined;

async function getTelnyxApiKey(): Promise<string> {
  if (telnyxApiKey) return telnyxApiKey;
  const result = await ssm.send(
    new GetParameterCommand({
      Name: TELNYX_API_KEY_SSM_PATH,
      WithDecryption: true,
    }),
  );
  telnyxApiKey = result.Parameter?.Value ?? '';
  return telnyxApiKey;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function getUserId(event: APIGatewayProxyEvent): string | undefined {
  return event.requestContext.authorizer?.claims?.sub as string | undefined;
}

async function getDbUserId(cognitoSub: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE cognito_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [cognitoSub],
  );
  return rows.length > 0 ? rows[0].id : null;
}

function matchPath(
  path: string,
  pattern: string,
): Record<string, string> | null {
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

// ─── Internal: evaluateSpam ──────────────────────────────────────────────────
// Called synchronously by call-service and sms-service

export async function evaluateSpam(
  userId: string,
  callerId: string,
  itemType: 'call' | 'sms',
): Promise<SpamCheckResult> {
  const apiKey = await getTelnyxApiKey();
  const result = await checkSpam(callerId, apiKey);

  if (result.isSpam) {
    const itemId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const item: SpamLogItem = {
      pk: makeSpamLogPk(userId),
      sk: makeSpamLogSk(timestamp, itemId),
      itemId,
      itemType,
      callerId,
      falsePositive: false,
      ttl: makeTtl(90),
    };

    await ddb.send(
      new PutCommand({
        TableName: SPAM_LOG_TABLE,
        Item: item,
      }),
    );
  }

  return result;
}

// ─── Route: GET /spam-log ────────────────────────────────────────────────────

async function handleGetSpamLog(
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: SPAM_LOG_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': makeSpamLogPk(dbUserId) },
      ScanIndexForward: false, // newest first
    }),
  );

  return json(200, { items: result.Items ?? [] });
}

// ─── Route: PUT /spam-log/:itemId/false-positive ─────────────────────────────

async function handleMarkFalsePositive(
  itemId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  // Find the spam log entry by querying with the userId PK
  const queryResult = await ddb.send(
    new QueryCommand({
      TableName: SPAM_LOG_TABLE,
      KeyConditionExpression: 'pk = :pk',
      FilterExpression: 'itemId = :itemId',
      ExpressionAttributeValues: {
        ':pk': makeSpamLogPk(dbUserId),
        ':itemId': itemId,
      },
    }),
  );

  const entry = queryResult.Items?.[0] as SpamLogItem | undefined;
  if (!entry) {
    return json(404, { error: 'Spam log entry not found' });
  }

  // 1. Mark as false positive in DynamoDB
  await ddb.send(
    new UpdateCommand({
      TableName: SPAM_LOG_TABLE,
      Key: { pk: entry.pk, sk: entry.sk },
      UpdateExpression: 'SET falsePositive = :fp',
      ExpressionAttributeValues: { ':fp': true },
    }),
  );

  // 2. Add caller to allow list in Aurora (block_list with 'allow' marker)
  // We use a special convention: insert into block_list with a negative
  // semantic — the caller_id is prefixed with 'allow:' to distinguish
  // allow-listed callers from blocked ones. Alternatively, services
  // check the spam_log falsePositive flag before blocking.
  await pool.query(
    `INSERT INTO block_list (parked_number_id, caller_id)
     SELECT pn.id, $2
     FROM parked_numbers pn
     WHERE pn.user_id = $1 AND pn.status = 'active'
     ON CONFLICT (parked_number_id, caller_id) DO NOTHING`,
    [dbUserId, `allow:${entry.callerId}`],
  );

  return json(200, {
    message: 'Marked as false positive and added to allow list',
    itemId,
    callerId: entry.callerId,
  });
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;

  try {
    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });

    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'User not found' });

    // Check spam_filtering feature flag
    const denied = await assertFlag(dbUserId, 'spam_filtering', pool);
    if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

    // GET /spam-log
    if (httpMethod === 'GET' && path === '/spam-log') {
      return handleGetSpamLog(dbUserId);
    }

    // PUT /spam-log/:itemId/false-positive
    const params = matchPath(path, '/spam-log/:itemId/false-positive');
    if (httpMethod === 'PUT' && params) {
      return handleMarkFalsePositive(params.itemId, dbUserId);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
