import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Pool } from 'pg';
import {
  makeCallLogPk,
  makeCallLogSk,
  makeSmsLogPk,
  makeSmsLogSk,
  makeTtl,
} from '@keepnum/shared';
import type {
  CallLogItem,
  SmsLogItem,
  CallDisposition,
  SmsLogStatus,
  CallLogQueryParams,
  SmsLogQueryParams,
} from '@keepnum/shared';
import { logger, initLogger } from '@keepnum/shared';

// ─── Clients (initialised once per cold start) ──────────────────────────────

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const CALL_LOGS_TABLE = process.env.CALL_LOGS_TABLE ?? 'call_logs';
const SMS_LOGS_TABLE = process.env.SMS_LOGS_TABLE ?? 'sms_logs';
const DEFAULT_PAGE_LIMIT = 50;

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

// ─── Write helpers ───────────────────────────────────────────────────────────

export interface WriteCallLogInput {
  userId: string;
  numberId: string;
  callId: string;
  callerId: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  disposition: CallDisposition;
  spamScore?: number;
}

export async function writeCallLog(input: WriteCallLogInput): Promise<CallLogItem> {
  const timestamp = new Date().toISOString();
  const item: CallLogItem = {
    pk: makeCallLogPk(input.userId, input.numberId),
    sk: makeCallLogSk(timestamp, input.callId),
    callId: input.callId,
    callerId: input.callerId,
    direction: input.direction,
    duration: input.duration,
    disposition: input.disposition,
    spamScore: input.spamScore,
    ttl: makeTtl(90),
  };

  await docClient.send(
    new PutCommand({ TableName: CALL_LOGS_TABLE, Item: item }),
  );
  return item;
}

export interface WriteSmsLogInput {
  userId: string;
  numberId: string;
  messageId: string;
  sender: string;
  recipient: string;
  status: SmsLogStatus;
  direction: 'inbound' | 'outbound';
}

export async function writeSmsLog(input: WriteSmsLogInput): Promise<SmsLogItem> {
  const timestamp = new Date().toISOString();
  const item: SmsLogItem = {
    pk: makeSmsLogPk(input.userId, input.numberId),
    sk: makeSmsLogSk(timestamp, input.messageId),
    messageId: input.messageId,
    sender: input.sender,
    recipient: input.recipient,
    status: input.status,
    direction: input.direction,
    ttl: makeTtl(90),
  };

  await docClient.send(
    new PutCommand({ TableName: SMS_LOGS_TABLE, Item: item }),
  );
  return item;
}

// ─── Query helpers ───────────────────────────────────────────────────────────

interface QueryCallLogsOptions {
  userId: string;
  numberId: string;
  from?: string;
  to?: string;
  callerId?: string;
  disposition?: string;
  limit?: number;
  lastKey?: Record<string, unknown>;
}

async function queryCallLogs(opts: QueryCallLogsOptions) {
  const pk = makeCallLogPk(opts.userId, opts.numberId);
  const expressionNames: Record<string, string> = { '#pk': 'pk' };
  const expressionValues: Record<string, unknown> = { ':pk': pk };
  let keyCondition = '#pk = :pk';

  // Date range filter on sort key (SK starts with ISO timestamp)
  if (opts.from && opts.to) {
    keyCondition += ' AND sk BETWEEN :skFrom AND :skTo';
    expressionValues[':skFrom'] = opts.from;
    expressionValues[':skTo'] = opts.to + '\uffff'; // include all entries up to end of 'to'
  } else if (opts.from) {
    keyCondition += ' AND sk >= :skFrom';
    expressionValues[':skFrom'] = opts.from;
  } else if (opts.to) {
    keyCondition += ' AND sk <= :skTo';
    expressionValues[':skTo'] = opts.to + '\uffff';
  }

  // Build FilterExpression for non-key attributes
  const filters: string[] = [];

  if (opts.callerId) {
    filters.push('callerId = :callerId');
    expressionValues[':callerId'] = opts.callerId;
  }
  if (opts.disposition) {
    filters.push('disposition = :disposition');
    expressionValues[':disposition'] = opts.disposition;
  }

  const params: Record<string, unknown> = {
    TableName: CALL_LOGS_TABLE,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
    Limit: opts.limit ?? DEFAULT_PAGE_LIMIT,
    ScanIndexForward: false, // newest first
  };

  if (filters.length > 0) {
    params.FilterExpression = filters.join(' AND ');
  }
  if (opts.lastKey) {
    params.ExclusiveStartKey = opts.lastKey;
  }

  const result = await docClient.send(new QueryCommand(params as any));
  return {
    items: (result.Items ?? []) as CallLogItem[],
    lastKey: result.LastEvaluatedKey,
  };
}

