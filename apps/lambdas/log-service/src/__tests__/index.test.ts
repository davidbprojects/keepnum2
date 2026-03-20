/* eslint-disable @typescript-eslint/no-require-imports */

// ─── Mocks (must be declared before handler import) ──────────────────────────

const mockDocSend = jest.fn();

const helpers = require('@keepnum/shared/src/__tests__/helpers/mockDb');
const mockPool = helpers.createMockPool();

jest.mock('pg', () => {
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDocSend })) },
  PutCommand: jest.fn((input: unknown) => ({ _type: 'Put', input })),
  QueryCommand: jest.fn((input: unknown) => ({ _type: 'Query', input })),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockDocSend.mockReset();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authedEvent(options: Parameters<typeof buildMockEvent>[0] = {}) {
  return buildMockEvent({
    ...options,
    authorizer: {
      claims: { sub: 'cognito-sub-123' },
      ...options.authorizer,
    },
  });
}

// ─── Auth checks ─────────────────────────────────────────────────────────────

describe('Authentication', () => {
  it('returns 401 when no authorizer claims', async () => {
    const event = buildMockEvent({ method: 'GET', path: '/logs/calls' });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when user not found in DB', async () => {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const event = authedEvent({ method: 'GET', path: '/logs/calls' });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'User not found' });
  });
});

// ─── GET /logs/calls ─────────────────────────────────────────────────────────

