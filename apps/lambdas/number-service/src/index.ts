import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import {
  resolveFlag,
  assertFlag,
  assertNumericLimit,
} from '@keepnum/shared';
import type {
  NumberSearchParams,
  ProvisionNumberRequest,
  SetForwardingRuleRequest,
  SetRetentionRequest,
  SetGreetingRequest,
  AddCallerRuleRequest,
  AddBlockListRequest,
  CreateDndScheduleRequest,
  UpdateDndScheduleRequest,
  ToggleDndScheduleRequest,
  ImportContactsRequest,
  UpdateContactRequest,
  SetTierActionsRequest,
} from '@keepnum/shared';
import type { RetentionPolicy } from '@keepnum/shared';

// ─── Clients (initialised once per cold start) ──────────────────────────────

const ssm = new SSMClient({});

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const TELNYX_API_KEY_SSM_PATH = process.env.TELNYX_API_KEY_SSM_PATH!;

let telnyxApiKey: string | undefined;

async function getTelnyxApiKey(): Promise<string> {
  if (telnyxApiKey) return telnyxApiKey;
  const result = await ssm.send(
    new GetParameterCommand({
      Name: TELNYX_API_KEY_SSM_PATH,
      WithDecryption: true,
    }),
  );
  telnyxApiKey = result.Parameter?.Value ?? '';
  return telnyxApiKey;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function getUserId(event: APIGatewayProxyEvent): string | undefined {
  return event.requestContext.authorizer?.claims?.sub as string | undefined;
}

async function getDbUserId(cognitoSub: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE cognito_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [cognitoSub],
  );
  return rows.length > 0 ? rows[0].id : null;
}

async function verifyOwnership(
  numberId: string,
  dbUserId: string,
): Promise<{ id: string; telnyx_number_id: string; phone_number: string } | null> {
  const { rows } = await pool.query<{
    id: string;
    telnyx_number_id: string;
    phone_number: string;
  }>(
    `SELECT id, telnyx_number_id, phone_number
     FROM parked_numbers
     WHERE id = $1 AND user_id = $2 AND status = 'active'
     LIMIT 1`,
    [numberId, dbUserId],
  );
  return rows.length > 0 ? rows[0] : null;
}

const RETENTION_OPTIONS: RetentionPolicy[] = ['30d', '60d', '90d', 'forever'];
const RETENTION_FLAG_MAP: Record<RetentionPolicy, string> = {
  '30d': 'retention_30d',
  '60d': 'retention_60d',
  '90d': 'retention_90d',
  forever: 'retention_forever',
};

function matchPath(
  path: string,
  pattern: string,
): Record<string, string> | null {
  const pathParts = path.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// ─── Route: GET /numbers/search ──────────────────────────────────────────────

async function handleSearchNumbers(
  event: APIGatewayProxyEvent,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'number_search', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const qs = event.queryStringParameters ?? {};
  const params: NumberSearchParams = {
    areaCode: qs.areaCode,
    region: qs.region,
    country: qs.country,
    type: qs.type as NumberSearchParams['type'],
    pattern: qs.pattern,
  };

  const apiKey = await getTelnyxApiKey();
  const searchParams = new URLSearchParams();
  if (params.areaCode) searchParams.set('filter[national_destination_code]', params.areaCode);
  if (params.region) searchParams.set('filter[administrative_area]', params.region);
  if (params.country) searchParams.set('filter[country_code]', params.country ?? 'US');
  if (params.type) searchParams.set('filter[number_type]', params.type);
  if (params.pattern) searchParams.set('filter[phone_number][contains]', params.pattern);
  searchParams.set('page[size]', '20');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://api.telnyx.com/v2/available_phone_numbers?${searchParams.toString()}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      return json(503, { error: 'Number search service is temporarily unavailable.' });
    }

    const data = (await res.json()) as {
      data: Array<{
        id: string;
        phone_number: string;
        number_type: string;
        cost_information?: { monthly_cost?: string };
      }>;
    };

    const results = data.data.map((n) => ({
      telnyxNumberId: n.id,
      phoneNumber: n.phone_number,
      numberType: n.number_type,
      monthlyCostCents: Math.round(parseFloat(n.cost_information?.monthly_cost ?? '0') * 100),
      available: true,
    }));

    return json(200, { items: results });
  } catch {
    // Telnyx unavailable — never return stale data (Req 11.6)
    return json(503, { error: 'Number search service is temporarily unavailable.' });
  }
}

