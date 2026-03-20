/* eslint-disable @typescript-eslint/no-require-imports */

// ─── Mocks (must be declared before handler import) ──────────────────────────

const mockCognitoSend = jest.fn();

const helpers = require('@keepnum/shared/src/__tests__/helpers/mockDb');
const mockPool = helpers.createMockPool();

jest.mock('pg', () => {
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({ send: mockCognitoSend })),
  AdminDisableUserCommand: jest.fn((input: unknown) => ({ _type: 'AdminDisable', input })),
  AdminEnableUserCommand: jest.fn((input: unknown) => ({ _type: 'AdminEnable', input })),
}));

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({ send: jest.fn().mockResolvedValue({ Parameter: { Value: 'test-value' } }) })),
  GetParameterCommand: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { handler } from '../index';
import { buildMockEvent } from '@keepnum/shared/src/__tests__/helpers/mockEvent';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function adminEvent(overrides: Parameters<typeof buildMockEvent>[0] = {}) {
  return buildMockEvent({
    ...overrides,
    authorizer: {
      claims: {
        sub: 'admin-sub-123',
        'cognito:groups': 'admin',
        ...(overrides.authorizer?.claims ?? {}),
      },
    },
  });
}

function nonAdminEvent(overrides: Parameters<typeof buildMockEvent>[0] = {}) {
  return buildMockEvent({
    ...overrides,
    authorizer: {
      claims: {
        sub: 'user-sub-456',
        'cognito:groups': 'users',
      },
    },
  });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCognitoSend.mockReset();
});


// ─── Non-admin user → 403 ────────────────────────────────────────────────────

