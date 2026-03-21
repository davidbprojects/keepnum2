import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  AdminDisableUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import type {
  RegisterRequest,
  LoginRequest,
  RefreshRequest,
} from '@keepnum/shared';
import { logger, initLogger } from '@keepnum/shared';

// ─── Clients (initialised once per cold start) ──────────────────────────────

const cognito = new CognitoIdentityProviderClient({});
const ssm = new SSMClient({});

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID!;
const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;

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

const AUTH_ERROR = 'Authentication failed';

// ─── Route handlers ──────────────────────────────────────────────────────────

async function handleRegister(body: RegisterRequest): Promise<APIGatewayProxyResult> {
  try {
    await cognito.send(
      new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: body.email,
        Password: body.password,
        UserAttributes: [{ Name: 'email', Value: body.email }],
      }),
    );

    const cognitoUser = await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: body.email,
      }),
    );
    const cognitoSub =
      cognitoUser.UserAttributes?.find((a: { Name?: string }) => a.Name === 'sub')?.Value ?? '';

    await pool.query(
      `INSERT INTO users (cognito_id, email) VALUES ($1, $2) ON CONFLICT (cognito_id) DO NOTHING`,
      [cognitoSub, body.email],
    );

    logger.auth('register_success', cognitoSub, { email: body.email });
    return json(201, { message: 'User registered successfully' });
  } catch (err) {
    logger.error('register_failed', err, { email: body.email });
    return json(400, { error: AUTH_ERROR });
  }
}

async function handleLogin(body: LoginRequest): Promise<APIGatewayProxyResult> {
  try {
    const result = await cognito.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
          USERNAME: body.email,
          PASSWORD: body.password,
        },
      }),
    );

    logger.auth('login_success', undefined, { email: body.email });
    return json(200, {
      accessToken: result.AuthenticationResult?.AccessToken ?? '',
      refreshToken: result.AuthenticationResult?.RefreshToken ?? '',
    });
  } catch (err) {
    logger.auth('login_failed', undefined, { email: body.email });
    logger.error('login_error', err);
    // Never reveal which field is wrong (Req 1.3)
    return json(401, { error: AUTH_ERROR });
  }
}

async function handleRefresh(body: RefreshRequest): Promise<APIGatewayProxyResult> {
  try {
    const result = await cognito.send(
      new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
          REFRESH_TOKEN: body.refreshToken,
        },
      }),
    );

    return json(200, {
      accessToken: result.AuthenticationResult?.AccessToken ?? '',
    });
  } catch {
    return json(401, { error: AUTH_ERROR });
  }
}

async function handleDeleteAccount(
  userId: string,
  cognitoUsername: string,
): Promise<APIGatewayProxyResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Mark user as deleted in Aurora
    await client.query(
      `UPDATE users SET deleted_at = now() WHERE cognito_id = $1`,
      [userId],
    );

    // 2. Get all active parked numbers for this user
    const { rows: numbers } = await client.query<{
      id: string;
      telnyx_number_id: string;
    }>(
      `SELECT pn.id, pn.telnyx_number_id
       FROM parked_numbers pn
       JOIN users u ON u.id = pn.user_id
       WHERE u.cognito_id = $1 AND pn.status = 'active'`,
      [userId],
    );

    // 3. Release each number via Telnyx and mark as released
    const apiKey = await getTelnyxApiKey();
    for (const num of numbers) {
      try {
        const res = await fetch(
          `https://api.telnyx.com/v2/number_orders/${num.telnyx_number_id}/actions/release`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
        if (!res.ok) {
          console.warn(`Telnyx release failed for ${num.telnyx_number_id}: ${res.status}`);
        }
      } catch (err) {
        console.warn(`Telnyx release error for ${num.telnyx_number_id}:`, err);
      }

      await client.query(
        `UPDATE parked_numbers SET status = 'released', released_at = now() WHERE id = $1`,
        [num.id],
      );
    }

    // 4. Disable user in Cognito (Req 1.6)
    await cognito.send(
      new AdminDisableUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: cognitoUsername,
      }),
    );

    await client.query('COMMIT');
    return json(200, { message: 'Account deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Account deletion failed:', err);
    return json(500, { error: 'Account deletion failed' });
  } finally {
    client.release();
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;
  const requestId = event.requestContext.requestId;
  initLogger('auth-service', requestId);
  const start = Date.now();

  try {
    if (httpMethod === 'POST' && path === '/auth/register') {
      const body: RegisterRequest = JSON.parse(event.body ?? '{}');
      if (!body.email || !body.password) {
        return json(400, { error: 'Email and password are required' });
      }
      return handleRegister(body);
    }

    if (httpMethod === 'POST' && path === '/auth/login') {
      const body: LoginRequest = JSON.parse(event.body ?? '{}');
      if (!body.email || !body.password) {
        return json(400, { error: 'Email and password are required' });
      }
      return handleLogin(body);
    }

    if (httpMethod === 'POST' && path === '/auth/refresh') {
      const body: RefreshRequest = JSON.parse(event.body ?? '{}');
      if (!body.refreshToken) {
        return json(400, { error: 'Refresh token is required' });
      }
      return handleRefresh(body);
    }

    if (httpMethod === 'DELETE' && path === '/auth/account') {
      const claims = event.requestContext.authorizer?.claims;
      const userId = claims?.sub as string | undefined;
      const username = claims?.['cognito:username'] as string | undefined;
      if (!userId || !username) {
        return json(401, { error: 'Unauthorized' });
      }
      return handleDeleteAccount(userId, username);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    logger.error('auth_handler_error', err, { method: httpMethod, path });
    return json(500, { error: 'Internal server error' });
  }
}
