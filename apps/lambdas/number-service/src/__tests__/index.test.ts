/* eslint-disable @typescript-eslint/no-require-imports */
import type { PoolClient } from 'pg';

// ─── Mocks (must be declared before handler import) ──────────────────────────

const helpers = require('@keepnum/shared/src/__tests__/helpers/mockDb');
const mockPool = helpers.createMockPool();

jest.mock('pg', () => {
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({ send: jest.fn().mockResolvedValue({ Parameter: { Value: 'test-telnyx-key' } }) })),
  GetParameterCommand: jest.fn(),
}));

// Mock feature flags — allow everything by default
jest.mock('@keepnum/shared', () => {
  const actual = jest.requireActual('@keepnum/shared');
  return {
    ...actual,
    assertFlag: jest.fn().mockResolvedValue(null),
    assertNumericLimit: jest.fn().mockResolvedValue(null),
    resolveFlag: jest.fn().mockResolvedValue(true),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), auth: jest.fn(), request: jest.fn() },
    initLogger: jest.fn(),
  };
});

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';
import { mockFetchResponse } from '@keepnum/shared/src/__tests__/helpers/mockFetch';
import { mockQueryResult } from '@keepnum/shared/src/__tests__/helpers/mockDb';

// ─── Constants ───────────────────────────────────────────────────────────────

const COGNITO_SUB = 'cognito-sub-123';
const DB_USER_ID = 'db-user-id-456';
const NUMBER_ID = 'parked-num-789';
const TELNYX_NUM_ID = 'telnyx-num-001';
const PHONE = '+15551234567';

function authedEvent(options: Parameters<typeof buildMockEvent>[0]) {
  return buildMockEvent({
    ...options,
    authorizer: { claims: { sub: COGNITO_SUB } },
  });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  await mockPool.end();
});

beforeEach(() => {
  jest.clearAllMocks();

  // Default: getDbUserId returns a valid user
  (mockPool.query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
    if (typeof sql === 'string' && sql.includes('SELECT id FROM users WHERE cognito_id')) {
      return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
    }
    return Promise.resolve(mockQueryResult([]));
  });
});

// ─── Unauthorized ────────────────────────────────────────────────────────────

describe('Authorization', () => {
  it('returns 401 when no authorizer claims', async () => {
    const event = buildMockEvent({ method: 'GET', path: '/numbers' });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when user not found in DB', async () => {
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([]));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({ method: 'GET', path: '/numbers' });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'User not found' });
  });
});

// ─── GET /numbers/search ─────────────────────────────────────────────────────

