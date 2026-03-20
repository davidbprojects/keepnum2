/* eslint-disable @typescript-eslint/no-require-imports */

// ─── Mocks (must be declared before handler import) ──────────────────────────

const mockDdbSend = jest.fn();
const mockSsmSend = jest.fn().mockResolvedValue({
  Parameter: { Value: 'test-telnyx-key' },
});

const helpers = require('@keepnum/shared/src/__tests__/helpers/mockDb');
const mockPool = helpers.createMockPool();

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({ send: mockSsmSend })),
  GetParameterCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDdbSend })) },
  PutCommand: jest.fn((input: unknown) => ({ _type: 'Put', input })),
  QueryCommand: jest.fn((input: unknown) => ({ _type: 'Query', input })),
}));

const mockCheckSpam = jest.fn();
const mockResolveFlag = jest.fn();
const mockMakeCallLogPk = jest.fn().mockReturnValue('user#number');
const mockMakeCallLogSk = jest.fn().mockReturnValue('ts#callId');
const mockMakeTtl = jest.fn().mockReturnValue(9999999);

jest.mock('@keepnum/shared', () => ({
  checkSpam: mockCheckSpam,
  resolveFlag: mockResolveFlag,
  makeCallLogPk: mockMakeCallLogPk,
  makeCallLogSk: mockMakeCallLogSk,
  makeTtl: mockMakeTtl,
}));

const mockScreenCall = jest.fn();

