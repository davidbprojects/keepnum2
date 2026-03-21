/* eslint-disable @typescript-eslint/no-require-imports */

// ─── Mocks (must be declared before handler import) ──────────────────────────

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

jest.mock('@keepnum/shared', () => ({
  resolveFlag: jest.fn().mockResolvedValue(true),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), auth: jest.fn(), request: jest.fn() },
  initLogger: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';
import { mockFetchResponse } from '@keepnum/shared/src/__tests__/helpers/mockFetch';
import { resolveFlag } from '@keepnum/shared';

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (resolveFlag as jest.Mock).mockResolvedValue(true);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authEvent(path: string, pathParameters?: Record<string, string>) {
  return buildMockEvent({
    method: 'GET',
    path,
    pathParameters,
    authorizer: { claims: { sub: 'cognito-sub-123' } },
  });
}

function mockUserLookup(found: boolean) {
  (mockPool.query as jest.Mock).mockResolvedValueOnce({
    rows: found ? [{ id: 'db-user-1' }] : [],
    rowCount: found ? 1 : 0,
  });
}

// ─── GET /download/voicemail/:id ─────────────────────────────────────────────

describe('GET /download/voicemail/:id', () => {
  it('returns 200 with pre-signed URL for a valid voicemail', async () => {
    // Validates: Requirements 9.2
    mockUserLookup(true);

    // Voicemail query
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 'vm-1', storage_key: 'voicemails/vm-1.mp3', deleted_at: null }],
      rowCount: 1,
    });

    // Telnyx pre-signed URL generation
    global.fetch = jest.fn().mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: { presigned_url: 'https://storage.telnyx.com/signed/vm-1.mp3?token=abc' },
      }),
    ) as jest.Mock;

    const event = authEvent('/download/voicemail/vm-1');
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.url).toBe('https://storage.telnyx.com/signed/vm-1.mp3?token=abc');
    expect(body.expiresAt).toBeDefined();
  });

  it('returns 404 when voicemail does not exist', async () => {
    // Validates: Requirements 9.2
    mockUserLookup(true);

    // Voicemail query returns empty
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const event = authEvent('/download/voicemail/vm-nonexistent');
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Voicemail not found' });
  });

  it('returns 404 for a deleted voicemail', async () => {
    // Validates: Requirements 9.2
    mockUserLookup(true);

    // Voicemail query returns deleted item
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 'vm-2', storage_key: 'voicemails/vm-2.mp3', deleted_at: '2024-01-01T00:00:00Z' }],
      rowCount: 1,
    });

    const event = authEvent('/download/voicemail/vm-2');
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Voicemail not found' });
  });

  it('returns 401 when not authenticated', async () => {
    const event = buildMockEvent({
      method: 'GET',
      path: '/download/voicemail/vm-1',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'Unauthorized' });
  });
});

// ─── GET /download/sms/:numberId ─────────────────────────────────────────────

describe('GET /download/sms/:numberId', () => {
  it('returns 200 with pre-signed URL for SMS CSV export', async () => {
    // Validates: Requirements 9.2
    mockUserLookup(true);

    // Parked number query
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 'pn-1', phone_number: '+15551234567' }],
      rowCount: 1,
    });

    // SMS messages query
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        { sender: '+15559999999', recipient: '+15551234567', body: 'Hello', received_at: '2024-06-01T12:00:00Z', direction: 'inbound' },
      ],
      rowCount: 1,
    });

    // Upload CSV to Telnyx Object Storage (PUT)
    // Generate pre-signed URL (POST)
    global.fetch = jest.fn()
      .mockResolvedValueOnce(mockFetchResponse(200, { data: {} }))
      .mockResolvedValueOnce(
        mockFetchResponse(200, {
          data: { presigned_url: 'https://storage.telnyx.com/signed/sms-export.csv?token=xyz' },
        }),
      ) as jest.Mock;

    const event = authEvent('/download/sms/pn-1');
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.url).toBe('https://storage.telnyx.com/signed/sms-export.csv?token=xyz');
    expect(body.expiresAt).toBeDefined();
  });

  it('returns 404 when parked number does not exist', async () => {
    // Validates: Requirements 9.2
    mockUserLookup(true);

    // Parked number query returns empty
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const event = authEvent('/download/sms/pn-nonexistent');
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Parked number not found' });
  });

  it('returns 404 when no SMS messages exist for the number', async () => {
    // Validates: Requirements 9.2
    mockUserLookup(true);

    // Parked number query
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 'pn-1', phone_number: '+15551234567' }],
      rowCount: 1,
    });

    // SMS messages query returns empty
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const event = authEvent('/download/sms/pn-1');
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'No SMS messages found for this number' });
  });

  it('returns 401 when not authenticated', async () => {
    const event = buildMockEvent({
      method: 'GET',
      path: '/download/sms/pn-1',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'Unauthorized' });
  });
});