describe('GET /numbers/search', () => {
  it('returns formatted Telnyx search results', async () => {
    // Validates: Requirements 2.2
    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [
          {
            id: 'tn-1',
            phone_number: '+15551110000',
            number_type: 'local',
            cost_information: { monthly_cost: '1.50' },
          },
        ],
      }),
    ) as jest.Mock;

    const event = authedEvent({
      method: 'GET',
      path: '/numbers/search',
      queryStringParameters: { areaCode: '555' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual({
      telnyxNumberId: 'tn-1',
      phoneNumber: '+15551110000',
      numberType: 'local',
      monthlyCostCents: 150,
      available: true,
    });
  });

  it('returns 503 when Telnyx API is unavailable', async () => {
    // Validates: Requirements 2.3
    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse(500, { error: 'Internal Server Error' }),
    ) as jest.Mock;

    const event = authedEvent({
      method: 'GET',
      path: '/numbers/search',
      queryStringParameters: { areaCode: '555' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(503);
    expect(JSON.parse(result.body)).toEqual({
      error: 'Number search service is temporarily unavailable.',
    });
  });

  it('returns 503 when Telnyx API fetch throws (network error)', async () => {
    // Validates: Requirements 2.3
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error')) as jest.Mock;

    const event = authedEvent({
      method: 'GET',
      path: '/numbers/search',
      queryStringParameters: { areaCode: '555' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(503);
  });
});

// ─── POST /numbers ───────────────────────────────────────────────────────────

describe('POST /numbers', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  } as unknown as jest.Mocked<PoolClient>;

  beforeEach(() => {
    (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);
    (mockClient.query as jest.Mock).mockReset();
    (mockClient.release as jest.Mock).mockReset();
  });

  it('returns 201 after successful Telnyx provisioning', async () => {
    // Validates: Requirements 2.4
    // count query
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('COUNT')) {
        return Promise.resolve(mockQueryResult([{ count: '0' }]));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: {
          phone_numbers: [{ id: TELNYX_NUM_ID, phone_number: PHONE }],
        },
      }),
    ) as jest.Mock;

    // BEGIN, INSERT, COMMIT
    (mockClient.query as jest.Mock)
      .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
      .mockResolvedValueOnce(mockQueryResult([{ id: NUMBER_ID }])) // INSERT
      .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

    const event = authedEvent({
      method: 'POST',
      path: '/numbers',
      body: { telnyxNumberId: 'tn-order-1' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body);
    expect(body.id).toBe(NUMBER_ID);
    expect(body.phoneNumber).toBe(PHONE);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rolls back on Telnyx provisioning failure', async () => {
    // Validates: Requirements 2.5
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('COUNT')) {
        return Promise.resolve(mockQueryResult([{ count: '0' }]));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse(422, 'Provisioning failed'),
    ) as jest.Mock;

    (mockClient.query as jest.Mock)
      .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
      .mockResolvedValueOnce(mockQueryResult([])); // ROLLBACK

    const event = authedEvent({
      method: 'POST',
      path: '/numbers',
      body: { telnyxNumberId: 'tn-order-bad' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(502);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 400 when telnyxNumberId is missing', async () => {
    const event = authedEvent({
      method: 'POST',
      path: '/numbers',
      body: {},
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'telnyxNumberId is required' });
  });
});

// ─── GET /numbers ────────────────────────────────────────────────────────────

describe('GET /numbers', () => {
  it('returns list of active parked numbers', async () => {
    // Validates: Requirements 2.1
    const rows = [
      { id: 'pn-1', telnyx_number_id: 'tn-1', phone_number: '+15551111111', status: 'active', retention_policy: '30d', created_at: '2024-01-01', released_at: null },
      { id: 'pn-2', telnyx_number_id: 'tn-2', phone_number: '+15552222222', status: 'active', retention_policy: '60d', created_at: '2024-01-02', released_at: null },
    ];

    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('FROM parked_numbers') && sql.includes('ORDER BY')) {
        return Promise.resolve(mockQueryResult(rows));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({ method: 'GET', path: '/numbers' });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].id).toBe('pn-1');
  });
});

// ─── DELETE /numbers/:id ─────────────────────────────────────────────────────

describe('DELETE /numbers/:id', () => {
  it('releases number via Telnyx and marks as released', async () => {
    // Validates: Requirements 2.1
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('UPDATE parked_numbers SET status')) {
        return Promise.resolve(mockQueryResult([], 1));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse(200, { data: {} }),
    ) as jest.Mock;

    const event = authedEvent({ method: 'DELETE', path: `/numbers/${NUMBER_ID}` });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Number released' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when number not found or not owned', async () => {
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([]));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({ method: 'DELETE', path: '/numbers/nonexistent' });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });
});

// ─── PUT /numbers/:id/forwarding-rule ────────────────────────────────────────

describe('PUT /numbers/:id/forwarding-rule', () => {
  it('upserts forwarding rule and returns the rule', async () => {
    // Validates: Requirements 2.6
    const ruleRow = { id: 'fr-1', destination: '+15559999999', enabled: true, created_at: '2024-01-01', updated_at: '2024-01-01' };

    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('INSERT INTO forwarding_rules')) {
        return Promise.resolve(mockQueryResult([ruleRow]));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'PUT',
      path: `/numbers/${NUMBER_ID}/forwarding-rule`,
      body: { destination: '+15559999999', enabled: true },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).destination).toBe('+15559999999');
  });

  it('returns 400 when destination is missing', async () => {
    const event = authedEvent({
      method: 'PUT',
      path: `/numbers/${NUMBER_ID}/forwarding-rule`,
      body: {},
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'destination is required' });
  });

  it('returns 404 when number not owned', async () => {
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([]));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'PUT',
      path: '/numbers/unknown/forwarding-rule',
      body: { destination: '+15559999999' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });
});

