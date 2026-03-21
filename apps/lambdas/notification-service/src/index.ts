import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SNSClient, PublishCommand, CreatePlatformEndpointCommand, DeleteEndpointCommand } from '@aws-sdk/client-sns';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Pool } from 'pg';
import { assertFlag } from '@keepnum/shared';
import { logger, initLogger } from '@keepnum/shared';

const ssm = new SSMClient({});
const sns = new SNSClient({});
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const pool = new Pool({
  host: process.env.DB_HOST, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;
const DEVICE_TOKENS_TABLE = process.env.DEVICE_TOKENS_TABLE ?? 'device_tokens';
const NOTIFICATION_SETTINGS_TABLE = process.env.NOTIFICATION_SETTINGS_TABLE ?? 'notification_settings';
const APNS_PLATFORM_ARN = process.env.APNS_PLATFORM_ARN ?? '';
const FCM_PLATFORM_ARN = process.env.FCM_PLATFORM_ARN ?? '';
const MAX_RETRIES = 3;
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

async function handleRegisterDevice(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'push_notifications', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  const { device_token, platform, device_id } = body;
  if (!device_token || !platform || !device_id) return json(400, { error: 'device_token, platform, and device_id are required' });

  const platformArn = platform === 'ios' ? APNS_PLATFORM_ARN : FCM_PLATFORM_ARN;
  let endpointArn = '';
  try {
    const result = await sns.send(new CreatePlatformEndpointCommand({
      PlatformApplicationArn: platformArn, Token: device_token,
    }));
    endpointArn = result.EndpointArn ?? '';
  } catch (err) {
    logger.error('SNS endpoint creation failed', err);
    return json(502, { error: 'Failed to register device' });
  }

  await ddb.send(new PutCommand({
    TableName: DEVICE_TOKENS_TABLE,
    Item: { pk: dbUserId, sk: device_id, deviceToken: device_token, platform, endpointArn, createdAt: new Date().toISOString() },
  }));
  return json(201, { device_id, endpoint_arn: endpointArn });
}

async function handleUnregisterDevice(dbUserId: string, deviceId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'push_notifications', pool);
  if (flagBlock) return flagBlock;

  const existing = await ddb.send(new GetCommand({
    TableName: DEVICE_TOKENS_TABLE, Key: { pk: dbUserId, sk: deviceId },
  }));
  if (existing.Item?.endpointArn) {
    await sns.send(new DeleteEndpointCommand({ EndpointArn: existing.Item.endpointArn })).catch(() => {});
  }
  await ddb.send(new DeleteCommand({ TableName: DEVICE_TOKENS_TABLE, Key: { pk: dbUserId, sk: deviceId } }));
  return json(200, { message: 'Device unregistered' });
}

async function handleUpdateSettings(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'push_notifications', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  const { number_id, push_enabled, sms_enabled } = body;
  if (!number_id) return json(400, { error: 'number_id is required' });

  await ddb.send(new PutCommand({
    TableName: NOTIFICATION_SETTINGS_TABLE,
    Item: { pk: `${dbUserId}#${number_id}`, sk: 'settings', pushEnabled: push_enabled ?? true, smsEnabled: sms_enabled ?? false, updatedAt: new Date().toISOString() },
  }));
  return json(200, { message: 'Settings updated' });
}

async function handleGetSettings(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'push_notifications', pool);
  if (flagBlock) return flagBlock;
  const numberId = event.queryStringParameters?.number_id;
  if (!numberId) return json(400, { error: 'number_id is required' });

  const result = await ddb.send(new GetCommand({
    TableName: NOTIFICATION_SETTINGS_TABLE, Key: { pk: `${dbUserId}#${numberId}`, sk: 'settings' },
  }));
  return json(200, result.Item ?? { pushEnabled: true, smsEnabled: false });
}

async function handleInternalVoicemailNotification(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body ?? '{}');
  const { user_id, number_id, caller_id, transcription, from_number } = body;
  if (!user_id || !number_id) return json(400, { error: 'Missing required fields' });

  const flagBlock = await assertFlag(user_id, 'push_notifications', pool);
  if (flagBlock) return json(200, { status: 'feature_disabled' });

  // Check per-number settings
  const settings = await ddb.send(new GetCommand({
    TableName: NOTIFICATION_SETTINGS_TABLE, Key: { pk: `${user_id}#${number_id}`, sk: 'settings' },
  }));
  const pushEnabled = settings.Item?.pushEnabled ?? true;
  const smsEnabled = settings.Item?.smsEnabled ?? false;

  const preview = (transcription ?? '').substring(0, 100);
  const pushPayload = JSON.stringify({
    default: `New voicemail from ${caller_id ?? 'Unknown'}`,
    APNS: JSON.stringify({ aps: { alert: { title: 'New Voicemail', body: `From ${caller_id ?? 'Unknown'}: ${preview}` }, sound: 'default' } }),
    GCM: JSON.stringify({ notification: { title: 'New Voicemail', body: `From ${caller_id ?? 'Unknown'}: ${preview}` } }),
  });

  if (pushEnabled) {
    // Get all device tokens
    const devices = await ddb.send(new QueryCommand({
      TableName: DEVICE_TOKENS_TABLE, KeyConditionExpression: 'pk = :uid',
      ExpressionAttributeValues: { ':uid': user_id },
    }));

    for (const device of devices.Items ?? []) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          await sns.send(new PublishCommand({
            TargetArn: device.endpointArn, Message: pushPayload, MessageStructure: 'json',
          }));
          break;
        } catch (err) {
          if (attempt === MAX_RETRIES - 1) logger.error('Push notification failed after retries', err);
          else await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }
  }

  if (smsEnabled && from_number) {
    const apiKey = await getTelnyxApiKey();
    // Get user's phone for SMS notification
    const { rows } = await pool.query(`SELECT email FROM users WHERE id = $1`, [user_id]);
    if (rows[0]) {
      await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from_number, to: from_number, text: `New voicemail from ${caller_id ?? 'Unknown'}: ${preview}` }),
      }).catch(() => {});
    }
  }

  return json(200, { status: 'sent' });
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;
  try {
    // Internal endpoint (service-to-service)
    if (httpMethod === 'POST' && path === '/internal/notifications/voicemail') {
      return handleInternalVoicemailNotification(event);
    }

    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });
    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'Unauthorized' });

    if (httpMethod === 'POST' && path === '/devices') return handleRegisterDevice(event, dbUserId);

    const pp = path.split('/').filter(Boolean);
    if (httpMethod === 'DELETE' && pp[0] === 'devices' && pp.length === 2) {
      return handleUnregisterDevice(dbUserId, pp[1]);
    }

    if (httpMethod === 'PUT' && path === '/notifications/settings') return handleUpdateSettings(event, dbUserId);
    if (httpMethod === 'GET' && path === '/notifications/settings') return handleGetSettings(event, dbUserId);

    return json(404, { error: 'Not found' });
  } catch (err) {
    logger.error('Unhandled error', err);
    return json(500, { error: 'Internal server error' });
  }
}