// ─── Route: POST /numbers ────────────────────────────────────────────────────

async function handleProvisionNumber(
  body: ProvisionNumberRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const parkDenied = await assertFlag(dbUserId, 'call_parking', pool);
  if (parkDenied) return { ...parkDenied, headers: { 'Content-Type': 'application/json' } };

  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM parked_numbers WHERE user_id = $1 AND status = 'active'`,
    [dbUserId],
  );
  const currentCount = parseInt(countRows[0].count, 10);
  const limitDenied = await assertNumericLimit(dbUserId, 'max_parked_numbers', currentCount, pool);
  if (limitDenied) return { ...limitDenied, headers: { 'Content-Type': 'application/json' } };

  const apiKey = await getTelnyxApiKey();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const telnyxRes = await fetch('https://api.telnyx.com/v2/number_orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_numbers: [{ phone_number_id: body.telnyxNumberId }],
      }),
    });

    if (!telnyxRes.ok) {
      await client.query('ROLLBACK');
      const errBody = await telnyxRes.text();
      return json(502, { error: `Telnyx provisioning failed: ${errBody}` });
    }

    const telnyxData = (await telnyxRes.json()) as {
      data: { phone_numbers: Array<{ id: string; phone_number: string }> };
    };
    const provisioned = telnyxData.data.phone_numbers[0];

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO parked_numbers (user_id, telnyx_number_id, phone_number, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [dbUserId, provisioned.id, provisioned.phone_number],
    );

    await client.query('COMMIT');
    return json(201, { id: rows[0].id, phoneNumber: provisioned.phone_number });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Provision error:', err);
    return json(500, { error: 'Failed to provision number' });
  } finally {
    client.release();
  }
}

// ─── Route: GET /numbers ─────────────────────────────────────────────────────

async function handleListNumbers(
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const { rows } = await pool.query(
    `SELECT id, telnyx_number_id, phone_number, status, retention_policy, created_at, released_at
     FROM parked_numbers
     WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at DESC`,
    [dbUserId],
  );
  return json(200, { items: rows });
}

// ─── Route: DELETE /numbers/:id ──────────────────────────────────────────────

async function handleDeleteNumber(
  numberId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  const apiKey = await getTelnyxApiKey();
  try {
    const res = await fetch(
      `https://api.telnyx.com/v2/number_orders/${number.telnyx_number_id}/actions/release`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!res.ok) {
      console.warn(`Telnyx release failed for ${number.telnyx_number_id}: ${res.status}`);
    }
  } catch (err) {
    console.warn(`Telnyx release error for ${number.telnyx_number_id}:`, err);
  }

  await pool.query(
    `UPDATE parked_numbers SET status = 'released', released_at = now() WHERE id = $1`,
    [numberId],
  );

  return json(200, { message: 'Number released' });
}

// ─── Route: PUT /numbers/:id/forwarding-rule ─────────────────────────────────

async function handleSetForwardingRule(
  numberId: string,
  body: SetForwardingRuleRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'call_forwarding', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  // Upsert: one active forwarding rule per number (Req 3.5)
  const { rows } = await pool.query(
    `INSERT INTO forwarding_rules (parked_number_id, destination, enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (parked_number_id)
       DO UPDATE SET destination = EXCLUDED.destination,
                     enabled = EXCLUDED.enabled,
                     updated_at = now()
     RETURNING id, destination, enabled, created_at, updated_at`,
    [numberId, body.destination, body.enabled ?? true],
  );

  return json(200, rows[0]);
}

