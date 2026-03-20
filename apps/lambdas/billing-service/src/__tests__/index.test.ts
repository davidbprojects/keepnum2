/* eslint-disable @typescript-eslint/no-require-imports */

// ─── Mocks (must be declared before handler import) ──────────────────────────

const mockSsmSend = jest.fn();
const mockSesSend = jest.fn();

const helpers = require('@keepnum/shared/src/__tests__/helpers/mockDb');
const mockPool = helpers.createMockPool();

jest.mock('pg', () => {
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({ send: mockSsmSend })),
  GetParameterCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn((input: unknown) => ({ _type: 'SendEmail', input })),
}));

// Mock crypto for HMAC validation
const mockCreateHmac = jest.fn();
const mockTimingSafeEqual = jest.fn();

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    createHmac: (...args: unknown[]) => mockCreateHmac(...args),
    timingSafeEqual: (...args: unknown[]) => mockTimingSafeEqual(...args),
  };
});

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';
import { mockFetchResponse } from '@keepnum/shared/src/__tests__/helpers/mockFetch';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupSsmMocks() {
  mockSsmSend.mockResolvedValue({ Parameter: { Value: 'test-value' } });
}

function buildAdyenNotificationItem(overrides: Record<string, unknown> = {}) {
  return {
    NotificationRequestItem: {
      eventCode: 'AUTHORISATION',
      pspReference: 'psp-ref-123',
      merchantReference: 'session-user-123-1234567890',
      amount: { value: 1000, currency: 'USD' },
      success: 'true',
      additionalData: { hmacSignature: 'valid-sig' },
      reason: '',
      ...overrides,
    },
  };
}

function buildAdyenWebhookEvent(notificationItems: unknown[]) {
  return buildMockEvent({
    method: 'POST',
    path: '/webhooks/adyen',
    resource: '/webhooks/adyen',
    body: {
      live: 'false',
      notificationItems,
    },
  });
}

function setupValidHmac() {
  const hmacObj = {
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('computed-hmac-base64'),
  };
  mockCreateHmac.mockReturnValue(hmacObj);
  mockTimingSafeEqual.mockReturnValue(true);
  return hmacObj;
}

function setupInvalidHmac() {
  const hmacObj = {
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('wrong-hmac-base64'),
  };
  mockCreateHmac.mockReturnValue(hmacObj);
  mockTimingSafeEqual.mockReturnValue(false);
  return hmacObj;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockSsmSend.mockReset();
  mockSesSend.mockReset();
  mockCreateHmac.mockReset();
  mockTimingSafeEqual.mockReset();
  setupSsmMocks();
  mockSesSend.mockResolvedValue({});
});

// ─── POST /webhooks/adyen ────────────────────────────────────────────────────

describe('POST /webhooks/adyen', () => {
  it('returns 401 for invalid HMAC signature', async () => {
    // Validates: Requirements 6.2
    setupInvalidHmac();

    const event = buildAdyenWebhookEvent([buildAdyenNotificationItem()]);
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'Invalid HMAC signature' });
  });

  it('returns 200 with [accepted] for AUTHORISATION success', async () => {
    // Validates: Requirements 6.3
    setupValidHmac();

    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // UPDATE subscriptions
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE invoices

    const event = buildAdyenWebhookEvent([
      buildAdyenNotificationItem({ success: 'true', eventCode: 'AUTHORISATION' }),
    ]);
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ notificationResponse: '[accepted]' });
  });

  it('sets subscription to past_due and sends decline email for AUTHORISATION failure', async () => {
    // Validates: Requirements 6.4
    setupValidHmac();

    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // UPDATE subscriptions to past_due
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // UPDATE invoices to failed
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }], rowCount: 1 }); // SELECT user email

    const event = buildAdyenWebhookEvent([
      buildAdyenNotificationItem({
        success: 'false',
        eventCode: 'AUTHORISATION',
        reason: 'Insufficient funds',
      }),
    ]);
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ notificationResponse: '[accepted]' });
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });

  it('sets invoice to chargeback and subscription to past_due for CHARGEBACK', async () => {
    // Validates: Requirements 6.5
    setupValidHmac();

    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // UPDATE invoices to chargeback
      .mockResolvedValueOnce({ rows: [{ subscription_id: 'sub-1', user_id: 'user-1' }], rowCount: 1 }) // SELECT invoice
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // UPDATE subscription to past_due
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }], rowCount: 1 }); // SELECT user email

    const event = buildAdyenWebhookEvent([
      buildAdyenNotificationItem({ eventCode: 'CHARGEBACK' }),
    ]);
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ notificationResponse: '[accepted]' });
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });

  it('sets invoice to refunded for REFUND', async () => {
    // Validates: Requirements 6.6
    setupValidHmac();

    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE invoices to refunded

    const event = buildAdyenWebhookEvent([
      buildAdyenNotificationItem({ eventCode: 'REFUND' }),
    ]);
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ notificationResponse: '[accepted]' });
  });
});

// ─── POST /billing/session ───────────────────────────────────────────────────

describe('POST /billing/session', () => {
  it('returns 200 with sessionId and sessionData', async () => {
    // Validates: Requirements 7.2
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }], rowCount: 1 });

    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse(200, { id: 'session-abc', sessionData: 'data-xyz' }),
    ) as jest.Mock;

    const event = buildMockEvent({
      method: 'POST',
      path: '/billing/session',
      resource: '/billing/session',
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.sessionId).toBe('session-abc');
    expect(body.sessionData).toBe('data-xyz');
  });

  it('returns 401 without auth', async () => {
    const event = buildMockEvent({
      method: 'POST',
      path: '/billing/session',
      resource: '/billing/session',
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });
});