// ─── PUT /numbers/:id/retention ──────────────────────────────────────────────

describe('PUT /numbers/:id/retention', () => {
  it('updates retention policy and returns new policy', async () => {
    // Validates: Requirements 2.7
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('UPDATE parked_numbers SET retention_policy')) {
        return Promise.resolve(mockQueryResult([], 1));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'PUT',
      path: `/numbers/${NUMBER_ID}/retention`,
      body: { policy: '60d' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.retentionPolicy).toBe('60d');
    expect(body.id).toBe(NUMBER_ID);
  });

  it('returns 400 for invalid retention policy', async () => {
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'PUT',
      path: `/numbers/${NUMBER_ID}/retention`,
      body: { policy: 'invalid' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when policy is missing', async () => {
    const event = authedEvent({
      method: 'PUT',
      path: `/numbers/${NUMBER_ID}/retention`,
      body: {},
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'policy is required' });
  });
});

// ─── PUT /numbers/:id/greeting ───────────────────────────────────────────────

describe('PUT /numbers/:id/greeting', () => {
  it('upserts greeting and returns the record', async () => {
    // Validates: Requirements 2.1
    const greetingRow = { id: 'gr-1', greeting_type: 'default', audio_key: null, tts_text: 'Hello', created_at: '2024-01-01' };

    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('INSERT INTO greetings')) {
        return Promise.resolve(mockQueryResult([greetingRow]));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'PUT',
      path: `/numbers/${NUMBER_ID}/greeting`,
      body: { greetingType: 'default', text: 'Hello' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).greeting_type).toBe('default');
  });

  it('returns 400 when greetingType is missing', async () => {
    const event = authedEvent({
      method: 'PUT',
      path: `/numbers/${NUMBER_ID}/greeting`,
      body: {},
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'greetingType is required' });
  });
});

// ─── POST /numbers/:id/caller-rules ─────────────────────────────────────────

describe('POST /numbers/:id/caller-rules', () => {
  it('creates a caller rule and returns 201', async () => {
    // Validates: Requirements 2.8
    const ruleRow = { id: 'cr-1', caller_id: '+15550001111', action: 'voicemail', action_data: null, created_at: '2024-01-01' };

    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('INSERT INTO caller_rules')) {
        return Promise.resolve(mockQueryResult([ruleRow]));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'POST',
      path: `/numbers/${NUMBER_ID}/caller-rules`,
      body: { callerId: '+15550001111', action: 'voicemail' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body).caller_id).toBe('+15550001111');
  });

  it('returns 400 when callerId or action is missing', async () => {
    const event = authedEvent({
      method: 'POST',
      path: `/numbers/${NUMBER_ID}/caller-rules`,
      body: { callerId: '+15550001111' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'callerId and action are required' });
  });
});

// ─── DELETE /numbers/:id/caller-rules/:ruleId ────────────────────────────────

describe('DELETE /numbers/:id/caller-rules/:ruleId', () => {
  it('deletes a caller rule and returns 200', async () => {
    // Validates: Requirements 2.1
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('DELETE FROM caller_rules')) {
        return Promise.resolve(mockQueryResult([], 1));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'DELETE',
      path: `/numbers/${NUMBER_ID}/caller-rules/cr-1`,
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Caller rule deleted' });
  });

  it('returns 404 when caller rule not found', async () => {
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('DELETE FROM caller_rules')) {
        return Promise.resolve(mockQueryResult([], 0));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'DELETE',
      path: `/numbers/${NUMBER_ID}/caller-rules/nonexistent`,
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });
});

// ─── POST /numbers/:id/blocklist ─────────────────────────────────────────────

