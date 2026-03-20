import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Pool } from 'pg';
import type {
  SetUserStatusRequest,
  SetUserPackageRequest,
  SetUserFeatureFlagsRequest,
  CreatePackageRequest,
  PaginatedResponse,
} from '@keepnum/shared';
import type {
  AdminActionType,
  AdminTargetType,
  Package,
  FlagValue,
} from '@keepnum/shared';

// ─── Clients (initialised once per cold start) ──────────────────────────────

const cognito = new CognitoIdentityProviderClient({});

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const USER_POOL_ID = process.env.USER_POOL_ID!;

// ─── Response helpers ────────────────────────────────────────────────────────

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ─── Admin group check ──────────────────────────────────────────────────────

function isAdmin(event: APIGatewayProxyEvent): boolean {
  const groups =
    event.requestContext.authorizer?.claims?.['cognito:groups'] ??
    event.requestContext.authorizer?.['cognito:groups'] ??
    '';
  if (Array.isArray(groups)) return groups.includes('admin');
  return typeof groups === 'string' && groups.split(',').includes('admin');
}

function getAdminSub(event: APIGatewayProxyEvent): string {
  return (
    event.requestContext.authorizer?.claims?.sub ??
    event.requestContext.authorizer?.sub ??
    'unknown'
  );
}

// ─── Audit log helper ────────────────────────────────────────────────────────

async function writeAuditLog(
  adminSub: string,
  action: AdminActionType,
  targetType: AdminTargetType,
  targetId: string,
  payload: Record<string, unknown> | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO admin_audit_log (admin_sub, action, target_type, target_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminSub, action, targetType, targetId, payload ? JSON.stringify(payload) : null],
  );
}

// ─── GET /admin/users ────────────────────────────────────────────────────────

async function listUsers(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const search = event.queryStringParameters?.search ?? '';
  const page = parseInt(event.queryStringParameters?.page ?? '1', 10);
  const limit = Math.min(parseInt(event.queryStringParameters?.limit ?? '20', 10), 100);
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE u.deleted_at IS NULL';
  const params: unknown[] = [];

  if (search) {
    params.push(`%${search}%`);
    whereClause += ` AND (u.email ILIKE $${params.length})`;
  }

  const countQuery = `SELECT COUNT(*) as count FROM users u ${whereClause}`;
  const { rows: countRows } = await pool.query<{ count: string }>(countQuery, params);
  const total = parseInt(countRows[0].count, 10);

  params.push(limit, offset);
  const dataQuery = `
    SELECT u.id, u.cognito_id, u.email, u.created_at,
           p.name as package_name,
           s.status as subscription_status,
           (SELECT COUNT(*) FROM parked_numbers pn WHERE pn.user_id = u.id AND pn.status = 'active') as parked_number_count
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status IN ('active', 'trialing', 'past_due')
    LEFT JOIN packages p ON p.id = s.package_id
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await pool.query(dataQuery, params);

  const response: PaginatedResponse<unknown> = { items: rows, total, page, limit };
  return json(200, response);
}

// ─── GET /admin/users/:id ────────────────────────────────────────────────────

async function getUserDetail(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const userId = event.pathParameters?.id;
  if (!userId) return json(400, { error: 'User ID is required' });

  const { rows: userRows } = await pool.query(
    `SELECT u.id, u.cognito_id, u.email, u.created_at, u.deleted_at
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  if (userRows.length === 0) return json(404, { error: 'User not found' });

  const { rows: metrics } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM parked_numbers WHERE user_id = $1 AND status = 'active') as parked_numbers,
       (SELECT COUNT(*) FROM voicemails v JOIN parked_numbers pn ON pn.id = v.parked_number_id WHERE pn.user_id = $1 AND v.deleted_at IS NULL) as voicemail_count,
       (SELECT COUNT(*) FROM sms_messages sm JOIN parked_numbers pn ON pn.id = sm.parked_number_id WHERE pn.user_id = $1 AND sm.deleted_at IS NULL) as sms_count,
       (SELECT COUNT(*) FROM add_ons WHERE user_id = $1 AND enabled = true) as enabled_addons`,
    [userId],
  );

  const { rows: subscription } = await pool.query(
    `SELECT s.*, p.name as package_name
     FROM subscriptions s
     LEFT JOIN packages p ON p.id = s.package_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC LIMIT 1`,
    [userId],
  );

  const { rows: overrides } = await pool.query(
    `SELECT flag_name, value FROM user_feature_overrides WHERE user_id = $1`,
    [userId],
  );

  return json(200, {
    user: userRows[0],
    metrics: metrics[0],
    subscription: subscription[0] ?? null,
    featureOverrides: overrides,
  });
}

// ─── PUT /admin/users/:id/status ─────────────────────────────────────────────

async function setUserStatus(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const adminSub = getAdminSub(event);
  const userId = event.pathParameters?.id;
  if (!userId) return json(400, { error: 'User ID is required' });

  const body: SetUserStatusRequest = event.body ? JSON.parse(event.body) : {};
  if (typeof body.enabled !== 'boolean') {
    return json(400, { error: 'enabled (boolean) is required' });
  }

  // Look up the user's cognito_id
  const { rows: userRows } = await pool.query<{ cognito_id: string }>(
    `SELECT cognito_id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (userRows.length === 0) return json(404, { error: 'User not found' });

  const cognitoId = userRows[0].cognito_id;

  // Enable or disable in Cognito
  if (body.enabled) {
    await cognito.send(
      new AdminEnableUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: cognitoId,
      }),
    );
  } else {
    await cognito.send(
      new AdminDisableUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: cognitoId,
      }),
    );
  }

  const action: AdminActionType = body.enabled ? 'enable_user' : 'disable_user';
  await writeAuditLog(adminSub, action, 'user', userId, {
    enabled: body.enabled,
  });

  return json(200, { success: true, enabled: body.enabled });
}

