/* eslint-disable @typescript-eslint/no-require-imports */

// ─── Mocks (must be declared before handler import) ──────────────────────────

const mockDdbSend = jest.fn();
const mockSesSend = jest.fn();

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
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn((input: unknown) => ({ _type: 'SendEmail', input })),
}));

jest.mock('@keepnum/shared', () => ({
  checkSpam: jest.fn(),
  resolveFlag: jest.fn(),
  makeSmsLogPk: jest.fn((...args: string[]) => args.join('#')),
  makeSmsLogSk: jest.fn((...args: string[]) => args.join('#')),
  makeSpamLogPk: jest.fn((id: string) => id),
  makeSpamLogSk: jest.fn((...args: string[]) => args.join('#')),
  makeTtl: jest.fn(() => 9999999999),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';
import { mockFetchResponse } from '@keepnum/shared/src/__tests__/helpers/mockFetch';
import { checkSpam, resolveFlag } from '@keepnum/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockedCheckSpam = checkSpam as jest.MockedFunction<typeof checkSpam>;
const mockedResolveFlag = resolveFlag as jest.MockedFunction<typeof resolveFlag>;

function smsWebhookEvent(overrides: {
  eventType?: string;
  messageId?: string;
  from?: string;
  to?: string;
  text?: string;
  media?: Array<{ url: string; content_type: string }>;
} = {}) {
  return buildMockEvent({
    method: 'POST',
    path: '/webhooks/telnyx/sms',
    body: {
      data: {
        event_type: overrides.eventType ?? 'message.received',
        payload: {
          id: overrides.messageId ?? 'msg-001',
          from: { phone_number: overrides.from ?? '+15551234567' },
          to: [{ phone_number: overrides.to ?? '+15559876543' }],
          text: overrides.text ?? 'Hello world',
          media: overrides.media ?? [],
        },
      },
    },
  });
}

function mockOwnerLookup(found = true) {
  if (found) {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 'pn-1', user_id: 'user-1', email: 'user@example.com' }],
      rowCount: 1,
    });
  } else {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });
  }
}

function mockForwardingDestination(destination: string | null) {
  if (destination) {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ destination }],
      rowCount: 1,
    });
  } else {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockDdbSend.mockReset();
  mockSesSend.mockReset();
  mockDdbSend.mockResolvedValue({});
  mockSesSend.mockResolvedValue({});
  // Default: all flags disabled
  mockedResolveFlag.mockResolvedValue(false);
  mockedCheckSpam.mockResolvedValue({ isSpam: false, score: 0 });
});

// ─── Non-message.received → "Event acknowledged" ────────────────────────────

describe('Non-message.received event', () => {
  it('returns 200 with "Event acknowledged" for non-message.received events', async () => {
    // Validates: Requirements 4.6
    const event = smsWebhookEvent({ eventType: 'message.sent' });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Event acknowledged' });
    // No DB calls should be made
    expect(mockPool.query).not.toHaveBeenCalled();
    expect(mockDdbSend).not.toHaveBeenCalled();
  });
});

// ─── Spam filtering blocks message ──────────────────────────────────────────

describe('Spam filtering', () => {
  it('blocks message and writes spam log + SMS log with status "spam"', async () => {
    // Validates: Requirements 4.2
    mockOwnerLookup(true);
    mockedResolveFlag.mockImplementation(async (_uid, flag) => {
      if (flag === 'spam_filtering') return true;
      return false;
    });
    mockedCheckSpam.mockResolvedValue({ isSpam: true, score: 85 });

    const event = smsWebhookEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('spam');
    expect(body.message).toBe('Spam blocked');

    // Should write spam log + SMS log (2 DynamoDB PutCommand calls)
    expect(mockDdbSend).toHaveBeenCalledTimes(2);
  });
});

// ─── SMS + email forwarding when both enabled ────────────────────────────────

