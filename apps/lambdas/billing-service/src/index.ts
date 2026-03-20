import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import type {
  CreateSessionResponse,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
} from '@keepnum/shared';
import type { SubscriptionStatus, InvoiceStatus } from '@keepnum/shared';

// ─── Constants ───────────────────────────────────────────────────────────────

const ADYEN_API_BASE = 'https://checkout-test.adyen.com/v71';
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 8000;

// ─── Clients (initialised once per cold start) ──────────────────────────────

const ssm = new SSMClient({});
const ses = new SESClient({});

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const ADYEN_API_KEY_SSM_PATH = process.env.ADYEN_API_KEY_SSM_PATH!;
const ADYEN_HMAC_KEY_SSM_PATH = process.env.ADYEN_HMAC_KEY_SSM_PATH!;
const ADYEN_MERCHANT_ACCOUNT = process.env.ADYEN_MERCHANT_ACCOUNT ?? 'KeepNum';
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL ?? 'noreply@keepnum.com';

let cachedAdyenApiKey: string | undefined;
let cachedAdyenHmacKey: string | undefined;

// ─── SSM helpers (cached at cold start) ──────────────────────────────────────

async function getAdyenApiKey(): Promise<string> {
  if (cachedAdyenApiKey) return cachedAdyenApiKey;
  const result = await ssm.send(
    new GetParameterCommand({
      Name: ADYEN_API_KEY_SSM_PATH,
      WithDecryption: true,
    }),
  );
  cachedAdyenApiKey = result.Parameter?.Value ?? '';
  return cachedAdyenApiKey;
}

async function getAdyenHmacKey(): Promise<string> {
  if (cachedAdyenHmacKey) return cachedAdyenHmacKey;
  const result = await ssm.send(
    new GetParameterCommand({
      Name: ADYEN_HMAC_KEY_SSM_PATH,
      WithDecryption: true,
    }),
  );
  cachedAdyenHmacKey = result.Parameter?.Value ?? '';
  return cachedAdyenHmacKey;
}

// ─── Retry helper with exponential backoff ───────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function adyenRequest(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${ADYEN_API_BASE}${path}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return (await response.json()) as Record<string, unknown>;
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const text = await response.text();
        throw new Error(`Adyen request failed: ${response.status} ${text}`);
      }

      if (attempt < MAX_RETRIES) {
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
        await sleep(backoff);
        continue;
      }

      throw new Error(`Adyen request failed after ${MAX_RETRIES + 1} attempts`);
    } catch (err) {
      if (attempt < MAX_RETRIES && (err as Error).message?.includes('fetch')) {
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt));
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Adyen request failed: exhausted retries');
}

// ─── Response helpers ────────────────────────────────────────────────────────

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function getUserIdFromEvent(event: APIGatewayProxyEvent): string | null {
  return (
    event.requestContext.authorizer?.claims?.sub ??
    event.requestContext.authorizer?.sub ??
    null
  );
}

function getUserEmailFromEvent(event: APIGatewayProxyEvent): string | null {
  return (
    event.requestContext.authorizer?.claims?.email ??
    event.requestContext.authorizer?.email ??
    null
  );
}

// ─── Email helper ────────────────────────────────────────────────────────────

async function sendEmail(
  toEmail: string,
  subject: string,
  bodyText: string,
): Promise<void> {
  await ses.send(
    new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: bodyText } },
      },
    }),
  );
}

// ─── POST /billing/session ───────────────────────────────────────────────────