describe('POST /numbers/:id/blocklist', () => {
  it('adds a caller to the block list and returns 201', async () => {
    // Validates: Requirements 2.8
    const blockRow = { id: 'bl-1', caller_id: '+15550009999', created_at: '2024-01-01' };

    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('INSERT INTO block_list')) {
        return Promise.resolve(mockQueryResult([blockRow]));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'POST',
      path: `/numbers/${NUMBER_ID}/blocklist`,
      body: { callerId: '+15550009999' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body).caller_id).toBe('+15550009999');
  });

  it('returns 200 when caller already in block list (conflict → DO NOTHING)', async () => {
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('INSERT INTO block_list')) {
        return Promise.resolve(mockQueryResult([])); // DO NOTHING returns empty
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'POST',
      path: `/numbers/${NUMBER_ID}/blocklist`,
      body: { callerId: '+15550009999' },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Caller already in block list' });
  });

  it('returns 400 when callerId is missing', async () => {
    const event = authedEvent({
      method: 'POST',
      path: `/numbers/${NUMBER_ID}/blocklist`,
      body: {},
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'callerId is required' });
  });
});

// ─── DELETE /numbers/:id/blocklist/:callerId ─────────────────────────────────

describe('DELETE /numbers/:id/blocklist/:callerId', () => {
  it('removes caller from block list and returns 200', async () => {
    // Validates: Requirements 2.1
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('DELETE FROM block_list')) {
        return Promise.resolve(mockQueryResult([], 1));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'DELETE',
      path: `/numbers/${NUMBER_ID}/blocklist/+15550009999`,
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Removed from block list' });
  });

  it('returns 404 when block list entry not found', async () => {
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE cognito_id')) {
        return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
      }
      if (sql.includes('SELECT id, telnyx_number_id, phone_number')) {
        return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
      }
      if (sql.includes('DELETE FROM block_list')) {
        return Promise.resolve(mockQueryResult([], 0));
      }
      return Promise.resolve(mockQueryResult([]));
    });

    const event = authedEvent({
      method: 'DELETE',
      path: `/numbers/${NUMBER_ID}/blocklist/+15550000000`,
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });
});

// ─── 404 for unknown routes ──────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('returns 404 for unmatched path', async () => {
    const event = authedEvent({ method: 'GET', path: '/unknown' });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Not found' });
  });
});

// ─── Property Tests ──────────────────────────────────────────────────────────

import * as fc from 'fast-check';

const e164Phone = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 10, maxLength: 10 })
  .map(s => `+1${s}`);

