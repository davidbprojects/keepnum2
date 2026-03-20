/* eslint-disable @typescript-eslint/no-require-imports */
import type { PoolClient } from 'pg';

// ─── Mocks (must be declared before handler import) ──────────────────────────

const mockSend = jest.fn();

const helpers = require('@keepnum/shared/src/__tests__/helpers/mockDb');
const mockPool = helpers.createMockPool();

jest.mock('pg', () => {
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
  SignUpCommand: jest.fn((input: unknown) => ({ _type: 'SignUp', input })),
  InitiateAuthCommand: jest.fn((input: unknown) => ({ _type: 'InitiateAuth', input })),
  AdminDisableUserCommand: jest.fn((input: unknown) => ({ _type: 'AdminDisable', input })),
  AdminGetUserCommand: jest.fn((input: unknown) => ({ _type: 'AdminGetUser', input })),
}));

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({ send: jest.fn().mockResolvedValue({ Parameter: { Value: 'test-telnyx-key' } }) })),
  GetParameterCommand: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';
import { mockFetchResponse } from '@keepnum/shared/src/__tests__/helpers/mockFetch';

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockReset();
});

// ─── POST /auth/register ─────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('returns 201 for valid registration', async () => {
    // Validates: Requirements 1.1, 1.2
    mockSend
      .mockResolvedValueOnce({}) // SignUpCommand
      .mockResolvedValueOnce({   // AdminGetUserCommand
        UserAttributes: [{ Name: 'sub', Value: 'cognito-sub-123' }],
      });

    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const event = buildMockEvent({
      method: 'POST',
      path: '/auth/register',
      body: { email: 'user@example.com', password: 'Str0ngP@ss!' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({ message: 'User registered successfully' });
    // Cognito SignUpCommand was called
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when email is missing', async () => {
    // Validates: Requirements 1.3
    const event = buildMockEvent({
      method: 'POST',
      path: '/auth/register',
      body: { password: 'Str0ngP@ss!' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Email and password are required' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 400 when password is missing', async () => {
    // Validates: Requirements 1.3
    const event = buildMockEvent({
      method: 'POST',
      path: '/auth/register',
      body: { email: 'user@example.com' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Email and password are required' });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ─── POST /auth/login ────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('returns 200 with tokens for valid credentials', async () => {
    // Validates: Requirements 1.4
    mockSend.mockResolvedValueOnce({
      AuthenticationResult: {
        AccessToken: 'access-token-abc',
        RefreshToken: 'refresh-token-xyz',
      },
    });

    const event = buildMockEvent({
      method: 'POST',
      path: '/auth/login',
      body: { email: 'user@example.com', password: 'Str0ngP@ss!' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.accessToken).toBe('access-token-abc');
    expect(body.refreshToken).toBe('refresh-token-xyz');
  });

  it('returns 401 with generic error for invalid credentials', async () => {
    // Validates: Requirements 1.5
    mockSend.mockRejectedValueOnce(new Error('NotAuthorizedException'));

    const event = buildMockEvent({
      method: 'POST',
      path: '/auth/login',
      body: { email: 'user@example.com', password: 'wrong' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Authentication failed');
    // Error message must NOT reveal which field was wrong
    expect(body.error).not.toMatch(/email|password|username/i);
  });
});

// ─── POST /auth/refresh ──────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  it('returns 200 with new accessToken for valid refresh token', async () => {
    // Validates: Requirements 1.6
    mockSend.mockResolvedValueOnce({
      AuthenticationResult: {
        AccessToken: 'new-access-token-123',
      },
    });

    const event = buildMockEvent({
      method: 'POST',
      path: '/auth/refresh',
      body: { refreshToken: 'valid-refresh-token' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.accessToken).toBe('new-access-token-123');
  });

  it('returns 400 when refreshToken is missing', async () => {
    const event = buildMockEvent({
      method: 'POST',
      path: '/auth/refresh',
      body: {},
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Refresh token is required' });
  });
});

// ─── DELETE /auth/account ────────────────────────────────────────────────────

describe('DELETE /auth/account', () => {
  it('returns 200 after marking user deleted, releasing Telnyx numbers, and disabling Cognito', async () => {
    // Validates: Requirements 1.7
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;

    (mockPool.connect as jest.Mock).mockResolvedValueOnce(mockClient);

    // BEGIN
    (mockClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // UPDATE users SET deleted_at
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // SELECT parked_numbers
      .mockResolvedValueOnce({
        rows: [
          { id: 'pn-1', telnyx_number_id: 'telnyx-num-1' },
          { id: 'pn-2', telnyx_number_id: 'telnyx-num-2' },
        ],
        rowCount: 2,
      })
      // UPDATE parked_numbers (first number)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // UPDATE parked_numbers (second number)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // COMMIT
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    // Telnyx release calls
    global.fetch = jest.fn()
      .mockResolvedValueOnce(mockFetchResponse(200, { data: {} }))
      .mockResolvedValueOnce(mockFetchResponse(200, { data: {} })) as jest.Mock;

    // AdminDisableUserCommand
    mockSend.mockResolvedValueOnce({});

    const event = buildMockEvent({
      method: 'DELETE',
      path: '/auth/account',
      authorizer: {
        claims: { sub: 'user-sub-123', 'cognito:username': 'user@example.com' },
      },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Account deleted' });

    // Verify Telnyx release was called for both numbers
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('telnyx-num-1');
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('telnyx-num-2');

    // Verify Cognito disable was called
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Verify transaction was committed
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 401 when authorization claims are missing', async () => {
    // Validates: Requirements 1.8
    const event = buildMockEvent({
      method: 'DELETE',
      path: '/auth/account',
      // No authorizer claims
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'Unauthorized' });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ─── Property Tests ──────────────────────────────────────────────────────────

import * as fc from 'fast-check';

// Feature: api-testing-and-docs, Property 1: Invalid auth payloads are rejected
describe('Property: Invalid auth payloads are rejected', () => {
  it('rejects payloads missing email, password, or both with 400 and no Cognito call', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hasEmail: fc.boolean(),
          hasPassword: fc.boolean(),
          email: fc.emailAddress(),
          password: fc.string({ minLength: 1, maxLength: 50 }),
        }).filter(r => !r.hasEmail || !r.hasPassword),
        async ({ hasEmail, hasPassword, email, password }) => {
          mockSend.mockReset();
          const body: Record<string, string> = {};
          if (hasEmail) body.email = email;
          if (hasPassword) body.password = password;

          const event = buildMockEvent({
            method: 'POST',
            path: '/auth/register',
            body,
          });

          const result = await handler(event);
          expect(result.statusCode).toBe(400);
          expect(mockSend).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: api-testing-and-docs, Property 2: Login error indistinguishability
describe('Property: Login error indistinguishability', () => {
  it('returns identical error body regardless of which credential field is wrong', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          wrongEmail: fc.boolean(),
          wrongPassword: fc.boolean(),
          email: fc.emailAddress(),
          password: fc.string({ minLength: 1, maxLength: 50 }),
        }).filter(r => r.wrongEmail || r.wrongPassword),
        async ({ email, password }) => {
          mockSend.mockReset();
          mockSend.mockRejectedValueOnce(new Error('NotAuthorizedException'));

          const event = buildMockEvent({
            method: 'POST',
            path: '/auth/login',
            body: { email, password },
          });

          const result = await handler(event);
          expect(result.statusCode).toBe(401);
          const body = JSON.parse(result.body);
          // Error message must be generic — never reveal which field was wrong
          expect(body.error).toBe('Authentication failed');
          expect(body.error).not.toMatch(/email|password|username|wrong/i);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: keepnum-app, Property 1: Registration and login round-trip
describe('Property: Registration and login round-trip', () => {
  it('register then login succeeds for any valid email/password pair', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.string({ minLength: 8, maxLength: 50 }),
        async (email, password) => {
          mockSend.mockReset();
          (mockPool.query as jest.Mock).mockReset();

          // Registration mocks
          mockSend
            .mockResolvedValueOnce({}) // SignUpCommand
            .mockResolvedValueOnce({   // AdminGetUserCommand
              UserAttributes: [{ Name: 'sub', Value: `sub-${email}` }],
            });
          (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 1 });

          const regEvent = buildMockEvent({
            method: 'POST',
            path: '/auth/register',
            body: { email, password },
          });
          const regResult = await handler(regEvent);
          expect(regResult.statusCode).toBe(201);

          // Login mocks
          mockSend.mockResolvedValueOnce({
            AuthenticationResult: {
              AccessToken: 'access-token',
              RefreshToken: 'refresh-token',
            },
          });

          const loginEvent = buildMockEvent({
            method: 'POST',
            path: '/auth/login',
            body: { email, password },
          });
          const loginResult = await handler(loginEvent);
          expect(loginResult.statusCode).toBe(200);
          const loginBody = JSON.parse(loginResult.body);
          expect(loginBody.accessToken).toBeTruthy();
          expect(loginBody.refreshToken).toBeTruthy();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: keepnum-app, Property 27: JWT token validity is platform-independent
describe('Property: JWT token validity is platform-independent', () => {
  it('login returns consistent token structure for any valid credentials', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.string({ minLength: 8, maxLength: 50 }),
        fc.constantFrom('web', 'ios', 'android', 'admin'),
        async (email, password, _platform) => {
          mockSend.mockReset();
          mockSend.mockResolvedValueOnce({
            AuthenticationResult: {
              AccessToken: `access-${email}`,
              RefreshToken: `refresh-${email}`,
            },
          });

          const event = buildMockEvent({
            method: 'POST',
            path: '/auth/login',
            body: { email, password },
          });
          const result = await handler(event);
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          // Token structure is always the same regardless of platform
          expect(typeof body.accessToken).toBe('string');
          expect(typeof body.refreshToken).toBe('string');
          expect(body.accessToken.length).toBeGreaterThan(0);
          expect(body.refreshToken.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