describe('Admin route authorization', () => {
  it('returns 403 for non-admin user on GET /admin/users', async () => {
    // Validates: Requirements 8.2
    const event = nonAdminEvent({
      method: 'GET',
      path: '/admin/users',
      resource: '/admin/users',
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toEqual({ error: 'Forbidden: admin group required' });
  });

  it('returns 403 for non-admin user on POST /admin/packages', async () => {
    // Validates: Requirements 8.2
    const event = nonAdminEvent({
      method: 'POST',
      path: '/admin/packages',
      resource: '/admin/packages',
      body: { name: 'Test', priceMonthly: 999 },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('returns 403 for non-admin user on DELETE /admin/packages/:id', async () => {
    // Validates: Requirements 8.2
    const event = nonAdminEvent({
      method: 'DELETE',
      path: '/admin/packages/pkg-1',
      resource: '/admin/packages/pkg-1',
      pathParameters: { id: 'pkg-1' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });
});


// ─── GET /packages/public ────────────────────────────────────────────────────

describe('GET /packages/public', () => {
  it('returns only publicly visible packages ordered by sort_order', async () => {
    // Validates: Requirements 8.5
    const publicPkgs = [
      { id: 'pkg-1', name: 'Basic', sort_order: 1, publicly_visible: true },
      { id: 'pkg-2', name: 'Pro', sort_order: 2, publicly_visible: true },
    ];
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: publicPkgs, rowCount: 2 });

    const event = buildMockEvent({
      method: 'GET',
      path: '/packages/public',
      resource: '/packages/public',
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].name).toBe('Basic');
    expect(body.items[1].name).toBe('Pro');
  });

  it('does not require admin authentication', async () => {
    // Validates: Requirements 8.5
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    // No authorizer at all
    const event = buildMockEvent({
      method: 'GET',
      path: '/packages/public',
      resource: '/packages/public',
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ items: [] });
  });

  it('queries with publicly_visible=true and deleted_at IS NULL filter', async () => {
    // Validates: Requirements 8.5
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = buildMockEvent({
      method: 'GET',
      path: '/packages/public',
      resource: '/packages/public',
    });
    await handler(event);

    const queryCall = (mockPool.query as jest.Mock).mock.calls[0][0];
    expect(queryCall).toContain('publicly_visible = true');
    expect(queryCall).toContain('deleted_at IS NULL');
    expect(queryCall).toContain('ORDER BY sort_order ASC');
  });
});


// ─── GET /admin/users ────────────────────────────────────────────────────────

describe('GET /admin/users', () => {
  it('returns paginated user list', async () => {
    // Validates: Requirements 8.1
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          { id: 'u-1', email: 'a@test.com', package_name: 'Basic' },
          { id: 'u-2', email: 'b@test.com', package_name: 'Pro' },
        ],
        rowCount: 2,
      });

    const event = adminEvent({
      method: 'GET',
      path: '/admin/users',
      resource: '/admin/users',
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
  });

  it('supports search query parameter', async () => {
    // Validates: Requirements 8.1
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'u-1', email: 'a@test.com' }], rowCount: 1 });

    const event = adminEvent({
      method: 'GET',
      path: '/admin/users',
      resource: '/admin/users',
      queryStringParameters: { search: 'a@test' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(1);
  });
});


// ─── GET /admin/users/:id ────────────────────────────────────────────────────

describe('GET /admin/users/:id', () => {
  it('returns user detail with metrics, subscription, and feature overrides', async () => {
    // Validates: Requirements 8.1
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'u-1', email: 'a@test.com', cognito_id: 'cog-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ parked_numbers: '3', voicemail_count: '10', sms_count: '5', enabled_addons: '2' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'active', package_name: 'Pro' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ flag_name: 'beta', value: true }], rowCount: 1 });

    const event = adminEvent({
      method: 'GET',
      path: '/admin/users/u-1',
      resource: '/admin/users/u-1',
      pathParameters: { id: 'u-1' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.user.id).toBe('u-1');
    expect(body.metrics.parked_numbers).toBe('3');
    expect(body.subscription.status).toBe('active');
    expect(body.featureOverrides).toHaveLength(1);
  });

  it('returns 404 for non-existent user', async () => {
    // Validates: Requirements 8.1
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = adminEvent({
      method: 'GET',
      path: '/admin/users/u-999',
      resource: '/admin/users/u-999',
      pathParameters: { id: 'u-999' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'User not found' });
  });
});


// ─── PUT /admin/users/:id/status ─────────────────────────────────────────────

describe('PUT /admin/users/:id/status', () => {
  it('enables a user and creates audit log', async () => {
    // Validates: Requirements 8.1, 8.4
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ cognito_id: 'cog-1' }], rowCount: 1 }) // SELECT user
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT audit log

    mockCognitoSend.mockResolvedValueOnce({});

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-1/status',
      resource: '/admin/users/u-1/status',
      pathParameters: { id: 'u-1' },
      body: { enabled: true },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, enabled: true });
    expect(mockCognitoSend).toHaveBeenCalledTimes(1);

    // Verify audit log was written
    const auditCall = (mockPool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('admin_audit_log'),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toContain('admin-sub-123');
    expect(auditCall![1]).toContain('enable_user');
  });

  it('disables a user and creates audit log', async () => {
    // Validates: Requirements 8.1, 8.4
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ cognito_id: 'cog-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    mockCognitoSend.mockResolvedValueOnce({});

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-1/status',
      resource: '/admin/users/u-1/status',
      pathParameters: { id: 'u-1' },
      body: { enabled: false },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, enabled: false });

    const auditCall = (mockPool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('admin_audit_log'),
    );
    expect(auditCall![1]).toContain('disable_user');
  });

  it('returns 400 when enabled field is missing', async () => {
    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-1/status',
      resource: '/admin/users/u-1/status',
      pathParameters: { id: 'u-1' },
      body: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'enabled (boolean) is required' });
  });

  it('returns 404 for non-existent user', async () => {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-999/status',
      resource: '/admin/users/u-999/status',
      pathParameters: { id: 'u-999' },
      body: { enabled: true },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });
});


// ─── PUT /admin/users/:id/package ────────────────────────────────────────────