// Feature: keepnum-app, Property 5: Parking a number makes it appear in the user's list
describe('Property: Parking a number and list round-trip', () => {
  it('provisioned numbers appear in the user list', async () => {
    await fc.assert(
      fc.asyncProperty(e164Phone, async (phone) => {
        jest.clearAllMocks();
        const numberId = `pn-${phone}`;
        const telnyxId = `tn-${phone}`;

        const mockClient = { query: jest.fn(), release: jest.fn() };
        (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);

        (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
          if (sql.includes('SELECT id FROM users WHERE cognito_id'))
            return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
          if (sql.includes('COUNT'))
            return Promise.resolve(mockQueryResult([{ count: '0' }]));
          return Promise.resolve(mockQueryResult([]));
        });

        global.fetch = jest.fn().mockResolvedValueOnce(
          mockFetchResponse(200, {
            data: { phone_numbers: [{ id: telnyxId, phone_number: phone }] },
          }),
        ) as jest.Mock;

        (mockClient.query as jest.Mock)
          .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
          .mockResolvedValueOnce(mockQueryResult([{ id: numberId }])) // INSERT
          .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

        const provisionEvent = authedEvent({
          method: 'POST',
          path: '/numbers',
          body: { telnyxNumberId: telnyxId },
        });
        const provisionResult = await handler(provisionEvent);
        expect(provisionResult.statusCode).toBe(201);
        expect(JSON.parse(provisionResult.body).phoneNumber).toBe(phone);

        // Now list — mock returns the provisioned number
        (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
          if (sql.includes('SELECT id FROM users WHERE cognito_id'))
            return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
          if (sql.includes('FROM parked_numbers') && sql.includes('ORDER BY'))
            return Promise.resolve(mockQueryResult([{
              id: numberId, telnyx_number_id: telnyxId, phone_number: phone,
              status: 'active', retention_policy: '30d', created_at: '2024-01-01', released_at: null,
            }]));
          return Promise.resolve(mockQueryResult([]));
        });

        const listEvent = authedEvent({ method: 'GET', path: '/numbers' });
        const listResult = await handler(listEvent);
        expect(listResult.statusCode).toBe(200);
        const items = JSON.parse(listResult.body).items;
        expect(items.some((n: { phone_number: string }) => n.phone_number === phone)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: keepnum-app, Property 6: Failed provisioning leaves state unchanged
describe('Property: Failed provisioning leaves state unchanged', () => {
  it('rolls back on Telnyx failure for any phone number', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(400, 403, 422, 500, 502, 503),
        async (statusCode) => {
          jest.clearAllMocks();
          const mockClient = { query: jest.fn(), release: jest.fn() };
          (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);

          (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
            if (sql.includes('SELECT id FROM users WHERE cognito_id'))
              return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
            if (sql.includes('COUNT'))
              return Promise.resolve(mockQueryResult([{ count: '0' }]));
            return Promise.resolve(mockQueryResult([]));
          });

          global.fetch = jest.fn().mockResolvedValueOnce(
            mockFetchResponse(statusCode, 'Provisioning failed'),
          ) as jest.Mock;

          (mockClient.query as jest.Mock)
            .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
            .mockResolvedValueOnce(mockQueryResult([])); // ROLLBACK

          const event = authedEvent({
            method: 'POST',
            path: '/numbers',
            body: { telnyxNumberId: 'tn-fail' },
          });
          const result = await handler(event);
          expect(result.statusCode).toBe(502);
          expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
          expect(mockClient.release).toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: keepnum-app, Property 7: Forwarding rule round-trip and single-rule invariant
describe('Property: Forwarding rule round-trip and single-rule invariant', () => {
  it('upserts forwarding rule with the last destination', async () => {
    await fc.assert(
      fc.asyncProperty(e164Phone, async (destination) => {
        jest.clearAllMocks();
        const ruleRow = { id: 'fr-1', destination, enabled: true, created_at: '2024-01-01', updated_at: '2024-01-01' };

        (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
          if (sql.includes('SELECT id FROM users WHERE cognito_id'))
            return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
          if (sql.includes('SELECT id, telnyx_number_id, phone_number'))
            return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
          if (sql.includes('INSERT INTO forwarding_rules'))
            return Promise.resolve(mockQueryResult([ruleRow]));
          return Promise.resolve(mockQueryResult([]));
        });

        const event = authedEvent({
          method: 'PUT',
          path: `/numbers/${NUMBER_ID}/forwarding-rule`,
          body: { destination, enabled: true },
        });
        const result = await handler(event);
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).destination).toBe(destination);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: keepnum-app, Property 13: Retention policy round-trip
describe('Property: Retention policy round-trip', () => {
  it('accepts valid retention policies and returns them', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('30d', '60d', '90d', 'forever'),
        async (policy) => {
          jest.clearAllMocks();
          (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
            if (sql.includes('SELECT id FROM users WHERE cognito_id'))
              return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
            if (sql.includes('SELECT id, telnyx_number_id, phone_number'))
              return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
            if (sql.includes('UPDATE parked_numbers SET retention_policy'))
              return Promise.resolve(mockQueryResult([], 1));
            return Promise.resolve(mockQueryResult([]));
          });

          const event = authedEvent({
            method: 'PUT',
            path: `/numbers/${NUMBER_ID}/retention`,
            body: { policy },
          });
          const result = await handler(event);
          expect(result.statusCode).toBe(200);
          expect(JSON.parse(result.body).retentionPolicy).toBe(policy);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: keepnum-app, Property 22: Number search results match filter criteria
describe('Property: Number search results match filter criteria', () => {
  it('returns formatted results from Telnyx for any area code', async () => {
    const areaCode = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 3, maxLength: 3 });

    await fc.assert(
      fc.asyncProperty(areaCode, async (ac) => {
        jest.clearAllMocks();
        const phone = `+1${ac}1234567`;
        global.fetch = jest.fn().mockResolvedValueOnce(
          mockFetchResponse(200, {
            data: [{
              id: 'tn-1', phone_number: phone, number_type: 'local',
              cost_information: { monthly_cost: '1.50' },
            }],
          }),
        ) as jest.Mock;

        (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
          if (sql.includes('SELECT id FROM users WHERE cognito_id'))
            return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
          return Promise.resolve(mockQueryResult([]));
        });

        const event = authedEvent({
          method: 'GET',
          path: '/numbers/search',
          queryStringParameters: { areaCode: ac },
        });
        const result = await handler(event);
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.items).toHaveLength(1);
        expect(body.items[0].phoneNumber).toBe(phone);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: keepnum-app, Property 23: Telnyx unavailability returns error, not stale data
describe('Property: Telnyx unavailability returns error not stale data', () => {
  it('returns 503 for any server error status from Telnyx', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(500, 502, 503, 504),
        async (status) => {
          jest.clearAllMocks();
          global.fetch = jest.fn().mockResolvedValueOnce(
            mockFetchResponse(status, { error: 'Server error' }),
          ) as jest.Mock;

          (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
            if (sql.includes('SELECT id FROM users WHERE cognito_id'))
              return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
            return Promise.resolve(mockQueryResult([]));
          });

          const event = authedEvent({
            method: 'GET',
            path: '/numbers/search',
            queryStringParameters: { areaCode: '555' },
          });
          const result = await handler(event);
          expect(result.statusCode).toBe(503);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: keepnum-app, Property 24: Per-caller rule round-trip and routing
describe('Property: Per-caller rule round-trip and routing', () => {
  it('creates caller rules for any valid caller ID and action', async () => {
    await fc.assert(
      fc.asyncProperty(
        e164Phone,
        fc.constantFrom('voicemail', 'disconnect', 'forward', 'custom_greeting'),
        async (callerId, action) => {
          jest.clearAllMocks();
          const ruleRow = { id: 'cr-gen', caller_id: callerId, action, action_data: null, created_at: '2024-01-01' };

          (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
            if (sql.includes('SELECT id FROM users WHERE cognito_id'))
              return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
            if (sql.includes('SELECT id, telnyx_number_id, phone_number'))
              return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
            if (sql.includes('INSERT INTO caller_rules'))
              return Promise.resolve(mockQueryResult([ruleRow]));
            return Promise.resolve(mockQueryResult([]));
          });

          const event = authedEvent({
            method: 'POST',
            path: `/numbers/${NUMBER_ID}/caller-rules`,
            body: { callerId, action },
          });
          const result = await handler(event);
          expect(result.statusCode).toBe(201);
          const body = JSON.parse(result.body);
          expect(body.caller_id).toBe(callerId);
          expect(body.action).toBe(action);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: keepnum-app, Property 26: Smart greeting selects correct message by caller type
describe('Property: Smart greeting selects correct greeting type', () => {
  it('upserts greeting for any valid greeting type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('default', 'custom', 'tts', 'smart'),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (greetingType, text) => {
          jest.clearAllMocks();
          const greetingRow = { id: 'gr-gen', greeting_type: greetingType, audio_key: null, tts_text: text, created_at: '2024-01-01' };

          (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
            if (sql.includes('SELECT id FROM users WHERE cognito_id'))
              return Promise.resolve(mockQueryResult([{ id: DB_USER_ID }]));
            if (sql.includes('SELECT id, telnyx_number_id, phone_number'))
              return Promise.resolve(mockQueryResult([{ id: NUMBER_ID, telnyx_number_id: TELNYX_NUM_ID, phone_number: PHONE }]));
            if (sql.includes('INSERT INTO greetings'))
              return Promise.resolve(mockQueryResult([greetingRow]));
            return Promise.resolve(mockQueryResult([]));
          });

          const event = authedEvent({
            method: 'PUT',
            path: `/numbers/${NUMBER_ID}/greeting`,
            body: { greetingType, text },
          });
          const result = await handler(event);
          expect(result.statusCode).toBe(200);
          expect(JSON.parse(result.body).greeting_type).toBe(greetingType);
        },
      ),
      { numRuns: 100 },
    );
  });
});