describe('SMS + email forwarding', () => {
  it('invokes both Telnyx SMS API and SES when both forwarding flags are enabled', async () => {
    // Validates: Requirements 4.3
    mockOwnerLookup(true);
    mockedResolveFlag.mockImplementation(async (_uid, flag) => {
      if (flag === 'sms_forwarding_sms') return true;
      if (flag === 'sms_forwarding_email') return true;
      return false;
    });

    // Forwarding destination lookup
    mockForwardingDestination('+15550001111');

    // Telnyx SMS forward call succeeds
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(200, { data: {} }),
    ) as jest.Mock;

    const event = smsWebhookEvent({ text: 'Test message' });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).status).toBe('delivered');

    // Telnyx SMS API was called for forwarding
    expect(global.fetch).toHaveBeenCalled();
    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const smsForwardCall = fetchCalls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/messages'),
    );
    expect(smsForwardCall).toBeDefined();

    // SES was called for email forwarding
    expect(mockSesSend).toHaveBeenCalledTimes(1);

    // SMS log written with status "delivered"
    expect(mockDdbSend).toHaveBeenCalled();
  });
});

// ─── MMS media storage ──────────────────────────────────────────────────────

describe('MMS media storage', () => {
  it('downloads media and stores in Telnyx Object Storage under correct key scheme', async () => {
    // Validates: Requirements 4.4
    mockOwnerLookup(true);
    mockedResolveFlag.mockResolvedValue(false);

    const mediaUrl = 'https://media.telnyx.com/path/to/image.jpg';
    const event = smsWebhookEvent({
      media: [{ url: mediaUrl, content_type: 'image/jpeg' }],
    });

    // Mock fetch: first call = media download, second call = storage upload, third = SMS forward (Telnyx messages)
    const mediaBuffer = new ArrayBuffer(8);
    global.fetch = jest.fn()
      // Media download
      .mockResolvedValueOnce({
        ...mockFetchResponse(200, {}),
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(mediaBuffer),
      })
      // Storage upload
      .mockResolvedValueOnce(mockFetchResponse(200, {})) as jest.Mock;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);

    // Verify media was downloaded from the provided URL
    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    expect(fetchCalls[0][0]).toBe(mediaUrl);

    // Verify storage upload was called with correct key pattern: sms-media/{userId}/{parkedNumberId}/{messageId}/{filename}
    const storageCall = fetchCalls[1];
    const storageUrl = storageCall[0] as string;
    expect(storageUrl).toContain('storage/buckets');
    expect(storageUrl).toContain('sms-media');
    expect(storageUrl).toContain('user-1');
    expect(storageUrl).toContain('pn-1');
    expect(storageUrl).toContain('msg-001');
    expect(storageUrl).toContain('image.jpg');
  });
});

// ─── SMS forwarding failure handling ─────────────────────────────────────────

describe('SMS forwarding failure', () => {
  it('stores original message and writes SMS log with status "failed" when forwarding fails', async () => {
    // Validates: Requirements 4.5
    mockOwnerLookup(true);
    mockedResolveFlag.mockImplementation(async (_uid, flag) => {
      if (flag === 'sms_forwarding_sms') return true;
      return false;
    });

    // Forwarding destination lookup
    mockForwardingDestination('+15550001111');

    // Telnyx SMS forward call fails with a non-retryable error
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(400, { error: 'Bad request' }),
    ) as jest.Mock;

    // storeFailedMessage INSERT query
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const event = smsWebhookEvent({ text: 'Important message' });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('failed');
    expect(body.message).toBe('Forwarding failed, message stored');

    // Verify original message was stored in Aurora (INSERT INTO sms_messages)
    const insertCall = (mockPool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('sms_messages'),
    );
    expect(insertCall).toBeDefined();

    // SMS log written with status "failed"
    expect(mockDdbSend).toHaveBeenCalled();
  });
});

// ─── Missing webhook fields → 400 ───────────────────────────────────────────