describe('GET /logs/calls', () => {
  beforeEach(() => {
    // Default: user lookup succeeds
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'db-user-1' }], rowCount: 1 });
  });

  it('returns 400 when numberId is missing', async () => {
    // Validates: Requirements 9.1
    const event = authedEvent({ method: 'GET', path: '/logs/calls' });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'numberId query parameter is required' });
  });

  it('returns 200 with call log items for a valid numberId', async () => {
    // Validates: Requirements 9.1
    const mockItems = [
      { pk: 'db-user-1#num-1', sk: '2024-01-15T10:00:00Z#call-1', callId: 'call-1', callerId: '+15551234567', direction: 'inbound', duration: 120, disposition: 'answered' },
      { pk: 'db-user-1#num-1', sk: '2024-01-14T09:00:00Z#call-2', callId: 'call-2', callerId: '+15559876543', direction: 'outbound', duration: 60, disposition: 'voicemail' },
    ];
    mockDocSend.mockResolvedValueOnce({ Items: mockItems, LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/calls',
      queryStringParameters: { numberId: 'num-1' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.lastKey).toBeNull();
  });

  it('passes date range filters (from and to) to DynamoDB query', async () => {
    // Validates: Requirements 9.1
    mockDocSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/calls',
      queryStringParameters: { numberId: 'num-1', from: '2024-01-01', to: '2024-01-31' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    // Verify the QueryCommand was called with date range in key condition
    const queryInput = mockDocSend.mock.calls[0][0].input;
    expect(queryInput.KeyConditionExpression).toContain('BETWEEN');
    expect(queryInput.ExpressionAttributeValues[':skFrom']).toBe('2024-01-01');
    expect(queryInput.ExpressionAttributeValues[':skTo']).toContain('2024-01-31');
  });

  it('passes callerId filter to DynamoDB query', async () => {
    // Validates: Requirements 9.1
    mockDocSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/calls',
      queryStringParameters: { numberId: 'num-1', callerId: '+15551234567' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const queryInput = mockDocSend.mock.calls[0][0].input;
    expect(queryInput.FilterExpression).toContain('callerId = :callerId');
    expect(queryInput.ExpressionAttributeValues[':callerId']).toBe('+15551234567');
  });

  it('passes disposition filter to DynamoDB query', async () => {
    // Validates: Requirements 9.1
    mockDocSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/calls',
      queryStringParameters: { numberId: 'num-1', disposition: 'blocked' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const queryInput = mockDocSend.mock.calls[0][0].input;
    expect(queryInput.FilterExpression).toContain('disposition = :disposition');
    expect(queryInput.ExpressionAttributeValues[':disposition']).toBe('blocked');
  });

  it('passes combined callerId and disposition filters', async () => {
    // Validates: Requirements 9.1
    mockDocSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/calls',
      queryStringParameters: { numberId: 'num-1', callerId: '+15551234567', disposition: 'answered' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const queryInput = mockDocSend.mock.calls[0][0].input;
    expect(queryInput.FilterExpression).toContain('callerId = :callerId');
    expect(queryInput.FilterExpression).toContain('disposition = :disposition');
  });

  it('passes from-only date filter to DynamoDB query', async () => {
    // Validates: Requirements 9.1
    mockDocSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/calls',
      queryStringParameters: { numberId: 'num-1', from: '2024-01-15' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const queryInput = mockDocSend.mock.calls[0][0].input;
    expect(queryInput.KeyConditionExpression).toContain('sk >= :skFrom');
    expect(queryInput.ExpressionAttributeValues[':skFrom']).toBe('2024-01-15');
  });
});

// ─── GET /logs/sms ───────────────────────────────────────────────────────────

describe('GET /logs/sms', () => {
  beforeEach(() => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'db-user-1' }], rowCount: 1 });
  });

  it('returns 400 when numberId is missing', async () => {
    // Validates: Requirements 9.1
    const event = authedEvent({ method: 'GET', path: '/logs/sms' });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'numberId query parameter is required' });
  });

  it('returns 200 with SMS log items for a valid numberId', async () => {
    // Validates: Requirements 9.1
    const mockItems = [
      { pk: 'db-user-1#num-1', sk: '2024-01-15T10:00:00Z#msg-1', messageId: 'msg-1', sender: '+15551234567', recipient: '+15559876543', status: 'delivered', direction: 'inbound' },
    ];
    mockDocSend.mockResolvedValueOnce({ Items: mockItems, LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/sms',
      queryStringParameters: { numberId: 'num-1' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].messageId).toBe('msg-1');
    expect(body.lastKey).toBeNull();
  });

  it('passes date range filters (from and to) to DynamoDB query', async () => {
    // Validates: Requirements 9.1
    mockDocSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/sms',
      queryStringParameters: { numberId: 'num-1', from: '2024-02-01', to: '2024-02-28' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const queryInput = mockDocSend.mock.calls[0][0].input;
    expect(queryInput.KeyConditionExpression).toContain('BETWEEN');
    expect(queryInput.ExpressionAttributeValues[':skFrom']).toBe('2024-02-01');
    expect(queryInput.ExpressionAttributeValues[':skTo']).toContain('2024-02-28');
  });

  it('passes sender filter to DynamoDB query', async () => {
    // Validates: Requirements 9.1
    mockDocSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/sms',
      queryStringParameters: { numberId: 'num-1', sender: '+15551234567' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const queryInput = mockDocSend.mock.calls[0][0].input;
    expect(queryInput.FilterExpression).toContain('sender = :sender');
    expect(queryInput.ExpressionAttributeValues[':sender']).toBe('+15551234567');
  });

  it('passes status filter to DynamoDB query', async () => {
    // Validates: Requirements 9.1
    mockDocSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/sms',
      queryStringParameters: { numberId: 'num-1', status: 'spam' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const queryInput = mockDocSend.mock.calls[0][0].input;
    expect(queryInput.FilterExpression).toContain('#status = :status');
    expect(queryInput.ExpressionAttributeValues[':status']).toBe('spam');
  });

  it('passes combined sender and status filters', async () => {
    // Validates: Requirements 9.1
    mockDocSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = authedEvent({
      method: 'GET',
      path: '/logs/sms',
      queryStringParameters: { numberId: 'num-1', sender: '+15551234567', status: 'delivered' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const queryInput = mockDocSend.mock.calls[0][0].input;
    expect(queryInput.FilterExpression).toContain('sender = :sender');
    expect(queryInput.FilterExpression).toContain('#status = :status');
  });
});

// ─── 404 for unknown routes ──────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('returns 404 for unmatched path', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'db-user-1' }], rowCount: 1 });
    const event = authedEvent({ method: 'GET', path: '/logs/unknown' });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Not found' });
  });
});