async function createPaymentSession(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromEvent(event);
  if (!userId) return json(401, { error: 'Unauthorized' });

  const apiKey = await getAdyenApiKey();

  const { rows: userRows } = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (userRows.length === 0) return json(404, { error: 'User not found' });

  const sessionResult = await adyenRequest('/sessions', apiKey, {
    merchantAccount: ADYEN_MERCHANT_ACCOUNT,
    amount: { value: 0, currency: 'USD' },
    returnUrl: process.env.RETURN_URL ?? 'https://app.keepnum.com/billing/complete',
    reference: `session-${userId}-${Date.now()}`,
    shopperReference: userId,
    shopperEmail: userRows[0].email,
    storePaymentMethodMode: 'askForConsent',
  });

  const response: CreateSessionResponse = {
    sessionId: sessionResult.id as string,
    sessionData: sessionResult.sessionData as string,
  };

  return json(200, response);
}

// ─── POST /billing/subscriptions ─────────────────────────────────────────────

async function createSubscription(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromEvent(event);
  if (!userId) return json(401, { error: 'Unauthorized' });

  const body: CreateSubscriptionRequest = event.body ? JSON.parse(event.body) : {};
  if (!body.packageId) return json(400, { error: 'packageId is required' });

  // Verify package exists
  const { rows: pkgRows } = await pool.query(
    `SELECT id, price_monthly_cents FROM packages WHERE id = $1 AND deleted_at IS NULL`,
    [body.packageId],
  );
  if (pkgRows.length === 0) return json(404, { error: 'Package not found' });

  // Check for existing active subscription
  const { rows: existingSubs } = await pool.query(
    `SELECT id FROM subscriptions
     WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due')
     LIMIT 1`,
    [userId],
  );
  if (existingSubs.length > 0) {
    return json(409, { error: 'Active subscription already exists. Use PUT to update.' });
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { rows: subRows } = await pool.query<{ id: string }>(
    `INSERT INTO subscriptions
       (user_id, package_id, status, adyen_shopper_ref,
        current_period_start, current_period_end, cancel_at_period_end)
     VALUES ($1, $2, 'active', $3, $4, $5, false)
     RETURNING id`,
    [userId, body.packageId, userId, now.toISOString(), periodEnd.toISOString()],
  );

  // Create initial invoice
  await pool.query(
    `INSERT INTO invoices
       (user_id, subscription_id, amount_cents, currency, status, period_start, period_end)
     VALUES ($1, $2, $3, 'USD', 'pending', $4, $5)`,
    [userId, subRows[0].id, pkgRows[0].price_monthly_cents, now.toISOString(), periodEnd.toISOString()],
  );

  const { rows: subscription } = await pool.query(
    `SELECT * FROM subscriptions WHERE id = $1`,
    [subRows[0].id],
  );

  return json(201, subscription[0]);
}

// ─── PUT /billing/subscriptions/:id ──────────────────────────────────────────

async function updateSubscription(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromEvent(event);
  if (!userId) return json(401, { error: 'Unauthorized' });

  const subscriptionId = event.pathParameters?.id;
  if (!subscriptionId) return json(400, { error: 'Subscription ID is required' });

  const body: UpdateSubscriptionRequest = event.body ? JSON.parse(event.body) : {};
  if (!body.packageId) return json(400, { error: 'packageId is required' });

  // Verify subscription belongs to user and is active
  const { rows: subRows } = await pool.query(
    `SELECT id, status FROM subscriptions
     WHERE id = $1 AND user_id = $2`,
    [subscriptionId, userId],
  );
  if (subRows.length === 0) return json(404, { error: 'Subscription not found' });
  if (subRows[0].status === 'cancelled') {
    return json(400, { error: 'Cannot update a cancelled subscription. Reactivate first.' });
  }

  // Verify new package exists
  const { rows: pkgRows } = await pool.query(
    `SELECT id FROM packages WHERE id = $1 AND deleted_at IS NULL`,
    [body.packageId],
  );
  if (pkgRows.length === 0) return json(404, { error: 'Package not found' });

  const { rows: updated } = await pool.query(
    `UPDATE subscriptions
     SET package_id = $1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [body.packageId, subscriptionId],
  );

  return json(200, updated[0]);
}

// ─── DELETE /billing/subscriptions/:id ───────────────────────────────────────

async function cancelSubscription(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromEvent(event);
  if (!userId) return json(401, { error: 'Unauthorized' });

  const subscriptionId = event.pathParameters?.id;
  if (!subscriptionId) return json(400, { error: 'Subscription ID is required' });

  const { rows: subRows } = await pool.query(
    `SELECT id, status FROM subscriptions
     WHERE id = $1 AND user_id = $2`,
    [subscriptionId, userId],
  );
  if (subRows.length === 0) return json(404, { error: 'Subscription not found' });
  if (subRows[0].status === 'cancelled') {
    return json(400, { error: 'Subscription is already cancelled' });
  }

  const { rows: updated } = await pool.query(
    `UPDATE subscriptions
     SET status = 'cancelled', cancel_at_period_end = true, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [subscriptionId],
  );

  return json(200, updated[0]);
}

// ─── POST /billing/subscriptions/:id/reactivate ─────────────────────────────

async function reactivateSubscription(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromEvent(event);
  if (!userId) return json(401, { error: 'Unauthorized' });

  const subscriptionId = event.pathParameters?.id;
  if (!subscriptionId) return json(400, { error: 'Subscription ID is required' });

  const { rows: subRows } = await pool.query(
    `SELECT id, status FROM subscriptions
     WHERE id = $1 AND user_id = $2`,
    [subscriptionId, userId],
  );
  if (subRows.length === 0) return json(404, { error: 'Subscription not found' });

  const currentStatus = subRows[0].status as SubscriptionStatus;
  if (currentStatus !== 'cancelled' && currentStatus !== 'past_due') {
    return json(400, { error: 'Only cancelled or past_due subscriptions can be reactivated' });
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { rows: updated } = await pool.query(
    `UPDATE subscriptions
     SET status = 'active', cancel_at_period_end = false,
         current_period_start = $1, current_period_end = $2, updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [now.toISOString(), periodEnd.toISOString(), subscriptionId],
  );

  return json(200, updated[0]);
}

// ─── GET /billing/invoices ───────────────────────────────────────────────────

async function listInvoices(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromEvent(event);
  if (!userId) return json(401, { error: 'Unauthorized' });

  const page = parseInt(event.queryStringParameters?.page ?? '1', 10);
  const limit = Math.min(parseInt(event.queryStringParameters?.limit ?? '20', 10), 100);
  const offset = (page - 1) * limit;

  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM invoices WHERE user_id = $1`,
    [userId],
  );
  const total = parseInt(countRows[0].count, 10);

  const { rows: invoices } = await pool.query(
    `SELECT * FROM invoices
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  return json(200, { items: invoices, total, page, limit });
}

// ─── Adyen webhook HMAC validation ───────────────────────────────────────────

interface AdyenNotificationItem {
  NotificationRequestItem: {
    eventCode: string;
    pspReference: string;
    merchantReference: string;
    amount: { value: number; currency: string };
    success: string;
    additionalData?: Record<string, string>;
    reason?: string;
  };
}

interface AdyenWebhookPayload {
  live: string;
  notificationItems: AdyenNotificationItem[];
}

function computeHmac(payload: string, hmacKey: string): string {
  const keyBytes = Buffer.from(hmacKey, 'hex');
  return crypto
    .createHmac('sha256', keyBytes)
    .update(payload, 'utf8')
    .digest('base64');
}

function validateHmacSignature(
  notificationItem: AdyenNotificationItem['NotificationRequestItem'],
  hmacKey: string,
): boolean {
  const hmacSignature =
    notificationItem.additionalData?.hmacSignature;
  if (!hmacSignature) return false;

  // Build the signing string per Adyen spec:
  // pspReference + merchantReference + amount.value + amount.currency + eventCode + success
  const signingString = [
    notificationItem.pspReference,
    notificationItem.merchantReference,
    notificationItem.amount.value.toString(),
    notificationItem.amount.currency,
    notificationItem.eventCode,
    notificationItem.success,
  ].join(':');

  const computed = computeHmac(signingString, hmacKey);
  return crypto.timingSafeEqual(
    Buffer.from(computed, 'base64'),
    Buffer.from(hmacSignature, 'base64'),
  );
}

// ─── Adyen webhook event handlers ────────────────────────────────────────────

async function handleAuthorisation(
  item: AdyenNotificationItem['NotificationRequestItem'],
): Promise<void> {
  const pspRef = item.pspReference;
  const success = item.success === 'true';

  // merchantReference format: "session-{userId}-{timestamp}" or userId
  const userIdMatch = item.merchantReference.match(/^session-(.+?)-\d+$/);
  const shopperRef = userIdMatch ? userIdMatch[1] : item.merchantReference;

  if (success) {
    // Set subscription active if it was past_due or trialing
    await pool.query(
      `UPDATE subscriptions SET status = 'active', updated_at = now()
       WHERE adyen_shopper_ref = $1 AND status IN ('past_due', 'trialing')`,
      [shopperRef],
    );

    // Mark the most recent pending invoice as paid
    await pool.query(
      `UPDATE invoices SET status = 'paid', adyen_psp_ref = $1, updated_at = now()
       WHERE id = (
         SELECT id FROM invoices
         WHERE status = 'pending'
           AND user_id IN (SELECT user_id FROM subscriptions WHERE adyen_shopper_ref = $2)
         ORDER BY created_at DESC
         LIMIT 1
       )`,
      [pspRef, shopperRef],
    );
  } else {
    // Payment declined → set subscription to past_due, notify user
    await pool.query(
      `UPDATE subscriptions SET status = 'past_due', updated_at = now()
       WHERE adyen_shopper_ref = $1 AND status = 'active'`,
      [shopperRef],
    );

    // Mark the most recent pending invoice as failed
    await pool.query(
      `UPDATE invoices SET status = 'failed', adyen_psp_ref = $1, updated_at = now()
       WHERE id = (
         SELECT id FROM invoices
         WHERE status = 'pending'
           AND user_id IN (SELECT user_id FROM subscriptions WHERE adyen_shopper_ref = $2)
         ORDER BY created_at DESC
         LIMIT 1
       )`,
      [pspRef, shopperRef],
    );

    // Send payment decline email
    await notifyUserByShopperRef(
      shopperRef,
      'KeepNum: Payment Declined',
      `Your recent payment was declined. Please update your payment method to avoid service interruption. Reason: ${item.reason ?? 'Unknown'}`,
    );
  }
}

async function handleCancellation(
  item: AdyenNotificationItem['NotificationRequestItem'],
): Promise<void> {
  const pspRef = item.pspReference;

  await pool.query(
    `UPDATE invoices SET status = 'failed', adyen_psp_ref = $1, updated_at = now()
     WHERE adyen_psp_ref = $1`,
    [pspRef],
  );
}

async function handleRefund(
  item: AdyenNotificationItem['NotificationRequestItem'],
): Promise<void> {
  const pspRef = item.pspReference;

  await pool.query(
    `UPDATE invoices SET status = 'refunded', updated_at = now()
     WHERE adyen_psp_ref = $1`,
    [pspRef],
  );
}

async function handleChargeback(
  item: AdyenNotificationItem['NotificationRequestItem'],
): Promise<void> {
  const pspRef = item.pspReference;

  // Update invoice status to chargeback
  await pool.query(
    `UPDATE invoices SET status = 'chargeback', updated_at = now()
     WHERE adyen_psp_ref = $1`,
    [pspRef],
  );

  // Find the subscription via the invoice and set to past_due
  const { rows: invoiceRows } = await pool.query<{
    subscription_id: string;
    user_id: string;
  }>(
    `SELECT subscription_id, user_id FROM invoices WHERE adyen_psp_ref = $1 LIMIT 1`,
    [pspRef],
  );

  if (invoiceRows.length > 0) {
    await pool.query(
      `UPDATE subscriptions SET status = 'past_due', updated_at = now()
       WHERE id = $1`,
      [invoiceRows[0].subscription_id],
    );

    // Send chargeback email notification
    const { rows: userRows } = await pool.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [invoiceRows[0].user_id],
    );

    if (userRows.length > 0) {
      await sendEmail(
        userRows[0].email,
        'KeepNum: Chargeback Received',
        'A chargeback has been filed against your account. Your subscription has been set to past due. Please contact support to resolve this issue.',
      );
    }
  }
}

// ─── Notify user helper ──────────────────────────────────────────────────────

async function notifyUserByShopperRef(
  shopperRef: string,
  subject: string,
  bodyText: string,
): Promise<void> {
  const { rows: userRows } = await pool.query<{ email: string }>(
    `SELECT u.email FROM users u
     JOIN subscriptions s ON s.user_id = u.id
     WHERE s.adyen_shopper_ref = $1
     LIMIT 1`,
    [shopperRef],
  );

  if (userRows.length > 0) {
    await sendEmail(userRows[0].email, subject, bodyText);
  }
}

// ─── POST /webhooks/adyen ────────────────────────────────────────────────────

async function handleAdyenWebhook(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const hmacKey = await getAdyenHmacKey();

  let payload: AdyenWebhookPayload;
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: 'Invalid JSON payload' });
  }

  if (!payload.notificationItems || payload.notificationItems.length === 0) {
    return json(400, { error: 'No notification items' });
  }

  for (const notificationItem of payload.notificationItems) {
    const item = notificationItem.NotificationRequestItem;

    // Validate HMAC signature before any processing
    if (!validateHmacSignature(item, hmacKey)) {
      return json(401, { error: 'Invalid HMAC signature' });
    }

    try {
      switch (item.eventCode) {
        case 'AUTHORISATION':
          await handleAuthorisation(item);
          break;
        case 'CANCELLATION':
          await handleCancellation(item);
          break;
        case 'REFUND':
          await handleRefund(item);
          break;
        case 'CHARGEBACK':
          await handleChargeback(item);
          break;
        default:
          console.log(`Unhandled Adyen event: ${item.eventCode}`);
      }
    } catch (err) {
      console.error(`Error processing ${item.eventCode}:`, err);
      // Continue processing remaining items; Adyen expects [accepted]
    }
  }

  // Adyen expects "[accepted]" response
  return json(200, { notificationResponse: '[accepted]' });
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.resource ?? event.path ?? '';

  try {
    // Adyen webhook (unauthenticated — HMAC validated instead)
    if (method === 'POST' && path === '/webhooks/adyen') {
      return await handleAdyenWebhook(event);
    }

    // All billing routes below require authentication
    const userId = getUserIdFromEvent(event);
    if (!userId) return json(401, { error: 'Unauthorized' });

    // POST /billing/session
    if (method === 'POST' && path === '/billing/session') {
      return await createPaymentSession(event);
    }

    // POST /billing/subscriptions
    if (method === 'POST' && path === '/billing/subscriptions') {
      return await createSubscription(event);
    }

    // PUT /billing/subscriptions/:id
    if (method === 'PUT' && path.match(/^\/billing\/subscriptions\/[^/]+$/)) {
      return await updateSubscription(event);
    }

    // DELETE /billing/subscriptions/:id
    if (method === 'DELETE' && path.match(/^\/billing\/subscriptions\/[^/]+$/)) {
      return await cancelSubscription(event);
    }

    // POST /billing/subscriptions/:id/reactivate
    if (method === 'POST' && path.match(/^\/billing\/subscriptions\/[^/]+\/reactivate$/)) {
      return await reactivateSubscription(event);
    }

    // GET /billing/invoices
    if (method === 'GET' && path === '/billing/invoices') {
      return await listInvoices(event);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Billing service error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