// ─── POST /billing/subscriptions ─────────────────────────────────────────────

describe('POST /billing/subscriptions', () => {
  it('returns 201 when creating a new subscription', async () => {
    // Validates: Requirements 7.1
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'pkg-1', price_monthly_cents: 999 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'sub-new' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'sub-new', status: 'active', package_id: 'pkg-1' }], rowCount: 1 });

    const event = buildMockEvent({
      method: 'POST',
      path: '/billing/subscriptions',
      resource: '/billing/subscriptions',
      body: { packageId: 'pkg-1' },
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.id).toBe('sub-new');
    expect(body.status).toBe('active');
  });

  it('returns 409 when user already has an active subscription', async () => {
    // Validates: Requirements 7.3
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'pkg-1', price_monthly_cents: 999 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-sub' }], rowCount: 1 });

    const event = buildMockEvent({
      method: 'POST',
      path: '/billing/subscriptions',
      resource: '/billing/subscriptions',
      body: { packageId: 'pkg-1' },
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body)).toEqual({
      error: 'Active subscription already exists. Use PUT to update.',
    });
  });

  it('returns 400 when packageId is missing', async () => {
    const event = buildMockEvent({
      method: 'POST',
      path: '/billing/subscriptions',
      resource: '/billing/subscriptions',
      body: {},
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });
});

// ─── PUT /billing/subscriptions/:id ──────────────────────────────────────────

describe('PUT /billing/subscriptions/:id', () => {
  it('returns 200 when updating subscription package', async () => {
    // Validates: Requirements 7.1
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'active' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'pkg-2' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'active', package_id: 'pkg-2' }], rowCount: 1 });

    const event = buildMockEvent({
      method: 'PUT',
      path: '/billing/subscriptions/sub-1',
      resource: '/billing/subscriptions/{id}',
      body: { packageId: 'pkg-2' },
      pathParameters: { id: 'sub-1' },
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.package_id).toBe('pkg-2');
  });

  it('returns 400 when updating a cancelled subscription', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'cancelled' }], rowCount: 1 });

    const event = buildMockEvent({
      method: 'PUT',
      path: '/billing/subscriptions/sub-1',
      resource: '/billing/subscriptions/{id}',
      body: { packageId: 'pkg-2' },
      pathParameters: { id: 'sub-1' },
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('cancelled');
  });
});

// ─── DELETE /billing/subscriptions/:id ───────────────────────────────────────

describe('DELETE /billing/subscriptions/:id', () => {
  it('returns 200 when cancelling an active subscription', async () => {
    // Validates: Requirements 7.1
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'active' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'cancelled', cancel_at_period_end: true }], rowCount: 1 });

    const event = buildMockEvent({
      method: 'DELETE',
      path: '/billing/subscriptions/sub-1',
      resource: '/billing/subscriptions/{id}',
      pathParameters: { id: 'sub-1' },
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('cancelled');
  });

  it('returns 400 when subscription is already cancelled', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'cancelled' }], rowCount: 1 });

    const event = buildMockEvent({
      method: 'DELETE',
      path: '/billing/subscriptions/sub-1',
      resource: '/billing/subscriptions/{id}',
      pathParameters: { id: 'sub-1' },
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('already cancelled');
  });
});

// ─── POST /billing/subscriptions/:id/reactivate ─────────────────────────────

describe('POST /billing/subscriptions/:id/reactivate', () => {
  it('returns 200 and sets status to active for cancelled subscription', async () => {
    // Validates: Requirements 7.4
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'cancelled' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: 'sub-1', status: 'active', cancel_at_period_end: false }],
        rowCount: 1,
      });

    const event = buildMockEvent({
      method: 'POST',
      path: '/billing/subscriptions/sub-1/reactivate',
      resource: '/billing/subscriptions/{id}/reactivate',
      pathParameters: { id: 'sub-1' },
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('active');
    expect(body.cancel_at_period_end).toBe(false);
  });

  it('returns 400 when subscription is active (not reactivatable)', async () => {
    // Validates: Requirements 7.5
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'active' }], rowCount: 1 });

    const event = buildMockEvent({
      method: 'POST',
      path: '/billing/subscriptions/sub-1/reactivate',
      resource: '/billing/subscriptions/{id}/reactivate',
      pathParameters: { id: 'sub-1' },
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('cancelled or past_due');
  });

  it('returns 400 when subscription is trialing (not reactivatable)', async () => {
    // Validates: Requirements 7.5
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'trialing' }], rowCount: 1 });

    const event = buildMockEvent({
      method: 'POST',
      path: '/billing/subscriptions/sub-1/reactivate',
      resource: '/billing/subscriptions/{id}/reactivate',
      pathParameters: { id: 'sub-1' },
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});

// ─── GET /billing/invoices ───────────────────────────────────────────────────

describe('GET /billing/invoices', () => {
  it('returns paginated invoices for authenticated user', async () => {
    // Validates: Requirements 7.1
    const invoices = [
      { id: 'inv-1', amount_cents: 999, status: 'paid' },
      { id: 'inv-2', amount_cents: 999, status: 'pending' },
    ];

    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: invoices, rowCount: 2 });

    const event = buildMockEvent({
      method: 'GET',
      path: '/billing/invoices',
      resource: '/billing/invoices',
      authorizer: { claims: { sub: 'user-123' } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('returns 401 without auth', async () => {
    const event = buildMockEvent({
      method: 'GET',
      path: '/billing/invoices',
      resource: '/billing/invoices',
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });
});