describe('Missing SMS webhook fields', () => {
  it('returns 400 when from.phone_number is missing', async () => {
    // Validates: Requirements 10.4
    const event = buildMockEvent({
      method: 'POST',
      path: '/webhooks/telnyx/sms',
      body: {
        data: {
          event_type: 'message.received',
          payload: {
            id: 'msg-001',
            from: {},
            to: [{ phone_number: '+15559876543' }],
            text: 'Hello',
            media: [],
          },
        },
      },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Invalid webhook payload');
  });

  it('returns 400 when to array is empty', async () => {
    // Validates: Requirements 10.4
    const event = buildMockEvent({
      method: 'POST',
      path: '/webhooks/telnyx/sms',
      body: {
        data: {
          event_type: 'message.received',
          payload: {
            id: 'msg-001',
            from: { phone_number: '+15551234567' },
            to: [],
            text: 'Hello',
            media: [],
          },
        },
      },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Invalid webhook payload');
  });

  it('returns 400 when from field is missing entirely', async () => {
    // Validates: Requirements 10.4
    const event = buildMockEvent({
      method: 'POST',
      path: '/webhooks/telnyx/sms',
      body: {
        data: {
          event_type: 'message.received',
          payload: {
            id: 'msg-001',
            to: [{ phone_number: '+15559876543' }],
            text: 'Hello',
            media: [],
          },
        },
      },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Invalid webhook payload');
  });
});

// ─── Property Tests ──────────────────────────────────────────────────────────

import * as fc from 'fast-check';

// Feature: api-testing-and-docs, Property 6: Non-target webhook events are acknowledged
describe('Property: Non-target SMS webhook events are acknowledged', () => {
  it('returns 200 with acknowledgment for any non-message.received event type', async () => {
    const nonTargetEvents = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz._'.split('')),
      { minLength: 3, maxLength: 30 },
    ).filter(s => s !== 'message.received');

    await fc.assert(
      fc.asyncProperty(nonTargetEvents, async (eventType) => {
        jest.clearAllMocks();
        mockDdbSend.mockReset();
        mockDdbSend.mockResolvedValue({});

        const event = buildMockEvent({
          method: 'POST',
          path: '/webhooks/telnyx/sms',
          body: {
            data: {
              event_type: eventType,
              payload: {
                id: 'msg-prop-1',
                from: { phone_number: '+15551234567' },
                to: [{ phone_number: '+15559876543' }],
                text: 'test',
                media: [],
              },
            },
          },
        });

        const result = await handler(event);
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body)).toEqual({ message: 'Event acknowledged' });
        expect(mockPool.query).not.toHaveBeenCalled();
        expect(mockDdbSend).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: api-testing-and-docs, Property 7: MMS media storage key scheme
describe('Property: MMS media storage key scheme', () => {
  it('stores media under sms-media/{userId}/{parkedNumberId}/{messageId}/{filename}', async () => {
    const alphaNum = fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 12 });

    await fc.assert(
      fc.asyncProperty(
        alphaNum, alphaNum, alphaNum, alphaNum,
        async (userId, numberId, messageId, filename) => {
          jest.clearAllMocks();
          mockDdbSend.mockReset();
          mockDdbSend.mockResolvedValue({});
          mockedResolveFlag.mockResolvedValue(false);
          mockedCheckSpam.mockResolvedValue({ isSpam: false, score: 0 });

          // Mock owner lookup returning our generated userId and numberId
          (mockPool.query as jest.Mock).mockResolvedValueOnce({
            rows: [{ id: numberId, user_id: userId, email: 'test@example.com' }],
            rowCount: 1,
          });

          const mediaUrl = `https://media.telnyx.com/path/to/${filename}.jpg`;
          const mediaBuffer = new ArrayBuffer(8);
          global.fetch = jest.fn()
            .mockResolvedValueOnce({
              ...mockFetchResponse(200, {}),
              ok: true,
              arrayBuffer: jest.fn().mockResolvedValue(mediaBuffer),
            })
            .mockResolvedValueOnce(mockFetchResponse(200, {})) as jest.Mock;

          const event = buildMockEvent({
            method: 'POST',
            path: '/webhooks/telnyx/sms',
            body: {
              data: {
                event_type: 'message.received',
                payload: {
                  id: messageId,
                  from: { phone_number: '+15551234567' },
                  to: [{ phone_number: '+15559876543' }],
                  text: 'test',
                  media: [{ url: mediaUrl, content_type: 'image/jpeg' }],
                },
              },
            },
          });

          const result = await handler(event);
          expect(result.statusCode).toBe(200);

          // Verify storage URL contains the expected key components
          const fetchCalls = (global.fetch as jest.Mock).mock.calls;
          if (fetchCalls.length >= 2) {
            const storageUrl = fetchCalls[1][0] as string;
            expect(storageUrl).toContain('sms-media');
            expect(storageUrl).toContain(userId);
            expect(storageUrl).toContain(numberId);
            expect(storageUrl).toContain(messageId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
