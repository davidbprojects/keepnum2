/* eslint-disable @typescript-eslint/no-require-imports */

// ─── Mocks (must be declared before handler import) ──────────────────────────

const mockSesSend = jest.fn().mockResolvedValue({});

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

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn((input: unknown) => ({ _type: 'SendEmail', input })),
}));

jest.mock('@keepnum/shared', () => ({
  resolveFlag: jest.fn().mockResolvedValue(true),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';
import { mockFetchResponse } from '@keepnum/shared/src/__tests__/helpers/mockFetch';
import { resolveFlag } from '@keepnum/shared';

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockSesSend.mockReset().mockResolvedValue({});
  (resolveFlag as jest.Mock).mockResolvedValue(true);
});


// ─── Helper: build a voicemail webhook event ─────────────────────────────────

function buildWebhookEvent(eventType: string, payload: Record<string, unknown>) {
  return buildMockEvent({
    method: 'POST',
    path: '/webhooks/telnyx/voicemail',
    body: {
      data: {
        event_type: eventType,
        payload,
      },
    },
  });
}

// ─── Helper: mock the full recording.completed happy path DB + fetch ─────────

function setupRecordingCompletedMocks() {
  // lookupParkedNumber → owner found
  (mockPool.query as jest.Mock)
    .mockResolvedValueOnce({
      rows: [{ id: 'pn-1', user_id: 'user-1', email: 'owner@example.com' }],
      rowCount: 1,
    })
    // INSERT voicemails
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  // fetch: audio download, then storage PUT, then transcription POST
  const fetchMock = jest.fn()
    .mockResolvedValueOnce(mockFetchResponse(200, {}))   // audio download
    .mockResolvedValueOnce(mockFetchResponse(200, {}))   // storage PUT
    .mockResolvedValueOnce(mockFetchResponse(200, {}));  // transcription trigger
  global.fetch = fetchMock;
}


// ─── POST /webhooks/telnyx/voicemail — recording.completed ───────────────────

describe('POST /webhooks/telnyx/voicemail — recording.completed', () => {
  it('stores audio, creates Aurora record, and triggers transcription', async () => {
    // Validates: Requirements 5.1, 5.2, 5.3
    setupRecordingCompletedMocks();

    const event = buildWebhookEvent('recording.completed', {
      recording_urls: { mp3: 'https://api.telnyx.com/recordings/rec-1.mp3' },
      recording_id: 'rec-1',
      from: '+15551234567',
      to: '+15559876543',
      duration_secs: 30,
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toContain('transcription pending');
    expect(body.voicemailId).toBeDefined();

    // Verify lookupParkedNumber query
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('parked_numbers'),
      expect.arrayContaining(['+15559876543']),
    );

    // Verify INSERT into voicemails
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO voicemails'),
      expect.arrayContaining(['pn-1', '+15551234567', 30]),
    );

    // Verify fetch calls: audio download, storage PUT, transcription trigger
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('returns 400 when recording URL is missing', async () => {
    const event = buildWebhookEvent('recording.completed', {
      recording_id: 'rec-1',
      from: '+15551234567',
      to: '+15559876543',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Missing recording');
  });

  it('returns 200 "Number not parked" when to-number is not parked', async () => {
    // Validates: Requirements 5.3
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = buildWebhookEvent('recording.completed', {
      recording_urls: { mp3: 'https://api.telnyx.com/recordings/rec-1.mp3' },
      recording_id: 'rec-1',
      from: '+15551234567',
      to: '+15550000000',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Number not parked');
  });
});


// ─── Transcription failure handling ──────────────────────────────────────────

describe('POST /webhooks/telnyx/voicemail — transcription trigger failure', () => {
  it('sets transcription_status to "failed", stores audio, and sends failure email via SES', async () => {
    // Validates: Requirements 5.3, 5.5
    // lookupParkedNumber → owner found
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{ id: 'pn-1', user_id: 'user-1', email: 'owner@example.com' }],
        rowCount: 1,
      })
      // INSERT voicemails
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // UPDATE voicemails SET transcription_status = 'failed'
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // SELECT phone_number from parked_numbers
      .mockResolvedValueOnce({
        rows: [{ phone_number: '+15559876543' }],
        rowCount: 1,
      });

    // fetch: audio download OK, storage PUT OK, transcription trigger FAILS
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(mockFetchResponse(200, {}))   // audio download
      .mockResolvedValueOnce(mockFetchResponse(200, {}))   // storage PUT
      .mockResolvedValueOnce(mockFetchResponse(400, { error: 'bad request' })); // transcription trigger fails (non-retryable 4xx)
    global.fetch = fetchMock;

    const event = buildWebhookEvent('recording.completed', {
      recording_urls: { mp3: 'https://api.telnyx.com/recordings/rec-1.mp3' },
      recording_id: 'rec-1',
      from: '+15551234567',
      to: '+15559876543',
      duration_secs: 15,
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toContain('transcription failed');
    expect(body.voicemailId).toBeDefined();

    // Verify transcription_status was set to 'failed'
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("transcription_status = 'failed'"),
      expect.any(Array),
    );

    // Verify SES failure notification email was sent
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });
});


// ─── recording.transcription.completed — success ─────────────────────────────

describe('POST /webhooks/telnyx/voicemail — recording.transcription.completed (success)', () => {
  it('updates voicemail record with transcription text and sends transcription email', async () => {
    // Validates: Requirements 5.1, 5.2, 5.4
    // Find pending voicemail
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: 'vm-1',
          parked_number_id: 'pn-1',
          caller_id: '+15551234567',
          received_at: '2024-01-15T10:00:00Z',
        }],
        rowCount: 1,
      })
      // lookupParkedNumberById → owner found
      .mockResolvedValueOnce({
        rows: [{ id: 'pn-1', user_id: 'user-1', email: 'owner@example.com' }],
        rowCount: 1,
      })
      // SELECT phone_number
      .mockResolvedValueOnce({
        rows: [{ phone_number: '+15559876543' }],
        rowCount: 1,
      })
      // UPDATE voicemails SET transcription, transcription_status
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const event = buildWebhookEvent('recording.transcription.completed', {
      recording_id: 'rec-1',
      transcription: {
        text: 'Hello, this is a test voicemail message.',
        status: 'completed',
      },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Transcription complete');
    expect(body.voicemailId).toBe('vm-1');

    // Verify UPDATE with transcription text
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE voicemails SET transcription'),
      expect.arrayContaining(['Hello, this is a test voicemail message.', 'complete', 'vm-1']),
    );

    // Verify transcription email was sent
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });
});


// ─── recording.transcription.completed — failure ─────────────────────────────

describe('POST /webhooks/telnyx/voicemail — recording.transcription.completed (failure)', () => {
  it('sets transcription_status to "failed" and sends failure notification email', async () => {
    // Validates: Requirements 5.5
    // Find pending voicemail
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{
          id: 'vm-2',
          parked_number_id: 'pn-1',
          caller_id: '+15551234567',
          received_at: '2024-01-15T11:00:00Z',
        }],
        rowCount: 1,
      })
      // lookupParkedNumberById → owner found
      .mockResolvedValueOnce({
        rows: [{ id: 'pn-1', user_id: 'user-1', email: 'owner@example.com' }],
        rowCount: 1,
      })
      // SELECT phone_number
      .mockResolvedValueOnce({
        rows: [{ phone_number: '+15559876543' }],
        rowCount: 1,
      })
      // UPDATE voicemails SET transcription_status = 'failed'
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const event = buildWebhookEvent('recording.transcription.completed', {
      recording_id: 'rec-2',
      transcription: {
        text: null,
        status: 'failed',
      },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toContain('Transcription failed');
    expect(body.voicemailId).toBe('vm-2');

    // Verify transcription_status was set to 'failed'
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('transcription_status'),
      expect.arrayContaining(['failed', 'vm-2']),
    );

    // Verify failure notification email was sent
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });
});