// ─── Route: PUT /numbers/:id/retention ───────────────────────────────────────

async function handleSetRetention(
  numberId: string,
  body: SetRetentionRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  if (!RETENTION_OPTIONS.includes(body.policy)) {
    return json(400, { error: `Invalid retention policy. Must be one of: ${RETENTION_OPTIONS.join(', ')}` });
  }

  const flagName = RETENTION_FLAG_MAP[body.policy];
  const denied = await assertFlag(dbUserId, flagName as any, pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  await pool.query(
    `UPDATE parked_numbers SET retention_policy = $1 WHERE id = $2`,
    [body.policy, numberId],
  );

  return json(200, { id: numberId, retentionPolicy: body.policy });
}

// ─── Route: PUT /numbers/:id/greeting ────────────────────────────────────────

async function handleSetGreeting(
  numberId: string,
  body: SetGreetingRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const greetingFlag =
    body.greetingType === 'default'
      ? 'youmail_custom_greetings'
      : 'youmail_smart_greetings';
  const denied = await assertFlag(dbUserId, greetingFlag, pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  const { rows } = await pool.query(
    `INSERT INTO greetings (parked_number_id, greeting_type, audio_key, tts_text)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (parked_number_id, greeting_type)
       DO UPDATE SET audio_key = EXCLUDED.audio_key,
                     tts_text = EXCLUDED.tts_text
     RETURNING id, greeting_type, audio_key, tts_text, created_at`,
    [numberId, body.greetingType, body.audioUrl ?? null, body.text ?? null],
  );

  return json(200, rows[0]);
}

// ─── Route: POST /numbers/:id/caller-rules ───────────────────────────────────

async function handleAddCallerRule(
  numberId: string,
  body: AddCallerRuleRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'youmail_caller_rules', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  const { rows } = await pool.query(
    `INSERT INTO caller_rules (parked_number_id, caller_id, action, action_data)
     VALUES ($1, $2, $3, $4)
     RETURNING id, caller_id, action, action_data, created_at`,
    [numberId, body.callerId, body.action, body.actionData ? JSON.stringify(body.actionData) : null],
  );

  return json(201, rows[0]);
}

// ─── Route: DELETE /numbers/:id/caller-rules/:ruleId ─────────────────────────

async function handleDeleteCallerRule(
  numberId: string,
  ruleId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  const { rowCount } = await pool.query(
    `DELETE FROM caller_rules WHERE id = $1 AND parked_number_id = $2`,
    [ruleId, numberId],
  );

  if (!rowCount) return json(404, { error: 'Caller rule not found' });
  return json(200, { message: 'Caller rule deleted' });
}

// ─── Route: POST /numbers/:id/blocklist ──────────────────────────────────────

async function handleAddBlockList(
  numberId: string,
  body: AddBlockListRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'youmail_block_list', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  const { rows } = await pool.query(
    `INSERT INTO block_list (parked_number_id, caller_id)
     VALUES ($1, $2)
     ON CONFLICT (parked_number_id, caller_id) DO NOTHING
     RETURNING id, caller_id, created_at`,
    [numberId, body.callerId],
  );

  if (rows.length === 0) {
    return json(200, { message: 'Caller already in block list' });
  }
  return json(201, rows[0]);
}

// ─── Route: DELETE /numbers/:id/blocklist/:callerId ──────────────────────────

async function handleDeleteBlockList(
  numberId: string,
  callerId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  const { rowCount } = await pool.query(
    `DELETE FROM block_list WHERE parked_number_id = $1 AND caller_id = $2`,
    [numberId, decodeURIComponent(callerId)],
  );

  if (!rowCount) return json(404, { error: 'Block list entry not found' });
  return json(200, { message: 'Removed from block list' });
}

// ─── Route: POST /numbers/:id/dnd-schedules ─────────────────────────────────

async function handleCreateDndSchedule(
  numberId: string,
  body: CreateDndScheduleRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'dnd_scheduling', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  if (!body.name || !body.days || !body.startTime || !body.endTime || !body.timezone || !body.action) {
    return json(400, { error: 'name, days, startTime, endTime, timezone, and action are required' });
  }

  // Validate days of week (0-6)
  if (!Array.isArray(body.days) || body.days.some((d) => d < 0 || d > 6)) {
    return json(400, { error: 'days must be an array of integers 0-6 (Sun-Sat)' });
  }

  const { rows } = await pool.query(
    `INSERT INTO dnd_schedules (number_id, number_type, user_id, name, days_of_week, start_time, end_time, timezone, action, action_data)
     VALUES ($1, 'parked', $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, number_id, number_type, name, days_of_week, start_time, end_time, timezone, action, action_data, enabled, created_at`,
    [numberId, dbUserId, body.name, body.days, body.startTime, body.endTime, body.timezone, body.action, body.actionData ? JSON.stringify(body.actionData) : null],
  );

  return json(201, rows[0]);
}

// ─── Route: GET /numbers/:id/dnd-schedules ───────────────────────────────────

async function handleListDndSchedules(
  numberId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'dnd_scheduling', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  const { rows } = await pool.query(
    `SELECT id, number_id, number_type, name, days_of_week, start_time, end_time, timezone, action, action_data, enabled, created_at, updated_at
     FROM dnd_schedules
     WHERE number_id = $1 AND user_id = $2
     ORDER BY start_time ASC`,
    [numberId, dbUserId],
  );

  return json(200, { items: rows });
}

// ─── Route: PUT /numbers/:id/dnd-schedules/:scheduleId ───────────────────────

async function handleUpdateDndSchedule(
  numberId: string,
  scheduleId: string,
  body: UpdateDndScheduleRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'dnd_scheduling', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  if (body.days && (!Array.isArray(body.days) || body.days.some((d) => d < 0 || d > 6))) {
    return json(400, { error: 'days must be an array of integers 0-6 (Sun-Sat)' });
  }

  // Build dynamic update
  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [];
  let idx = 0;

  if (body.name !== undefined) { params.push(body.name); sets.push(`name = $${++idx}`); }
  if (body.days !== undefined) { params.push(body.days); sets.push(`days_of_week = $${++idx}`); }
  if (body.startTime !== undefined) { params.push(body.startTime); sets.push(`start_time = $${++idx}`); }
  if (body.endTime !== undefined) { params.push(body.endTime); sets.push(`end_time = $${++idx}`); }
  if (body.timezone !== undefined) { params.push(body.timezone); sets.push(`timezone = $${++idx}`); }
  if (body.action !== undefined) { params.push(body.action); sets.push(`action = $${++idx}`); }
  if (body.actionData !== undefined) { params.push(JSON.stringify(body.actionData)); sets.push(`action_data = $${++idx}`); }

  params.push(scheduleId, numberId, dbUserId);

  const { rows } = await pool.query(
    `UPDATE dnd_schedules SET ${sets.join(', ')}
     WHERE id = $${++idx} AND number_id = $${++idx} AND user_id = $${++idx}
     RETURNING id, number_id, number_type, name, days_of_week, start_time, end_time, timezone, action, action_data, enabled, updated_at`,
    params,
  );

  if (rows.length === 0) return json(404, { error: 'DND schedule not found' });
  return json(200, rows[0]);
}

// ─── Route: DELETE /numbers/:id/dnd-schedules/:scheduleId ────────────────────

async function handleDeleteDndSchedule(
  numberId: string,
  scheduleId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'dnd_scheduling', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  const { rowCount } = await pool.query(
    `DELETE FROM dnd_schedules WHERE id = $1 AND number_id = $2 AND user_id = $3`,
    [scheduleId, numberId, dbUserId],
  );

  if (!rowCount) return json(404, { error: 'DND schedule not found' });
  return json(200, { message: 'DND schedule deleted' });
}

// ─── Route: PUT /numbers/:id/dnd-schedules/:scheduleId/toggle ────────────────

async function handleToggleDndSchedule(
  numberId: string,
  scheduleId: string,
  body: ToggleDndScheduleRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'dnd_scheduling', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const number = await verifyOwnership(numberId, dbUserId);
  if (!number) return json(404, { error: 'Number not found' });

  if (typeof body.enabled !== 'boolean') {
    return json(400, { error: 'enabled is required and must be a boolean' });
  }

  const { rows } = await pool.query(
    `UPDATE dnd_schedules SET enabled = $1, updated_at = now()
     WHERE id = $2 AND number_id = $3 AND user_id = $4
     RETURNING id, number_id, name, enabled, updated_at`,
    [body.enabled, scheduleId, numberId, dbUserId],
  );

  if (rows.length === 0) return json(404, { error: 'DND schedule not found' });
  return json(200, rows[0]);
}

// ─── Route: POST /contacts/import ────────────────────────────────────────────

async function handleImportContacts(
  body: ImportContactsRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'smart_routing', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  if (!body.source || !body.data?.length) {
    return json(400, { error: 'source and data are required' });
  }

  let imported = 0;
  for (const contact of body.data) {
    if (!contact.name || !contact.phoneNumber) continue;
    const { rowCount } = await pool.query(
      `INSERT INTO contacts (user_id, name, phone_number, tier, group_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, phone_number)
         DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier, group_name = EXCLUDED.group_name, updated_at = now()`,
      [dbUserId, contact.name, contact.phoneNumber, contact.tier ?? 'known', contact.groupName ?? null],
    );
    imported += rowCount ?? 0;
  }

  return json(201, { imported });
}

// ─── Route: GET /contacts ────────────────────────────────────────────────────

async function handleListContacts(
  event: APIGatewayProxyEvent,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'smart_routing', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const qs = event.queryStringParameters ?? {};
  let query = `SELECT id, name, phone_number, tier, group_name, created_at, updated_at
               FROM contacts WHERE user_id = $1`;
  const params: unknown[] = [dbUserId];

  if (qs.tier) {
    params.push(qs.tier);
    query += ` AND tier = $${params.length}`;
  }
  if (qs.search) {
    params.push(`%${qs.search}%`);
    query += ` AND (name ILIKE $${params.length} OR phone_number ILIKE $${params.length})`;
  }

  query += ` ORDER BY name ASC`;

  const { rows } = await pool.query(query, params);
  return json(200, { items: rows });
}

// ─── Route: PUT /contacts/:contactId ─────────────────────────────────────────

async function handleUpdateContact(
  contactId: string,
  body: UpdateContactRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'smart_routing', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [];
  let idx = 0;

  if (body.tier !== undefined) { params.push(body.tier); sets.push(`tier = $${++idx}`); }
  if (body.name !== undefined) { params.push(body.name); sets.push(`name = $${++idx}`); }
  if (body.groupName !== undefined) { params.push(body.groupName); sets.push(`group_name = $${++idx}`); }

  params.push(contactId, dbUserId);

  const { rows } = await pool.query(
    `UPDATE contacts SET ${sets.join(', ')}
     WHERE id = $${++idx} AND user_id = $${++idx}
     RETURNING id, name, phone_number, tier, group_name, updated_at`,
    params,
  );

  if (rows.length === 0) return json(404, { error: 'Contact not found' });
  return json(200, rows[0]);
}

// ─── Route: DELETE /contacts/:contactId ──────────────────────────────────────

async function handleDeleteContact(
  contactId: string,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'smart_routing', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  const { rowCount } = await pool.query(
    `DELETE FROM contacts WHERE id = $1 AND user_id = $2`,
    [contactId, dbUserId],
  );

  if (!rowCount) return json(404, { error: 'Contact not found' });
  return json(200, { message: 'Contact deleted' });
}

// ─── Route: PUT /contacts/tier-actions ───────────────────────────────────────

async function handleSetTierActions(
  body: SetTierActionsRequest,
  dbUserId: string,
): Promise<APIGatewayProxyResult> {
  const denied = await assertFlag(dbUserId, 'smart_routing', pool);
  if (denied) return { ...denied, headers: { 'Content-Type': 'application/json' } };

  if (!body.vip || !body.known || !body.default) {
    return json(400, { error: 'vip, known, and default tier actions are required' });
  }

  const tiers = [
    { tier: 'vip', ...body.vip },
    { tier: 'known', ...body.known },
    { tier: 'default', ...body.default },
  ];

  for (const t of tiers) {
    await pool.query(
      `INSERT INTO tier_actions (user_id, tier, action, action_data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, tier)
         DO UPDATE SET action = EXCLUDED.action, action_data = EXCLUDED.action_data`,
      [dbUserId, t.tier, t.action, t.actionData ? JSON.stringify(t.actionData) : null],
    );
  }

  return json(200, { message: 'Tier actions updated' });
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;

  try {
    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });

    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'User not found' });

    // GET /numbers/search
    if (httpMethod === 'GET' && path === '/numbers/search') {
      return handleSearchNumbers(event, dbUserId);
    }

    // POST /numbers
    if (httpMethod === 'POST' && path === '/numbers') {
      const body: ProvisionNumberRequest = JSON.parse(event.body ?? '{}');
      if (!body.telnyxNumberId) {
        return json(400, { error: 'telnyxNumberId is required' });
      }
      return handleProvisionNumber(body, dbUserId);
    }

    // GET /numbers
    if (httpMethod === 'GET' && path === '/numbers') {
      return handleListNumbers(dbUserId);
    }

    // DELETE /numbers/:id
    let params = matchPath(path, '/numbers/:id');
    if (httpMethod === 'DELETE' && params
        && !path.includes('/caller-rules') && !path.includes('/blocklist')) {
      return handleDeleteNumber(params.id, dbUserId);
    }

    // PUT /numbers/:id/forwarding-rule
    params = matchPath(path, '/numbers/:id/forwarding-rule');
    if (httpMethod === 'PUT' && params) {
      const body: SetForwardingRuleRequest = JSON.parse(event.body ?? '{}');
      if (!body.destination) return json(400, { error: 'destination is required' });
      return handleSetForwardingRule(params.id, body, dbUserId);
    }

    // PUT /numbers/:id/retention
    params = matchPath(path, '/numbers/:id/retention');
    if (httpMethod === 'PUT' && params) {
      const body: SetRetentionRequest = JSON.parse(event.body ?? '{}');
      if (!body.policy) return json(400, { error: 'policy is required' });
      return handleSetRetention(params.id, body, dbUserId);
    }

    // PUT /numbers/:id/greeting
    params = matchPath(path, '/numbers/:id/greeting');
    if (httpMethod === 'PUT' && params) {
      const body: SetGreetingRequest = JSON.parse(event.body ?? '{}');
      if (!body.greetingType) return json(400, { error: 'greetingType is required' });
      return handleSetGreeting(params.id, body, dbUserId);
    }

    // POST /numbers/:id/caller-rules
    params = matchPath(path, '/numbers/:id/caller-rules');
    if (httpMethod === 'POST' && params) {
      const body: AddCallerRuleRequest = JSON.parse(event.body ?? '{}');
      if (!body.callerId || !body.action) {
        return json(400, { error: 'callerId and action are required' });
      }
      return handleAddCallerRule(params.id, body, dbUserId);
    }

    // DELETE /numbers/:id/caller-rules/:ruleId
    params = matchPath(path, '/numbers/:id/caller-rules/:ruleId');
    if (httpMethod === 'DELETE' && params) {
      return handleDeleteCallerRule(params.id, params.ruleId, dbUserId);
    }

    // POST /numbers/:id/blocklist
    params = matchPath(path, '/numbers/:id/blocklist');
    if (httpMethod === 'POST' && params) {
      const body: AddBlockListRequest = JSON.parse(event.body ?? '{}');
      if (!body.callerId) return json(400, { error: 'callerId is required' });
      return handleAddBlockList(params.id, body, dbUserId);
    }

    // DELETE /numbers/:id/blocklist/:callerId
    params = matchPath(path, '/numbers/:id/blocklist/:callerId');
    if (httpMethod === 'DELETE' && params) {
      return handleDeleteBlockList(params.id, params.callerId, dbUserId);
    }

    // ── DND Schedules (5.1) ──────────────────────────────────────────────

    // PUT /numbers/:id/dnd-schedules/:scheduleId/toggle
    params = matchPath(path, '/numbers/:id/dnd-schedules/:scheduleId/toggle');
    if (httpMethod === 'PUT' && params) {
      const body: ToggleDndScheduleRequest = JSON.parse(event.body ?? '{}');
      return handleToggleDndSchedule(params.id, params.scheduleId, body, dbUserId);
    }

    // POST /numbers/:id/dnd-schedules
    params = matchPath(path, '/numbers/:id/dnd-schedules');
    if (httpMethod === 'POST' && params) {
      const body: CreateDndScheduleRequest = JSON.parse(event.body ?? '{}');
      return handleCreateDndSchedule(params.id, body, dbUserId);
    }

    // GET /numbers/:id/dnd-schedules
    params = matchPath(path, '/numbers/:id/dnd-schedules');
    if (httpMethod === 'GET' && params) {
      return handleListDndSchedules(params.id, dbUserId);
    }

    // PUT /numbers/:id/dnd-schedules/:scheduleId
    params = matchPath(path, '/numbers/:id/dnd-schedules/:scheduleId');
    if (httpMethod === 'PUT' && params) {
      const body: UpdateDndScheduleRequest = JSON.parse(event.body ?? '{}');
      return handleUpdateDndSchedule(params.id, params.scheduleId, body, dbUserId);
    }

    // DELETE /numbers/:id/dnd-schedules/:scheduleId
    params = matchPath(path, '/numbers/:id/dnd-schedules/:scheduleId');
    if (httpMethod === 'DELETE' && params) {
      return handleDeleteDndSchedule(params.id, params.scheduleId, dbUserId);
    }

    // ── Smart Routing Contacts (5.2) ─────────────────────────────────────

    // POST /contacts/import
    if (httpMethod === 'POST' && path === '/contacts/import') {
      const body: ImportContactsRequest = JSON.parse(event.body ?? '{}');
      return handleImportContacts(body, dbUserId);
    }

    // PUT /contacts/tier-actions
    if (httpMethod === 'PUT' && path === '/contacts/tier-actions') {
      const body: SetTierActionsRequest = JSON.parse(event.body ?? '{}');
      return handleSetTierActions(body, dbUserId);
    }

    // GET /contacts
    if (httpMethod === 'GET' && path === '/contacts') {
      return handleListContacts(event, dbUserId);
    }

    // PUT /contacts/:contactId
    params = matchPath(path, '/contacts/:contactId');
    if (httpMethod === 'PUT' && params) {
      const body: UpdateContactRequest = JSON.parse(event.body ?? '{}');
      return handleUpdateContact(params.contactId, body, dbUserId);
    }

    // DELETE /contacts/:contactId
    params = matchPath(path, '/contacts/:contactId');
    if (httpMethod === 'DELETE' && params) {
      return handleDeleteContact(params.contactId, dbUserId);
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json(500, { error: 'Internal server error' });
  }
}
