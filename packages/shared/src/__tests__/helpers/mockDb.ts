import type { Pool, PoolClient, QueryResult } from 'pg';

export function mockQueryResult(rows: unknown[], rowCount?: number): QueryResult {
  return {
    rows,
    rowCount: rowCount ?? rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

export function createMockClient(): jest.Mocked<PoolClient> {
  const client = {
    query: jest.fn().mockResolvedValue(mockQueryResult([])),
    release: jest.fn(),
  } as unknown as jest.Mocked<PoolClient>;

  // Wire up transaction helpers: BEGIN, COMMIT, ROLLBACK
  // These are just query calls with specific SQL strings
  return client;
}

export function createMockPool(): jest.Mocked<Pool> {
  const mockClient = createMockClient();

  const pool = {
    query: jest.fn().mockResolvedValue(mockQueryResult([])),
    connect: jest.fn().mockResolvedValue(mockClient),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  } as unknown as jest.Mocked<Pool>;

  return pool;
}