// ─── GET /voicemails — ownership filter ──────────────────────────────────────

describe('GET /voicemails', () => {
  it('returns only voicemails belonging to authenticated user that have not been deleted', async () => {
    // Validates: Requirements 5.6
    const userVoicemails = [
      { id: 'vm-1', parked_number_id: 'pn-1', caller_id: '+15551111111', duration_seconds: 20, storage_key: 'voicemails/user-1/pn-1/vm-1.mp3', transcription_status: 'complete', received_at: '2024-01-15T10:00:00Z' },
      { id: 'vm-2', parked_number_id: 'pn-1', caller_id: '+15552222222', duration_seconds: 45, storage_key: 'voicemails/user-1/pn-1/vm-2.mp3', transcription_status: 'pending', received_at: '2024-01-15T11:00:00Z' },
    ];

    // getDbUserId → user found
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{ id: 'db-user-1' }],
        rowCount: 1,
      })
      // SELECT voicemails with ownership join
      .mockResolvedValueOnce({
        rows: userVoicemails,
        rowCount: 2,
      });

    const event = buildMockEvent({
      method: 'GET',
      path: '/voicemails',
      authorizer: { claims: { sub: 'cognito-sub-1' } },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].id).toBe('vm-1');
    expect(body.items[1].id).toBe('vm-2');

    // Verify the query includes user_id filter and deleted_at IS NULL
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('pn.user_id = $1'),
      expect.arrayContaining(['db-user-1']),
    );
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('deleted_at IS NULL'),
      expect.any(Array),
    );
  });

  it('returns 401 when authorization claims are missing', async () => {
    const event = buildMockEvent({
      method: 'GET',
      path: '/voicemails',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error).toBe('Unauthorized');
  });
});


// ─── GET /voicemails/:id ─────────────────────────────────────────────────────

describe('GET /voicemails/:id', () => {
  it('returns the voicemail when it belongs to the authenticated user', async () => {
    // Validates: Requirements 5.6
    const voicemail = {
      id: 'vm-1',
      parked_number_id: 'pn-1',
      caller_id: '+15551234567',
      duration_seconds: 30,
      storage_key: 'voicemails/user-1/pn-1/vm-1.mp3',
      transcription: 'Hello, this is a test.',
      transcription_status: 'complete',
      received_at: '2024-01-15T10:00:00Z',
    };

    // getDbUserId → user found
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{ id: 'db-user-1' }],
        rowCount: 1,
      })
      // SELECT voicemail by id with ownership check
      .mockResolvedValueOnce({
        rows: [voicemail],
        rowCount: 1,
      });

    const event = buildMockEvent({
      method: 'GET',
      path: '/voicemails/vm-1',
      authorizer: { claims: { sub: 'cognito-sub-1' } },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.id).toBe('vm-1');
    expect(body.transcription).toBe('Hello, this is a test.');
  });

  it('returns 404 when voicemail does not belong to user or is deleted', async () => {
    // getDbUserId → user found
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{ id: 'db-user-1' }],
        rowCount: 1,
      })
      // SELECT voicemail → not found (different owner or deleted)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

    const event = buildMockEvent({
      method: 'GET',
      path: '/voicemails/vm-999',
      authorizer: { claims: { sub: 'cognito-sub-1' } },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe('Voicemail not found');
  });

  it('returns 401 when user is not found in DB', async () => {
    // getDbUserId → user not found
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

    const event = buildMockEvent({
      method: 'GET',
      path: '/voicemails/vm-1',
      authorizer: { claims: { sub: 'unknown-sub' } },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error).toBe('User not found');
  });
});