describe('PUT /admin/users/:id/package', () => {
  it('changes user package immediately and creates audit log', async () => {
    // Validates: Requirements 8.1, 8.4
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'u-1' }], rowCount: 1 })           // user exists
      .mockResolvedValueOnce({ rows: [{ id: 'pkg-2', name: 'Pro' }], rowCount: 1 }) // package exists
      .mockResolvedValueOnce({ rows: [{ package_id: 'pkg-1' }], rowCount: 1 })  // current subscription
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                          // UPDATE subscription
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                         // audit log

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-1/package',
      resource: '/admin/users/u-1/package',
      pathParameters: { id: 'u-1' },
      body: { packageId: 'pkg-2', effectiveImmediately: true },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, packageId: 'pkg-2' });

    const auditCall = (mockPool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('admin_audit_log'),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toContain('change_package');
  });

  it('returns 400 when packageId is missing', async () => {
    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-1/package',
      resource: '/admin/users/u-1/package',
      pathParameters: { id: 'u-1' },
      body: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'packageId is required' });
  });

  it('returns 404 when user does not exist', async () => {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-999/package',
      resource: '/admin/users/u-999/package',
      pathParameters: { id: 'u-999' },
      body: { packageId: 'pkg-1' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'User not found' });
  });

  it('returns 404 when package does not exist', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'u-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-1/package',
      resource: '/admin/users/u-1/package',
      pathParameters: { id: 'u-1' },
      body: { packageId: 'pkg-999' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Package not found' });
  });
});


// ─── PUT /admin/users/:id/feature-flags ──────────────────────────────────────

describe('PUT /admin/users/:id/feature-flags', () => {
  it('sets feature flag overrides and creates audit log', async () => {
    // Validates: Requirements 8.1, 8.4
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'u-1' }], rowCount: 1 })           // user exists
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                          // current overrides
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                          // upsert flag
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                         // audit log

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-1/feature-flags',
      resource: '/admin/users/u-1/feature-flags',
      pathParameters: { id: 'u-1' },
      body: { beta_feature: true },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true });

    const auditCall = (mockPool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('admin_audit_log'),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toContain('set_flag_override');
  });

  it('returns 400 when no flags provided', async () => {
    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-1/feature-flags',
      resource: '/admin/users/u-1/feature-flags',
      pathParameters: { id: 'u-1' },
      body: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'At least one flag must be provided' });
  });

  it('returns 404 for non-existent user', async () => {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/users/u-999/feature-flags',
      resource: '/admin/users/u-999/feature-flags',
      pathParameters: { id: 'u-999' },
      body: { beta: true },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });
});


// ─── GET /admin/users/:id/billing ────────────────────────────────────────────

describe('GET /admin/users/:id/billing', () => {
  it('returns subscription and invoices for user', async () => {
    // Validates: Requirements 8.1
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'active', package_name: 'Pro' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1', amount: 999 }, { id: 'inv-2', amount: 999 }], rowCount: 2 });

    const event = adminEvent({
      method: 'GET',
      path: '/admin/users/u-1/billing',
      resource: '/admin/users/u-1/billing',
      pathParameters: { id: 'u-1' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.subscription.status).toBe('active');
    expect(body.invoices).toHaveLength(2);
  });

  it('returns null subscription when user has none', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = adminEvent({
      method: 'GET',
      path: '/admin/users/u-1/billing',
      resource: '/admin/users/u-1/billing',
      pathParameters: { id: 'u-1' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.subscription).toBeNull();
    expect(body.invoices).toHaveLength(0);
  });
});


// ─── GET /admin/packages ─────────────────────────────────────────────────────

describe('GET /admin/packages', () => {
  it('returns all non-deleted packages ordered by sort_order', async () => {
    // Validates: Requirements 8.1
    const pkgs = [
      { id: 'pkg-1', name: 'Basic', sort_order: 1 },
      { id: 'pkg-2', name: 'Pro', sort_order: 2 },
    ];
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: pkgs, rowCount: 2 });

    const event = adminEvent({
      method: 'GET',
      path: '/admin/packages',
      resource: '/admin/packages',
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].name).toBe('Basic');
  });
});

// ─── POST /admin/packages ────────────────────────────────────────────────────

describe('POST /admin/packages', () => {
  it('creates a package and writes audit log', async () => {
    // Validates: Requirements 8.1, 8.4
    const newPkg = { id: 'pkg-new', name: 'Enterprise', price_monthly_cents: 4999 };
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [newPkg], rowCount: 1 })  // INSERT package
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });        // audit log

    const event = adminEvent({
      method: 'POST',
      path: '/admin/packages',
      resource: '/admin/packages',
      body: { name: 'Enterprise', priceMonthly: 4999 },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body).name).toBe('Enterprise');

    const auditCall = (mockPool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('admin_audit_log'),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toContain('create_package');
  });

  it('creates a package with flags', async () => {
    // Validates: Requirements 8.1
    const newPkg = { id: 'pkg-new', name: 'Pro' };
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [newPkg], rowCount: 1 })  // INSERT package
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })         // INSERT flag
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });        // audit log

    const event = adminEvent({
      method: 'POST',
      path: '/admin/packages',
      resource: '/admin/packages',
      body: { name: 'Pro', priceMonthly: 1999, flags: { max_numbers: 10 } },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(201);
  });

  it('returns 400 when name is missing', async () => {
    const event = adminEvent({
      method: 'POST',
      path: '/admin/packages',
      resource: '/admin/packages',
      body: { priceMonthly: 999 },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'name is required' });
  });

  it('returns 400 when priceMonthly is missing', async () => {
    const event = adminEvent({
      method: 'POST',
      path: '/admin/packages',
      resource: '/admin/packages',
      body: { name: 'Test' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'priceMonthly is required' });
  });
});