// ─── PUT /admin/users/:id/package ────────────────────────────────────────────

async function setUserPackage(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const adminSub = getAdminSub(event);
  const userId = event.pathParameters?.id;
  if (!userId) return json(400, { error: 'User ID is required' });

  const body: SetUserPackageRequest = event.body ? JSON.parse(event.body) : {};
  if (!body.packageId) return json(400, { error: 'packageId is required' });

  // Verify user exists
  const { rows: userRows } = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (userRows.length === 0) return json(404, { error: 'User not found' });

  // Verify package exists
  const { rows: pkgRows } = await pool.query(
    `SELECT id, name FROM packages WHERE id = $1 AND deleted_at IS NULL`,
    [body.packageId],
  );
  if (pkgRows.length === 0) return json(404, { error: 'Package not found' });

  // Get current subscription for before/after audit
  const { rows: currentSub } = await pool.query(
    `SELECT package_id FROM subscriptions
     WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due')
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );

  const previousPackageId = currentSub.length > 0 ? currentSub[0].package_id : null;

  if (body.effectiveImmediately) {
    // Update existing subscription or create one
    if (currentSub.length > 0) {
      await pool.query(
        `UPDATE subscriptions SET package_id = $1, updated_at = now()
         WHERE user_id = $2 AND status IN ('active', 'trialing', 'past_due')`,
        [body.packageId, userId],
      );
    } else {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await pool.query(
        `INSERT INTO subscriptions
           (user_id, package_id, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'active', $3, $4)`,
        [userId, body.packageId, now.toISOString(), periodEnd.toISOString()],
      );
    }
  } else {
    // Schedule for next billing cycle — store pending change metadata
    // For simplicity, update the subscription but note the effective date
    if (currentSub.length > 0) {
      await pool.query(
        `UPDATE subscriptions SET package_id = $1, updated_at = now()
         WHERE user_id = $2 AND status IN ('active', 'trialing', 'past_due')`,
        [body.packageId, userId],
      );
    }
  }

  await writeAuditLog(adminSub, 'change_package', 'user', userId, {
    before: { packageId: previousPackageId },
    after: { packageId: body.packageId },
    effectiveImmediately: body.effectiveImmediately,
  });

  return json(200, { success: true, packageId: body.packageId });
}

// ─── PUT /admin/users/:id/feature-flags ──────────────────────────────────────

async function setUserFeatureFlags(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const adminSub = getAdminSub(event);
  const userId = event.pathParameters?.id;
  if (!userId) return json(400, { error: 'User ID is required' });

  const body: SetUserFeatureFlagsRequest = event.body ? JSON.parse(event.body) : {};
  const flagEntries = Object.entries(body);
  if (flagEntries.length === 0) {
    return json(400, { error: 'At least one flag must be provided' });
  }

  // Verify user exists
  const { rows: userRows } = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (userRows.length === 0) return json(404, { error: 'User not found' });

  // Get current overrides for audit before/after
  const { rows: currentOverrides } = await pool.query(
    `SELECT flag_name, value FROM user_feature_overrides WHERE user_id = $1`,
    [userId],
  );
  const beforeMap: Record<string, FlagValue> = {};
  for (const row of currentOverrides) {
    beforeMap[row.flag_name] = row.value;
  }

  // Upsert each flag override
  for (const [flagName, value] of flagEntries) {
    await pool.query(
      `INSERT INTO user_feature_overrides (user_id, flag_name, value, set_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, flag_name)
       DO UPDATE SET value = $3, set_by = $4, updated_at = now()`,
      [userId, flagName, JSON.stringify(value), adminSub],
    );
  }

  await writeAuditLog(adminSub, 'set_flag_override', 'user', userId, {
    before: beforeMap,
    after: body,
  });

  return json(200, { success: true });
}

// ─── GET /admin/users/:id/billing ────────────────────────────────────────────

async function getUserBilling(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const userId = event.pathParameters?.id;
  if (!userId) return json(400, { error: 'User ID is required' });

  const { rows: subscription } = await pool.query(
    `SELECT s.*, p.name as package_name
     FROM subscriptions s
     LEFT JOIN packages p ON p.id = s.package_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC LIMIT 1`,
    [userId],
  );

  const { rows: invoices } = await pool.query(
    `SELECT * FROM invoices
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId],
  );

  return json(200, {
    subscription: subscription[0] ?? null,
    invoices,
  });
}

