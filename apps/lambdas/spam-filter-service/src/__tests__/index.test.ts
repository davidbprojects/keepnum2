/* eslint-disable @typescript-eslint/no-require-imports */

// ─── Mocks (must be declared before handler import) ──────────────────────────

const mockDdbSend = jest.fn();

const helpers = require('@keepnum/shared/src/__tests__/helpers/mockDb');
const mockPool = helpers.createMockPool();

jest.mock('pg', () => {
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({
    send: jest.fn().mockResolvedValue({ Parameter: { Value: 'test-telnyx-key' } }),
  })),
  GetParameterCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDdbSend })) },
  PutCommand: jest.fn((input: unknown) => ({ _type: 'Put', input })),
  QueryCommand: jest.fn((input: unknown) => ({ _type: 'Query', input })),
  UpdateCommand: jest.fn((input: unknown) => ({ _type: 'Update', input })),
}));

jest.mock('@keepnum/shared', () => ({
  checkSpam: jest.fn(),
  assertFlag: jest.fn().mockResolvedValue(null),
  makeSpamLogPk: jest.fn((userId: string) => userId),
  makeSpamLogSk: jest.fn((ts: string, id: string) => `${ts}#${id}`),
  makeTtl: jest.fn(() => 9999999999),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), auth: jest.fn(), request: jest.fn() },
  initLogger: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';
import { assertFlag } from '@keepnum/shared';

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockDdbSend.mockReset();
  (assertFlag as jest.Mock).mockResolvedValue(null);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authEvent(method: string, path: string) {
  return buildMockEvent({
    method,
    path,
    authorizer: { claims: { sub: 'cognito-sub-123' } },
  });
}

function mockUserLookup(found: boolean) {
  (mockPool.query as jest.Mock).mockResolvedValueOnce({
    rows: found ? [{ id: 'db-user-1' }] : [],
    rowCount: found ? 1 : 0,
  });
}

// ─── GET /spam-log ───────────────────────────────────────────────────────────

describe('GET /spam-log', () => {
  it('returns 200 with spam log items for authenticated user', async () => {
    // Validates: Requirements 9.3
    mockUserLookup(true);

    const spamItems = [
      { pk: 'db-user-1', sk: '2024-06-01T00:00:00Z#item-1', itemId: 'item-1', itemType: 'call', callerId: '+15559999999', falsePositive: false, ttl: 9999999999 },
      { pk: 'db-user-1', sk: '2024-06-02T00:00:00Z#item-2', itemId: 'item-2', itemType: 'sms', callerId: '+15558888888', falsePositive: false, ttl: 9999999999 },
    ];

    mockDdbSend.mockResolvedValueOnce({ Items: spamItems });

    const event = authEvent('GET', '/spam-log');
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].itemId).toBe('item-1');
    expect(body.items[1].itemId).toBe('item-2');
  });

  it('returns 200 with empty array when no spam log entries exist', async () => {
    // Validates: Requirements 9.3
    mockUserLookup(true);

    mockDdbSend.mockResolvedValueOnce({ Items: [] });

    const event = authEvent('GET', '/spam-log');
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ items: [] });
  });

  it('returns 401 when not authenticated', async () => {
    const event = buildMockEvent({ method: 'GET', path: '/spam-log' });
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when user not found in database', async () => {
    mockUserLookup(false);

    const event = authEvent('GET', '/spam-log');
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'User not found' });
  });

  it('returns 403 when spam_filtering feature flag is disabled', async () => {
    // Validates: Requirements 9.3
    mockUserLookup(true);
    (assertFlag as jest.Mock).mockResolvedValueOnce({
      statusCode: 403,
      body: JSON.stringify({ error: "Feature 'spam_filtering' is not available on your current plan." }),
    });

    const event = authEvent('GET', '/spam-log');
    const result = await handler(event);

    expect(result.statusCode).toBe(403);
  });
});

// ─── PUT /spam-log/:itemId/false-positive ────────────────────────────────────

describe('PUT /spam-log/:itemId/false-positive', () => {
  it('returns 200 and marks entry as false positive with allow-list creation', async () => {
    // Validates: Requirements 9.3
    mockUserLookup(true);

    // DynamoDB query to find the spam log entry
    mockDdbSend.mockResolvedValueOnce({
      Items: [
        {
          pk: 'db-user-1',
          sk: '2024-06-01T00:00:00Z#item-1',
          itemId: 'item-1',
          itemType: 'call',
          callerId: '+15559999999',
          falsePositive: false,
          ttl: 9999999999,
        },
      ],
    });

    // DynamoDB update to set falsePositive = true
    mockDdbSend.mockResolvedValueOnce({});

    // Aurora INSERT INTO block_list for allow-listing
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const event = authEvent('PUT', '/spam-log/item-1/false-positive');
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Marked as false positive and added to allow list');
    expect(body.itemId).toBe('item-1');
    expect(body.callerId).toBe('+15559999999');

    // Verify DynamoDB update was called
    expect(mockDdbSend).toHaveBeenCalledTimes(2);

    // Verify allow-list insert was called with allow: prefix
    expect(mockPool.query).toHaveBeenCalledTimes(2); // user lookup + block_list insert
    const blockListCall = (mockPool.query as jest.Mock).mock.calls[1];
    expect(blockListCall[1]).toContain('allow:+15559999999');
  });

  it('returns 404 when spam log entry does not exist', async () => {
    // Validates: Requirements 9.3
    mockUserLookup(true);

    // DynamoDB query returns no items
    mockDdbSend.mockResolvedValueOnce({ Items: [] });

    const event = authEvent('PUT', '/spam-log/nonexistent-item/false-positive');
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Spam log entry not found' });
  });

  it('returns 401 when not authenticated', async () => {
    const event = buildMockEvent({
      method: 'PUT',
      path: '/spam-log/item-1/false-positive',
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'Unauthorized' });
  });
});

// ─── 404 for unknown routes ──────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('returns 404 for unmatched routes', async () => {
    mockUserLookup(true);

    const event = authEvent('GET', '/unknown-route');
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Not found' });
  });
});