// ─── PUT /admin/packages/:id ─────────────────────────────────────────────────

describe('PUT /admin/packages/:id', () => {
  it('updates a package and writes audit log', async () => {
    // Validates: Requirements 8.1, 8.4
    const existing = { id: 'pkg-1', name: 'Basic', price_monthly_cents: 999 };
    const updated = { id: 'pkg-1', name: 'Basic Plus', price_monthly_cents: 1499 };

    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [existing], rowCount: 1 })  // SELECT current
      .mockResolvedValueOnce({ rows: [updated], rowCount: 1 })   // UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });          // audit log

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/packages/pkg-1',
      resource: '/admin/packages/pkg-1',
      pathParameters: { id: 'pkg-1' },
      body: { name: 'Basic Plus', priceMonthly: 1499 },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).name).toBe('Basic Plus');

    const auditCall = (mockPool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('admin_audit_log'),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toContain('update_package');
  });

  it('returns 404 for non-existent package', async () => {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/packages/pkg-999',
      resource: '/admin/packages/pkg-999',
      pathParameters: { id: 'pkg-999' },
      body: { name: 'Updated' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when no fields to update', async () => {
    const existing = { id: 'pkg-1', name: 'Basic' };
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [existing], rowCount: 1 });

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/packages/pkg-1',
      resource: '/admin/packages/pkg-1',
      pathParameters: { id: 'pkg-1' },
      body: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'No fields to update' });
  });
});


// ─── DELETE /admin/packages/:id ──────────────────────────────────────────────

describe('DELETE /admin/packages/:id', () => {
  it('soft-deletes a package with no active subscribers and writes audit log', async () => {
    // Validates: Requirements 8.1, 8.4
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'pkg-1', name: 'Old Plan' }], rowCount: 1 }) // package exists
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })                     // no active subs
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                                    // soft delete
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                   // audit log

    const event = adminEvent({
      method: 'DELETE',
      path: '/admin/packages/pkg-1',
      resource: '/admin/packages/pkg-1',
      pathParameters: { id: 'pkg-1' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true });

    const auditCall = (mockPool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('admin_audit_log'),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toContain('delete_package');
  });

  it('returns 409 when package has active subscribers', async () => {
    // Validates: Requirements 8.3
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'pkg-1', name: 'Active Plan' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });

    const event = adminEvent({
      method: 'DELETE',
      path: '/admin/packages/pkg-1',
      resource: '/admin/packages/pkg-1',
      pathParameters: { id: 'pkg-1' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).error).toContain('active subscribers');
  });

  it('returns 404 for non-existent package', async () => {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = adminEvent({
      method: 'DELETE',
      path: '/admin/packages/pkg-999',
      resource: '/admin/packages/pkg-999',
      pathParameters: { id: 'pkg-999' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });
});


// ─── GET /admin/feature-flags/defaults ───────────────────────────────────────

describe('GET /admin/feature-flags/defaults', () => {
  it('returns all feature flag defaults', async () => {
    // Validates: Requirements 8.1
    const flags = [
      { flag_name: 'call_screening', value: true, updated_at: '2024-01-01' },
      { flag_name: 'spam_filter', value: false, updated_at: '2024-01-01' },
    ];
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: flags, rowCount: 2 });

    const event = adminEvent({
      method: 'GET',
      path: '/admin/feature-flags/defaults',
      resource: '/admin/feature-flags/defaults',
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].flag_name).toBe('call_screening');
  });
});

