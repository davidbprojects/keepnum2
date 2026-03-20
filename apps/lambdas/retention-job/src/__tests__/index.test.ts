/* eslint-disable @typescript-eslint/no-require-imports */

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

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { mockFetchResponse } from '@keepnum/shared/src/__tests__/helpers/mockFetch';

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn() as jest.Mock;
});

const SCHEDULED_EVENT = {} as Parameters<typeof handler>[0];

// ─── Helper ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ─── Tests: Items past retention window are deleted ──────────────────────────

describe('retention-job handler', () => {
  it('deletes voicemails and SMS past the retention window and removes storage objects', async () => {
    // Validates: Requirements 9.5
    // Parked number with 30d policy
    (mockPool.query as jest.Mock)
      // 1. SELECT parked_numbers
      .mockResolvedValueOnce({
        rows: [{ id: 'pn-1', retention_policy: '30d' }],
        rowCount: 1,
      })
      // 2. SELECT expired voicemails
      .mockResolvedValueOnce({
        rows: [
          { id: 'vm-1', storage_key: 'voicemails/pn-1/vm-1.wav' },
        ],
        rowCount: 1,
      })
      // 3. UPDATE voicemail deleted_at
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // 4. SELECT expired SMS
      .mockResolvedValueOnce({
        rows: [
          { id: 'sms-1', media_keys: ['sms-media/pn-1/sms-1/img.jpg'] },
        ],
        rowCount: 1,
      })
      // 5. UPDATE sms deleted_at
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // 6. Trash auto-deletion
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // 7. Recording cleanup for pn-1
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // 8. Share link cleanup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // 9. Caller ID cache cleanup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    // Mock fetch for storage DELETE calls (voicemail + sms media)
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFetchResponse(200, {}))  // delete voicemail object
      .mockResolvedValueOnce(mockFetchResponse(200, {})); // delete sms media object

    await handler(SCHEDULED_EVENT);

    // Verify storage DELETE calls were made
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('voicemails%2Fpn-1%2Fvm-1.wav');
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('sms-media%2Fpn-1%2Fsms-1%2Fimg.jpg');

    // Verify DB updates: voicemail and SMS marked as deleted
    const queryCalls = (mockPool.query as jest.Mock).mock.calls;
    expect(queryCalls[2][0]).toContain('UPDATE voicemails SET deleted_at');
    expect(queryCalls[2][1]).toEqual(['vm-1']);
    expect(queryCalls[4][0]).toContain('UPDATE sms_messages SET deleted_at');
    expect(queryCalls[4][1]).toEqual(['sms-1']);
  });

  it('does not delete items for "forever" retention policy', async () => {
    // Validates: Requirements 9.5
    (mockPool.query as jest.Mock)
      // 1. SELECT parked_numbers — only "forever" policy
      .mockResolvedValueOnce({
        rows: [{ id: 'pn-forever', retention_policy: 'forever' }],
        rowCount: 1,
      })
      // 2. Trash auto-deletion
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // 3. Share link cleanup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // 4. Caller ID cache cleanup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await handler(SCHEDULED_EVENT);

    // 1 parked_numbers query + 3 cleanup queries (no recording cleanup for forever)
    expect((mockPool.query as jest.Mock).mock.calls).toHaveLength(4);
    // No storage deletions
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('processes multiple parked numbers with mixed policies', async () => {
    // Validates: Requirements 9.5
    (mockPool.query as jest.Mock)
      // 1. SELECT parked_numbers — one 60d, one forever
      .mockResolvedValueOnce({
        rows: [
          { id: 'pn-60', retention_policy: '60d' },
          { id: 'pn-forever', retention_policy: 'forever' },
        ],
        rowCount: 2,
      })
      // 2. SELECT expired voicemails for pn-60 (none expired)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // 3. SELECT expired SMS for pn-60 (none expired)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // 4. Trash auto-deletion
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // 5. Recording cleanup for pn-60
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // 6. Share link cleanup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // 7. Caller ID cache cleanup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await handler(SCHEDULED_EVENT);

    // 1 parked_numbers + 2 (vm+sms for pn-60) + 4 cleanup queries
    expect((mockPool.query as jest.Mock).mock.calls).toHaveLength(7);
    // No storage deletions since nothing expired
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