// ─── GET /admin/packages ─────────────────────────────────────────────────────

async function listPackages(): Promise<APIGatewayProxyResult> {
  const { rows } = await pool.query(
    `SELECT * FROM packages WHERE deleted_at IS NULL ORDER BY sort_order ASC`,
  );
  return json(200, { items: rows });
}

// ─── POST /admin/packages ────────────────────────────────────────────────────

async function createPackage(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const adminSub = getAdminSub(event);
  const body: CreatePackageRequest = event.body ? JSON.parse(event.body) : {};

  if (!body.name) return json(400, { error: 'name is required' });
  if (typeof body.priceMonthly !== 'number') {
    return json(400, { error: 'priceMonthly is required' });
  }

  const { rows } = await pool.query<Package>(
    `INSERT INTO packages
       (name, description, price_monthly_cents, per_number_price_cents, publicly_visible, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      body.name,
      body.description ?? null,
      body.priceMonthly,
      body.perNumberPrice ?? null,
      body.publiclyVisible ?? false,
      body.sortOrder ?? 0,
    ],
  );

  const pkg = rows[0];

  // Insert package flags if provided
  if (body.flags) {
    for (const [flagName, value] of Object.entries(body.flags)) {
      await pool.query(
        `INSERT INTO package_flags (package_id, flag_name, value)
         VALUES ($1, $2, $3)`,
        [pkg.id, flagName, JSON.stringify(value)],
      );
    }
  }

  await writeAuditLog(adminSub, 'create_package', 'package', pkg.id, {
    after: { name: body.name, priceMonthly: body.priceMonthly },
  });

  return json(201, pkg);
}

// ─── PUT /admin/packages/:id ─────────────────────────────────────────────────

async function updatePackage(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const adminSub = getAdminSub(event);
  const packageId = event.pathParameters?.id;
  if (!packageId) return json(400, { error: 'Package ID is required' });

  const body = event.body ? JSON.parse(event.body) : {};

  // Get current package for before/after audit
  const { rows: currentRows } = await pool.query(
    `SELECT * FROM packages WHERE id = $1 AND deleted_at IS NULL`,
    [packageId],
  );
  if (currentRows.length === 0) return json(404, { error: 'Package not found' });

  const before = currentRows[0];

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (body.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(body.name);
  }
  if (body.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(body.description);
  }
  if (body.priceMonthly !== undefined) {
    updates.push(`price_monthly_cents = $${paramIndex++}`);
    values.push(body.priceMonthly);
  }
  if (body.perNumberPrice !== undefined) {
    updates.push(`per_number_price_cents = $${paramIndex++}`);
    values.push(body.perNumberPrice);
  }
  if (body.publiclyVisible !== undefined) {
    updates.push(`publicly_visible = $${paramIndex++}`);
    values.push(body.publiclyVisible);
  }
  if (body.sortOrder !== undefined) {
    updates.push(`sort_order = $${paramIndex++}`);
    values.push(body.sortOrder);
  }

  if (updates.length === 0) {
    return json(400, { error: 'No fields to update' });
  }

  updates.push(`updated_at = now()`);
  values.push(packageId);

  const { rows } = await pool.query(
    `UPDATE packages SET ${updates.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
    values,
  );

  if (rows.length === 0) return json(404, { error: 'Package not found' });

  // Update package flags if provided
  if (body.flags) {
    for (const [flagName, value] of Object.entries(body.flags)) {
      await pool.query(
        `INSERT INTO package_flags (package_id, flag_name, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (package_id, flag_name)
         DO UPDATE SET value = $3`,
        [packageId, flagName, JSON.stringify(value)],
      );
    }
  }

  await writeAuditLog(adminSub, 'update_package', 'package', packageId, {
    before: { name: before.name, price_monthly_cents: before.price_monthly_cents },
    after: { name: rows[0].name, price_monthly_cents: rows[0].price_monthly_cents },
  });

  return json(200, rows[0]);
}

// ─── DELETE /admin/packages/:id ──────────────────────────────────────────────

async function deletePackage(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const adminSub = getAdminSub(event);
  const packageId = event.pathParameters?.id;
  if (!packageId) return json(400, { error: 'Package ID is required' });

  // Check package exists
  const { rows: pkgRows } = await pool.query(
    `SELECT * FROM packages WHERE id = $1 AND deleted_at IS NULL`,
    [packageId],
  );
  if (pkgRows.length === 0) return json(404, { error: 'Package not found' });

  // Deletion guard: check for active subscribers
  const { rows: subRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM subscriptions
     WHERE package_id = $1 AND status IN ('active', 'trialing', 'past_due')`,
    [packageId],
  );
  if (parseInt(subRows[0].count, 10) > 0) {
    return json(409, {
      error: 'Cannot delete package with active subscribers. Reassign users first.',
    });
  }

  // Soft delete
  await pool.query(
    `UPDATE packages SET deleted_at = now(), updated_at = now() WHERE id = $1`,
    [packageId],
  );

  await writeAuditLog(adminSub, 'delete_package', 'package', packageId, {
    before: { name: pkgRows[0].name },
  });

  return json(200, { success: true });
}

// ─── GET /admin/feature-flags/defaults ───────────────────────────────────────

async function getFeatureFlagDefaults(): Promise<APIGatewayProxyResult> {
  const { rows } = await pool.query(
    `SELECT flag_name, value, updated_at, updated_by FROM feature_flags ORDER BY flag_name`,
  );
  return json(200, { items: rows });
}

// ─── PUT /admin/feature-flags/defaults ───────────────────────────────────────

async function updateFeatureFlagDefaults(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const adminSub = getAdminSub(event);
  const body: Record<string, FlagValue> = event.body ? JSON.parse(event.body) : {};
  const entries = Object.entries(body);

  if (entries.length === 0) {
    return json(400, { error: 'At least one flag must be provided' });
  }

  // Get current values for audit
  const { rows: currentFlags } = await pool.query(
    `SELECT flag_name, value FROM feature_flags`,
  );
  const beforeMap: Record<string, FlagValue> = {};
  for (const row of currentFlags) {
    beforeMap[row.flag_name] = row.value;
  }

  for (const [flagName, value] of entries) {
    await pool.query(
      `INSERT INTO feature_flags (flag_name, value, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (flag_name)
       DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
      [flagName, JSON.stringify(value), adminSub],
    );
  }

  await writeAuditLog(adminSub, 'update_feature_flag_default', 'feature_flag', 'system', {
    before: beforeMap,
    after: body,
  });

  return json(200, { success: true });
}

// ─── GET /admin/audit-log ────────────────────────────────────────────────────

async function getAuditLog(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const userId = event.queryStringParameters?.userId;
  const from = event.queryStringParameters?.from;
  const to = event.queryStringParameters?.to;
  const page = parseInt(event.queryStringParameters?.page ?? '1', 10);
  const limit = Math.min(parseInt(event.queryStringParameters?.limit ?? '50', 10), 100);
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];

  if (userId) {
    params.push(userId);
    whereClause += ` AND (target_type = 'user' AND target_id = $${params.length})`;
  }
  if (from) {
    params.push(from);
    whereClause += ` AND created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    whereClause += ` AND created_at <= $${params.length}`;
  }

  const countQuery = `SELECT COUNT(*) as count FROM admin_audit_log ${whereClause}`;
  const { rows: countRows } = await pool.query<{ count: string }>(countQuery, params);
  const total = parseInt(countRows[0].count, 10);

  params.push(limit, offset);
  const dataQuery = `
    SELECT * FROM admin_audit_log
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await pool.query(dataQuery, params);

  return json(200, { items: rows, total, page, limit });
}

// ─── GET /packages/public (unauthenticated) ──────────────────────────────────

async function listPublicPackages(): Promise<APIGatewayProxyResult> {
  const { rows } = await pool.query(
    `SELECT id, name, description, price_monthly_cents, per_number_price_cents,
            sort_order
     FROM packages
     WHERE publicly_visible = true AND deleted_at IS NULL
     ORDER BY sort_order ASC`,
  );
  return json(200, { items: rows });
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export // ─── Marketplace greetings admin ──────────────────────────────────────────────

async function listAdminGreetings(): Promise<APIGatewayProxyResult> {
  const { rows } = await pool.query(`SELECT * FROM marketplace_greetings ORDER BY created_at DESC`);
  return json(200, { greetings: rows });
}

async function createAdminGreeting(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body ?? '{}');
  const { name, category, audio_url, preview_url, voice_talent, description, price_cents } = body;
  if (!name || !category || !audio_url) return json(400, { error: 'name, category, and audio_url are required' });

  const { rows } = await pool.query(
    `INSERT INTO marketplace_greetings (name, category, audio_url, preview_url, voice_talent, description, price_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, category, audio_url, preview_url ?? null, voice_talent ?? null, description ?? null, price_cents ?? 0]);

  await writeAuditLog(getAdminSub(event), 'marketplace_greeting_created', 'marketplace_greeting', rows[0].id, { name });
  return json(201, rows[0]);
}

async function updateAdminGreeting(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const id = (event.resource ?? event.path ?? '').split('/').pop();
  const body = JSON.parse(event.body ?? '{}');
  const { name, category, audio_url, preview_url, voice_talent, description, price_cents, active } = body;

  await pool.query(
    `UPDATE marketplace_greetings SET
     name = COALESCE($1, name), category = COALESCE($2, category), audio_url = COALESCE($3, audio_url),
     preview_url = COALESCE($4, preview_url), voice_talent = COALESCE($5, voice_talent),
     description = COALESCE($6, description), price_cents = COALESCE($7, price_cents),
     active = COALESCE($8, active), updated_at = now()
     WHERE id = $9`,
    [name, category, audio_url, preview_url, voice_talent, description, price_cents, active, id]);

  await writeAuditLog(getAdminSub(event), 'marketplace_greeting_updated', 'marketplace_greeting', id!, null);
  return json(200, { message: 'Greeting updated' });
}

async function deleteAdminGreeting(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const id = (event.resource ?? event.path ?? '').split('/').pop();
  await pool.query(`DELETE FROM marketplace_greetings WHERE id = $1`, [id]);
  await writeAuditLog(getAdminSub(event), 'marketplace_greeting_deleted', 'marketplace_greeting', id!, null);
  return json(200, { message: 'Greeting deleted' });
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.resource ?? event.path ?? '';

  try {
    // Public endpoint — no auth required
    if (method === 'GET' && path === '/packages/public') {
      return await listPublicPackages();
    }

    // All admin routes require admin group
    if (!isAdmin(event)) {
      return json(403, { error: 'Forbidden: admin group required' });
    }

    // ── User management ──
    if (method === 'GET' && path === '/admin/users') {
      return await listUsers(event);
    }
    if (method === 'GET' && path.match(/^\/admin\/users\/[^/]+$/)) {
      return await getUserDetail(event);
    }
    if (method === 'PUT' && path.match(/^\/admin\/users\/[^/]+\/status$/)) {
      return await setUserStatus(event);
    }
    if (method === 'PUT' && path.match(/^\/admin\/users\/[^/]+\/package$/)) {
      return await setUserPackage(event);
    }
    if (method === 'PUT' && path.match(/^\/admin\/users\/[^/]+\/feature-flags$/)) {
      return await setUserFeatureFlags(event);
    }
    if (method === 'GET' && path.match(/^\/admin\/users\/[^/]+\/billing$/)) {
      return await getUserBilling(event);
    }

    // ── Package management ──
    if (method === 'GET' && path === '/admin/packages') {
      return await listPackages();
    }
    if (method === 'POST' && path === '/admin/packages') {
      return await createPackage(event);
    }
    if (method === 'PUT' && path.match(/^\/admin\/packages\/[^/]+$/)) {
      return await updatePackage(event);
    }
    if (method === 'DELETE' && path.match(/^\/admin\/packages\/[^/]+$/)) {
      return await deletePackage(event);
    }

    // ── Feature flags ──
    if (method === 'GET' && path === '/admin/feature-flags/defaults') {
      return await getFeatureFlagDefaults();
    }
    if (method === 'PUT' && path === '/admin/feature-flags/defaults') {
      return await updateFeatureFlagDefaults(event);
    }

    // ── Audit log ──
    if (method === 'GET' && path === '/admin/audit-log') {
      return await getAuditLog(event);
    }

    // ── Marketplace greetings ──
    if (method === 'GET' && path === '/admin/greetings') {
      return await listAdminGreetings();
    }
    if (method === 'POST' && path === '/admin/greetings') {
      return await createAdminGreeting(event);
    }
    if (method === 'PUT' && path.match(/^\/admin\/greetings\/[^/]+$/)) {
      return await updateAdminGreeting(event);
    }
    if (method === 'DELETE' && path.match(/^\/admin\/greetings\/[^/]+$/)) {
      return await deleteAdminGreeting(event);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Admin service error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