// ─── PUT /admin/feature-flags/defaults ───────────────────────────────────────

describe('PUT /admin/feature-flags/defaults', () => {
  it('updates feature flag defaults and writes audit log', async () => {
    // Validates: Requirements 8.1, 8.4
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ flag_name: 'spam_filter', value: false }], rowCount: 1 }) // current flags
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // upsert flag
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit log

    const event = adminEvent({
      method: 'PUT',
      path: '/admin/feature-flags/defaults',
      resource: '/admin/feature-flags/defaults',
      body: { spam_filter: true },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true });

    const auditCall = (mockPool.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('admin_audit_log'),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![1]).toContain('update_feature_flag_default');
  });

  it('returns 400 when no flags provided', async () => {
    const event = adminEvent({
      method: 'PUT',
      path: '/admin/feature-flags/defaults',
      resource: '/admin/feature-flags/defaults',
      body: {},
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'At least one flag must be provided' });
  });
});


// ─── GET /admin/audit-log ────────────────────────────────────────────────────

describe('GET /admin/audit-log', () => {
  it('returns paginated audit log entries', async () => {
    // Validates: Requirements 8.1
    const entries = [
      { id: 'al-1', action: 'create_package', target_type: 'package', created_at: '2024-01-01' },
      { id: 'al-2', action: 'enable_user', target_type: 'user', created_at: '2024-01-02' },
    ];
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: entries, rowCount: 2 });

    const event = adminEvent({
      method: 'GET',
      path: '/admin/audit-log',
      resource: '/admin/audit-log',
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
  });

  it('supports userId filter', async () => {
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'al-1', target_id: 'u-1' }], rowCount: 1 });

    const event = adminEvent({
      method: 'GET',
      path: '/admin/audit-log',
      resource: '/admin/audit-log',
      queryStringParameters: { userId: 'u-1' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(1);
  });
});

// ─── 404 for unknown routes ──────────────────────────────────────────────────

describe('Unknown admin routes', () => {
  it('returns 404 for unmatched route', async () => {
    const event = adminEvent({
      method: 'GET',
      path: '/admin/unknown',
      resource: '/admin/unknown',
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Not found' });
  });
});

// ─── Property Tests ──────────────────────────────────────────────────────────

import * as fc from 'fast-check';

// Feature: keepnum-app, Property 29: Admin group enforcement
describe('Property: Admin group enforcement', () => {
  const adminRoutes: Array<{ method: string; path: string }> = [
    { method: 'GET', path: '/admin/users' },
    { method: 'GET', path: '/admin/users/user-123' },
    { method: 'PUT', path: '/admin/users/user-123/status' },
    { method: 'PUT', path: '/admin/users/user-123/package' },
    { method: 'PUT', path: '/admin/users/user-123/feature-flags' },
    { method: 'GET', path: '/admin/users/user-123/billing' },
    { method: 'GET', path: '/admin/packages' },
    { method: 'POST', path: '/admin/packages' },
    { method: 'PUT', path: '/admin/packages/pkg-1' },
    { method: 'DELETE', path: '/admin/packages/pkg-1' },
    { method: 'GET', path: '/admin/feature-flags/defaults' },
    { method: 'PUT', path: '/admin/feature-flags/defaults' },
    { method: 'GET', path: '/admin/audit-log' },
    { method: 'GET', path: '/admin/greetings' },
    { method: 'POST', path: '/admin/greetings' },
    { method: 'PUT', path: '/admin/greetings/gr-1' },
    { method: 'DELETE', path: '/admin/greetings/gr-1' },
  ];

  it('returns 403 for all admin routes when user is not in admin group', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...adminRoutes),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (route, nonAdminGroup) => {
          jest.clearAllMocks();
          const event = buildMockEvent({
            method: route.method,
            path: route.path,
            authorizer: {
              claims: {
                sub: 'non-admin-sub',
                'cognito:groups': nonAdminGroup === 'admin' ? 'users' : nonAdminGroup,
              },
            },
          });

          const result = await handler(event);
          expect(result.statusCode).toBe(403);
          expect(JSON.parse(result.body).error).toContain('Forbidden');
        },
      ),
      { numRuns: 100 },
    );
  });
});