jest.mock('@keepnum/call-screening-service', () => ({
  screenCall: mockScreenCall,
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';
import { mockFetchResponse, mockFetchSequence } from '@keepnum/shared/src/__tests__/helpers/mockFetch';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function callWebhookBody(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      event_type: 'call.initiated',
      payload: {
        call_control_id: 'ctrl-123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound',
        call_leg_id: 'leg-abc',
        ...overrides,
      },
    },
  };
}

function buildCallEvent(bodyOverrides: Record<string, unknown> = {}) {
  return buildMockEvent({
    method: 'POST',
    path: '/webhooks/telnyx/call',
    body: callWebhookBody(bodyOverrides),
  });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockDdbSend.mockReset();
  mockCheckSpam.mockReset();
  mockResolveFlag.mockReset();
  mockScreenCall.mockReset();

  // Default: no duplicate call log
  mockDdbSend.mockResolvedValue({ Items: [] });

  // Default: parked number found
  (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
    if (sql.includes('parked_numbers')) {
      return Promise.resolve({
        rows: [{ id: 'pn-1', user_id: 'user-1' }],
        rowCount: 1,
      });
    }
    if (sql.includes('block_list')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (sql.includes('caller_rules')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (sql.includes('forwarding_rules')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });

  // Default: flags disabled
  mockResolveFlag.mockResolvedValue(false);

  // Default: fetch succeeds (for Telnyx call actions)
  global.fetch = jest.fn().mockResolvedValue(
    mockFetchResponse(200, { data: {} }),
  ) as jest.Mock;
});

// ─── Non-call.initiated events ───────────────────────────────────────────────

describe('Non-call.initiated events', () => {
  it('returns 200 "Event acknowledged" for non-call.initiated event types', async () => {
    // Validates: Requirements 3.9
    const event = buildMockEvent({
      method: 'POST',
      path: '/webhooks/telnyx/call',
      body: {
        data: {
          event_type: 'call.hangup',
          payload: { call_control_id: 'ctrl-123', from: '+15551234567', to: '+15559876543' },
        },
      },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Event acknowledged' });
    // No DB queries or Telnyx actions should have been made
    expect(mockDdbSend).not.toHaveBeenCalled();
  });
});

// ─── Duplicate call_leg_id ───────────────────────────────────────────────────

describe('Duplicate call_leg_id', () => {
  it('returns "Already processed" for duplicate call_leg_id', async () => {
    // Validates: Requirements 3.8
    mockDdbSend.mockResolvedValueOnce({ Items: [{ callId: 'leg-abc' }] });

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Already processed' });
    // Should not have queried Aurora or invoked Telnyx
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

// ─── Blocked caller ──────────────────────────────────────────────────────────

describe('Blocked caller', () => {
  it('returns disposition "blocked" and invokes hangup for blocked caller', async () => {
    // Validates: Requirements 3.2
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('parked_numbers')) {
        return Promise.resolve({
          rows: [{ id: 'pn-1', user_id: 'user-1' }],
          rowCount: 1,
        });
      }
      if (sql.includes('block_list')) {
        return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('blocked');
    expect(body.action).toBe('disconnect');

    // Telnyx speak + hangup should have been called
    expect(global.fetch).toHaveBeenCalled();
    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const actions = fetchCalls.map((c: string[]) => c[0]);
    expect(actions.some((url: string) => url.includes('/actions/speak'))).toBe(true);
    expect(actions.some((url: string) => url.includes('/actions/hangup'))).toBe(true);

    // DynamoDB PutCommand should have been called to write call log
    expect(mockDdbSend).toHaveBeenCalledTimes(2); // 1 query + 1 put
  });
});

// ─── Spam caller ─────────────────────────────────────────────────────────────

describe('Spam caller', () => {
  it('returns disposition "blocked" with spam score when spam filtering is enabled and caller is spam', async () => {
    // Validates: Requirements 3.3
    mockResolveFlag.mockImplementation((_userId: string, flagName: string) => {
      if (flagName === 'spam_filtering') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    mockCheckSpam.mockResolvedValue({ isSpam: true, score: 85 });

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('blocked');
    expect(body.action).toBe('disconnect');

    // checkSpam should have been called
    expect(mockCheckSpam).toHaveBeenCalledWith('+15551234567', 'test-telnyx-key');

    // Telnyx speak + hangup should have been called
    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const actions = fetchCalls.map((c: string[]) => c[0]);
    expect(actions.some((url: string) => url.includes('/actions/speak'))).toBe(true);
    expect(actions.some((url: string) => url.includes('/actions/hangup'))).toBe(true);
  });
});

// ─── Per-caller rule actions ─────────────────────────────────────────────────

describe('Per-caller rule actions', () => {
  function setupCallerRule(action: string, actionData: Record<string, unknown> | null = null) {
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('parked_numbers')) {
        return Promise.resolve({
          rows: [{ id: 'pn-1', user_id: 'user-1' }],
          rowCount: 1,
        });
      }
      if (sql.includes('block_list')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (sql.includes('caller_rules')) {
        return Promise.resolve({
          rows: [{ action, action_data: actionData }],
          rowCount: 1,
        });
      }
      if (sql.includes('forwarding_rules')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  }

  it('routes to voicemail when caller rule action is "voicemail"', async () => {
    // Validates: Requirements 3.4
    setupCallerRule('voicemail');

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('voicemail');
    expect(body.action).toBe('voicemail');
  });

  it('disconnects when caller rule action is "disconnect"', async () => {
    // Validates: Requirements 3.4
    setupCallerRule('disconnect');

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('blocked');
    expect(body.action).toBe('disconnect');
  });

  it('forwards when caller rule action is "forward" with destination', async () => {
    // Validates: Requirements 3.4
    setupCallerRule('forward', { forwardTo: '+15550001111' });

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('forwarded');
    expect(body.action).toBe('forward');

    // Telnyx transfer should have been called
    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const actions = fetchCalls.map((c: string[]) => c[0]);
    expect(actions.some((url: string) => url.includes('/actions/transfer'))).toBe(true);
  });

  it('routes to voicemail when caller rule action is "custom_greeting"', async () => {
    // Validates: Requirements 3.4
    setupCallerRule('custom_greeting');

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('voicemail');
    expect(body.action).toBe('custom_greeting');
  });
});

// ─── Call screening routing ──────────────────────────────────────────────────

describe('Call screening routing', () => {
  beforeEach(() => {
    mockResolveFlag.mockImplementation((_userId: string, flagName: string) => {
      if (flagName === 'call_screening') return Promise.resolve(true);
      return Promise.resolve(false);
    });
  });

  it('routes to voicemail when screening is enabled and caller is rejected', async () => {
    // Validates: Requirements 3.5
    mockScreenCall.mockResolvedValue({ accepted: false, timedOut: false });

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('screened');
    expect(body.action).toBe('voicemail');
    expect(mockScreenCall).toHaveBeenCalledWith('ctrl-123', 'test-telnyx-key');
  });

  it('routes to voicemail when screening times out', async () => {
    // Validates: Requirements 3.5
    mockScreenCall.mockResolvedValue({ accepted: false, timedOut: true });

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('screened');
    expect(body.action).toBe('voicemail');
  });

  it('continues to forwarding when screening is accepted', async () => {
    // Validates: Requirements 3.5
    mockScreenCall.mockResolvedValue({ accepted: true, timedOut: false });

    // Set up a forwarding rule so we can verify the call continues
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('parked_numbers')) {
        return Promise.resolve({
          rows: [{ id: 'pn-1', user_id: 'user-1' }],
          rowCount: 1,
        });
      }
      if (sql.includes('block_list')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (sql.includes('caller_rules')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (sql.includes('forwarding_rules')) {
        return Promise.resolve({
          rows: [{ destination: '+15550009999' }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('forwarded');
    expect(body.action).toBe('forward');
  });
});

// ─── Forwarding rule transfer ────────────────────────────────────────────────

describe('Forwarding rule transfer', () => {
  it('transfers call when forwarding rule is active', async () => {
    // Validates: Requirements 3.6
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('parked_numbers')) {
        return Promise.resolve({
          rows: [{ id: 'pn-1', user_id: 'user-1' }],
          rowCount: 1,
        });
      }
      if (sql.includes('block_list')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (sql.includes('caller_rules')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (sql.includes('forwarding_rules')) {
        return Promise.resolve({
          rows: [{ destination: '+15550009999' }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('forwarded');
    expect(body.action).toBe('forward');

    // Telnyx transfer should have been called with the correct destination
    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const transferCall = fetchCalls.find((c: string[]) =>
      c[0].includes('/actions/transfer'),
    );
    expect(transferCall).toBeDefined();
    const transferBody = JSON.parse(transferCall[1].body);
    expect(transferBody.to).toBe('+15550009999');
  });
});

// ─── No forwarding → voicemail ───────────────────────────────────────────────

describe('No forwarding rule', () => {
  it('returns disposition "voicemail" when no forwarding rule exists', async () => {
    // Validates: Requirements 3.7
    const event = buildCallEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('voicemail');
    expect(body.action).toBe('voicemail');
  });
});


// ─── Missing webhook fields → 400 ───────────────────────────────────────────

describe('Missing webhook fields', () => {
  it('returns 400 when call_control_id is missing', async () => {
    // Validates: Requirements 10.4
    const event = buildMockEvent({
      method: 'POST',
      path: '/webhooks/telnyx/call',
      body: {
        data: {
          event_type: 'call.initiated',
          payload: {
            from: '+15551234567',
            to: '+15559876543',
          },
        },
      },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Invalid webhook payload');
  });

  it('returns 400 when from is missing', async () => {
    // Validates: Requirements 10.4
    const event = buildMockEvent({
      method: 'POST',
      path: '/webhooks/telnyx/call',
      body: {
        data: {
          event_type: 'call.initiated',
          payload: {
            call_control_id: 'ctrl-123',
            to: '+15559876543',
          },
        },
      },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Invalid webhook payload');
  });

  it('returns 400 when to is missing', async () => {
    // Validates: Requirements 10.4
    const event = buildMockEvent({
      method: 'POST',
      path: '/webhooks/telnyx/call',
      body: {
        data: {
          event_type: 'call.initiated',
          payload: {
            call_control_id: 'ctrl-123',
            from: '+15551234567',
          },
        },
      },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Invalid webhook payload');
  });
});

// ─── Telnyx API retry logic ──────────────────────────────────────────────────

describe('Telnyx API retry logic', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries on 429 response and succeeds on subsequent attempt', async () => {
    // Validates: Requirements 10.1, 10.2
    // First fetch call (speak action) gets 429, then succeeds, then hangup succeeds
    mockFetchSequence([
      { status: 429, body: { error: 'Rate limited' } },
      { status: 200, body: { data: {} } },
      { status: 200, body: { data: {} } },
    ]);

    // Set up a blocked caller so the handler invokes speakAndHangup
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('parked_numbers')) {
        return Promise.resolve({
          rows: [{ id: 'pn-1', user_id: 'user-1' }],
          rowCount: 1,
        });
      }
      if (sql.includes('block_list')) {
        return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const event = buildCallEvent();

    // Run handler with fake timers advancing through sleep delays
    const handlerPromise = handler(event);
    // Advance timers to resolve the sleep(1000) backoff for the 429 retry
    await jest.advanceTimersByTimeAsync(10000);

    const result = await handlerPromise;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.disposition).toBe('blocked');

    // fetch should have been called at least 3 times (429 retry + success + hangup)
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-429 4xx response', async () => {
    // Validates: Requirements 10.3
    // speak action returns 403 (non-retryable)
    mockFetchSequence([
      { status: 403, body: { error: 'Forbidden' } },
    ]);

    // Set up a blocked caller so the handler invokes speakAndHangup
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('parked_numbers')) {
        return Promise.resolve({
          rows: [{ id: 'pn-1', user_id: 'user-1' }],
          rowCount: 1,
        });
      }
      if (sql.includes('block_list')) {
        return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const event = buildCallEvent();
    const result = await handler(event);

    // Handler should catch the error and return 500
    expect(result.statusCode).toBe(500);

    // fetch should have been called exactly once — no retry
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries up to 3 times with exponential backoff capped at 8s', async () => {
    // Validates: Requirements 10.1
    // All 4 attempts fail with 429 (1 initial + 3 retries)
    mockFetchSequence([
      { status: 429, body: { error: 'Rate limited' } },
      { status: 429, body: { error: 'Rate limited' } },
      { status: 429, body: { error: 'Rate limited' } },
      { status: 429, body: { error: 'Rate limited' } },
    ]);

    // Set up a blocked caller so the handler invokes speakAndHangup
    (mockPool.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('parked_numbers')) {
        return Promise.resolve({
          rows: [{ id: 'pn-1', user_id: 'user-1' }],
          rowCount: 1,
        });
      }
      if (sql.includes('block_list')) {
        return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const event = buildCallEvent();

    const handlerPromise = handler(event);
    // Advance timers through all backoff delays: 1s + 2s + 4s (capped at 8s)
    await jest.advanceTimersByTimeAsync(15000);

    const result = await handlerPromise;

    // Handler should return 500 after exhausting retries
    expect(result.statusCode).toBe(500);

    // fetch should have been called 4 times (1 initial + 3 retries)
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});