interface QuerySmsLogsOptions {
  userId: string;
  numberId: string;
  from?: string;
  to?: string;
  sender?: string;
  status?: string;
  limit?: number;
  lastKey?: Record<string, unknown>;
}

async function querySmsLogs(opts: QuerySmsLogsOptions) {
  const pk = makeSmsLogPk(opts.userId, opts.numberId);
  const expressionNames: Record<string, string> = { '#pk': 'pk' };
  const expressionValues: Record<string, unknown> = { ':pk': pk };
  let keyCondition = '#pk = :pk';

  if (opts.from && opts.to) {
    keyCondition += ' AND sk BETWEEN :skFrom AND :skTo';
    expressionValues[':skFrom'] = opts.from;
    expressionValues[':skTo'] = opts.to + '\uffff';
  } else if (opts.from) {
    keyCondition += ' AND sk >= :skFrom';
    expressionValues[':skFrom'] = opts.from;
  } else if (opts.to) {
    keyCondition += ' AND sk <= :skTo';
    expressionValues[':skTo'] = opts.to + '\uffff';
  }

  const filters: string[] = [];

  if (opts.sender) {
    filters.push('sender = :sender');
    expressionValues[':sender'] = opts.sender;
  }
  if (opts.status) {
    filters.push('#status = :status');
    expressionNames['#status'] = 'status'; // 'status' is a reserved word in DynamoDB
    expressionValues[':status'] = opts.status;
  }

  const params: Record<string, unknown> = {
    TableName: SMS_LOGS_TABLE,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
    Limit: opts.limit ?? DEFAULT_PAGE_LIMIT,
    ScanIndexForward: false,
  };

  if (filters.length > 0) {
    params.FilterExpression = filters.join(' AND ');
  }
  if (opts.lastKey) {
    params.ExclusiveStartKey = opts.lastKey;
  }

  const result = await docClient.send(new QueryCommand(params as any));
  return {
    items: (result.Items ?? []) as SmsLogItem[],
    lastKey: result.LastEvaluatedKey,
  };
}

// ─── Route handlers ──────────────────────────────────────────────────────────

async function handleGetCallLogs(
  event: APIGatewayProxyEvent,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const qs = event.queryStringParameters ?? {};
  if (!qs.numberId) {
    return json(400, { error: 'numberId query parameter is required' });
  }

  const result = await queryCallLogs({
    userId: dbUserId,
    numberId: qs.numberId,
    from: qs.from,
    to: qs.to,
    callerId: qs.callerId,
    disposition: qs.disposition,
  });

  return json(200, {
    items: result.items,
    lastKey: result.lastKey ?? null,
  });
}

async function handleGetSmsLogs(
  event: APIGatewayProxyEvent,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const qs = event.queryStringParameters ?? {};
  if (!qs.numberId) {
    return json(400, { error: 'numberId query parameter is required' });
  }

  const result = await querySmsLogs({
    userId: dbUserId,
    numberId: qs.numberId,
    from: qs.from,
    to: qs.to,
    sender: qs.sender,
    status: qs.status,
  });

  return json(200, {
    items: result.items,
    lastKey: result.lastKey ?? null,
  });
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;

  try {
    // All routes are authenticated
    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });

    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'User not found' });

    // GET /logs/calls
    if (httpMethod === 'GET' && path === '/logs/calls') {
      return handleGetCallLogs(event, dbUserId);
    }

    // GET /logs/sms
    if (httpMethod === 'GET' && path === '/logs/sms') {
      return handleGetSmsLogs(event, dbUserId);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    logger.error('Log service error', err);
    return json(500, { error: 'Internal server error' });
  }
}
