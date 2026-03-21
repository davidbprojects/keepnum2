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
  assertFlag: jest.fn().mockResolvedValue(null),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), auth: jest.fn(), request: jest.fn() },
  initLogger: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler, screenCall } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';
import { mockFetchResponse } from '@keepnum/shared/src/__tests__/helpers/mockFetch';
import { assertFlag } from '@keepnum/shared';

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (assertFlag as jest.Mock).mockResolvedValue(null);

  // Default: all Telnyx call actions succeed
  global.fetch = jest.fn().mockResolvedValue(
    mockFetchResponse(200, { data: { result: '1', recording_urls: { mp3: 'https://recordings.telnyx.com/test.mp3' } } }),
  ) as jest.Mock;
});

// ─── Handler tests ───────────────────────────────────────────────────────────

describe('POST /call-screening (handler)', () => {
  it('returns 400 when callControlId is missing', async () => {
    // Validates: Requirements 9.4
    const event = buildMockEvent({
      method: 'POST',
      path: '/call-screening',
      body: {},
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'callControlId is required' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 200 with screening result for valid request', async () => {
    // Validates: Requirements 9.4
    const event = buildMockEvent({
      method: 'POST',
      path: '/call-screening',
      body: { callControlId: 'ctrl-abc' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('accepted');
    expect(body).toHaveProperty('timedOut');
  });

  it('returns 403 when call_screening feature flag denies access', async () => {
    // Validates: Requirements 9.4
    (assertFlag as jest.Mock).mockResolvedValueOnce({
      statusCode: 403,
      body: JSON.stringify({ error: "Feature 'call_screening' is not available on your current plan." }),
    });

    const event = buildMockEvent({
      method: 'POST',
      path: '/call-screening',
      body: { callControlId: 'ctrl-abc', userId: 'user-1' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
  });

  it('returns 500 when an unexpected error occurs', async () => {
    // Validates: Requirements 9.4
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failure')) as jest.Mock;

    const event = buildMockEvent({
      method: 'POST',
      path: '/call-screening',
      body: { callControlId: 'ctrl-abc' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
  });
});

// ─── screenCall state machine tests ──────────────────────────────────────────

describe('screenCall state machine', () => {
  it('Step 1: prompts caller to state their name via speak action', async () => {
    // Validates: Requirements 9.4
    await screenCall('ctrl-123', 'test-key');

    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const speakCall = fetchCalls.find((c: string[]) => c[0].includes('/actions/speak'));
    expect(speakCall).toBeDefined();

    const speakBody = JSON.parse(speakCall[1].body);
    expect(speakBody.payload).toContain('state your name');
    expect(speakBody.voice).toBe('female');
    expect(speakBody.language).toBe('en-US');
  });

  it('Step 2: starts recording after prompt', async () => {
    // Validates: Requirements 9.4
    await screenCall('ctrl-123', 'test-key');

    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const recordCall = fetchCalls.find((c: string[]) => c[0].includes('/actions/record_start'));
    expect(recordCall).toBeDefined();

    const recordBody = JSON.parse(recordCall[1].body);
    expect(recordBody.format).toBe('mp3');
    expect(recordBody.channels).toBe('single');
  });

  it('Step 4: plays recorded name back to user', async () => {
    // Validates: Requirements 9.4
    await screenCall('ctrl-123', 'test-key');

    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const playCall = fetchCalls.find((c: string[]) => c[0].includes('/actions/play_audio'));
    expect(playCall).toBeDefined();

    const playBody = JSON.parse(playCall[1].body);
    expect(playBody.audio_url).toBe('https://recordings.telnyx.com/test.mp3');
  });

  it('Step 5: gathers DTMF input from user', async () => {
    // Validates: Requirements 9.4
    await screenCall('ctrl-123', 'test-key');

    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const gatherCall = fetchCalls.find((c: string[]) => c[0].includes('/actions/gather'));
    expect(gatherCall).toBeDefined();

    const gatherBody = JSON.parse(gatherCall[1].body);
    expect(gatherBody.minimum_digits).toBe(1);
    expect(gatherBody.maximum_digits).toBe(1);
    expect(gatherBody.valid_digits).toBe('12');
  });

  it('returns accepted: true when user presses 1', async () => {
    // Validates: Requirements 9.4
    // All fetch calls return digit '1' for gather
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse(200, { data: { result: '1', recording_urls: { mp3: 'https://recordings.telnyx.com/test.mp3' } } }),
    ) as jest.Mock;

    const result = await screenCall('ctrl-123', 'test-key');

    expect(result.accepted).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.callerNameRecordingUrl).toBe('https://recordings.telnyx.com/test.mp3');
  });

  it('returns accepted: false when user presses 2 (reject)', async () => {
    // Validates: Requirements 9.4
    const callIndex = { current: 0 };
    global.fetch = jest.fn().mockImplementation((url: string) => {
      callIndex.current++;
      // Return digit '2' for the gather action (last call)
      if (url.includes('/actions/gather')) {
        return Promise.resolve(
          mockFetchResponse(200, { data: { result: '2' } }),
        );
      }
      return Promise.resolve(
        mockFetchResponse(200, { data: { result: '1', recording_urls: { mp3: 'https://recordings.telnyx.com/test.mp3' } } }),
      );
    }) as jest.Mock;

    const result = await screenCall('ctrl-123', 'test-key');

    expect(result.accepted).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.callerNameRecordingUrl).toBe('https://recordings.telnyx.com/test.mp3');
  });

  it('Step 3: returns timedOut: true when recording times out', async () => {
    // Validates: Requirements 9.4
    // Make record_start hang (never resolve) to trigger the timeout
    jest.useFakeTimers();

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/actions/record_start')) {
        // Return a promise that never resolves (simulates timeout)
        return new Promise(() => {});
      }
      if (url.includes('/actions/record_stop')) {
        return Promise.resolve(mockFetchResponse(200, { data: {} }));
      }
      return Promise.resolve(
        mockFetchResponse(200, { data: {} }),
      );
    }) as jest.Mock;

    const resultPromise = screenCall('ctrl-123', 'test-key');

    // Flush microtasks then advance timers past the 10s timeout
    await jest.advanceTimersByTimeAsync(11_000);

    const result = await resultPromise;

    expect(result.accepted).toBe(false);
    expect(result.timedOut).toBe(true);

    jest.useRealTimers();
  });

  it('returns accepted: false with no recording URL when recording has no mp3', async () => {
    // Validates: Requirements 9.4
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/actions/gather')) {
        return Promise.resolve(mockFetchResponse(200, { data: { result: '2' } }));
      }
      // record_start and record_stop return no recording_urls
      return Promise.resolve(mockFetchResponse(200, { data: {} }));
    }) as jest.Mock;

    const result = await screenCall('ctrl-123', 'test-key');

    expect(result.accepted).toBe(false);
    expect(result.timedOut).toBe(false);
    // No play_audio should be called when there's no recording URL
    const fetchCalls = (global.fetch as jest.Mock).mock.calls;
    const playCall = fetchCalls.find((c: string[]) => c[0].includes('/actions/play_audio'));
    expect(playCall).toBeUndefined();
  });
});
