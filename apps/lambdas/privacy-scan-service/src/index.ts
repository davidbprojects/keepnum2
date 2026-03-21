import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { assertFlag } from '@keepnum/shared';
import type { ScanStatus, FindingSeverity } from '@keepnum/shared';
import { logger, initLogger } from '@keepnum/shared';

const pool = new Pool({
  host: process.env.DB_HOST, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
const SCAN_TIMEOUT_MS = 30000;

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function getUserId(event: APIGatewayProxyEvent): string | undefined {
  return event.requestContext.authorizer?.claims?.sub as string | undefined;
}
async function getDbUserId(cognitoSub: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE cognito_id = $1 AND deleted_at IS NULL LIMIT 1`, [cognitoSub]);
  return rows[0]?.id ?? null;
}
function matchPath(path: string, pattern: string): Record<string, string> | null {
  const pp = path.split('/').filter(Boolean), pt = pattern.split('/').filter(Boolean);
  if (pp.length !== pt.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pt.length; i++) {
    if (pt[i].startsWith(':')) params[pt[i].slice(1)] = pp[i];
    else if (pt[i] !== pp[i]) return null;
  }
  return params;
}

interface BrokerSource { id: string; name: string; url: string; check_url: string; }
interface ScanFinding { source_id: string; source_name: string; url: string; data_types: string[]; severity: FindingSeverity; opt_out_url: string | null; }

async function scanBroker(source: BrokerSource, phoneNumber: string): Promise<ScanFinding | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
    const res = await fetch(source.check_url.replace('{phone}', encodeURIComponent(phoneNumber)), {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data.found) return null;
    return {
      source_id: source.id, source_name: source.name, url: data.listing_url ?? source.url,
      data_types: data.data_types ?? [], severity: data.severity ?? 'medium',
      opt_out_url: data.opt_out_url ?? null,
    };
  } catch {
    return null; // Unreachable source — scan_incomplete, don't block
  }
}

async function handleStartScan(event: APIGatewayProxyEvent, dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'privacy_scan', pool);
  if (flagBlock) return flagBlock;
  const body = JSON.parse(event.body ?? '{}');
  const { phone_number } = body;
  if (!phone_number) return json(400, { error: 'phone_number is required' });

  // Get data broker sources
  const { rows: sources } = await pool.query<BrokerSource>(`SELECT * FROM data_broker_sources WHERE active = true`);

  // Create scan record
  const { rows: scans } = await pool.query(
    `INSERT INTO privacy_scans (user_id, phone_number, status, sources_total, sources_scanned)
     VALUES ($1, $2, 'in_progress', $3, 0) RETURNING *`,
    [dbUserId, phone_number, sources.length]);
  const scanId = scans[0].id;

  // Scan all sources in parallel
  const results = await Promise.allSettled(sources.map((s) => scanBroker(s, phone_number)));
  let scannedCount = 0;
  const findings: ScanFinding[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      scannedCount++;
      if (r.value) findings.push(r.value);
    }
  }

  // Store findings
  for (const f of findings) {
    await pool.query(
      `INSERT INTO privacy_scan_findings (scan_id, source_id, source_name, listing_url, data_types, severity, opt_out_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [scanId, f.source_id, f.source_name, f.url, JSON.stringify(f.data_types), f.severity, f.opt_out_url]);
  }

  const status: ScanStatus = scannedCount < sources.length ? 'partial' : 'complete';
  await pool.query(
    `UPDATE privacy_scans SET status = $1, sources_scanned = $2, findings_count = $3, completed_at = now() WHERE id = $4`,
    [status, scannedCount, findings.length, scanId]);

  return json(200, { scan_id: scanId, status, findings_count: findings.length, sources_scanned: scannedCount, sources_total: sources.length });
}

async function handleListScans(dbUserId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'privacy_scan', pool);
  if (flagBlock) return flagBlock;
  const { rows } = await pool.query(`SELECT * FROM privacy_scans WHERE user_id = $1 ORDER BY created_at DESC`, [dbUserId]);
  return json(200, { scans: rows });
}

async function handleGetScanResults(dbUserId: string, scanId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'privacy_scan', pool);
  if (flagBlock) return flagBlock;
  const { rows: scans } = await pool.query(`SELECT * FROM privacy_scans WHERE id = $1 AND user_id = $2`, [scanId, dbUserId]);
  if (!scans[0]) return json(404, { error: 'Scan not found' });
  const { rows: findings } = await pool.query(`SELECT * FROM privacy_scan_findings WHERE scan_id = $1`, [scanId]);
  return json(200, { ...scans[0], findings });
}

async function handleCompareScans(dbUserId: string, scanId: string): Promise<APIGatewayProxyResult> {
  const flagBlock = await assertFlag(dbUserId, 'privacy_scan', pool);
  if (flagBlock) return flagBlock;

  // Get current scan findings
  const { rows: currentFindings } = await pool.query(
    `SELECT * FROM privacy_scan_findings WHERE scan_id = $1`, [scanId]);

  // Get previous scan
  const { rows: prevScans } = await pool.query(
    `SELECT id FROM privacy_scans WHERE user_id = $1 AND id != $2 ORDER BY created_at DESC LIMIT 1`, [dbUserId, scanId]);

  if (!prevScans[0]) return json(200, { new: currentFindings, resolved: [], unchanged: [] });

  const { rows: prevFindings } = await pool.query(
    `SELECT * FROM privacy_scan_findings WHERE scan_id = $1`, [prevScans[0].id]);

  const prevSourceIds = new Set(prevFindings.map((f: { source_id: string }) => f.source_id));
  const currSourceIds = new Set(currentFindings.map((f: { source_id: string }) => f.source_id));

  const newFindings = currentFindings.filter((f: { source_id: string }) => !prevSourceIds.has(f.source_id));
  const resolved = prevFindings.filter((f: { source_id: string }) => !currSourceIds.has(f.source_id));
  const unchanged = currentFindings.filter((f: { source_id: string }) => prevSourceIds.has(f.source_id));

  return json(200, { new: newFindings, resolved, unchanged });
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;
  try {
    const cognitoSub = getUserId(event);
    if (!cognitoSub) return json(401, { error: 'Unauthorized' });
    const dbUserId = await getDbUserId(cognitoSub);
    if (!dbUserId) return json(401, { error: 'Unauthorized' });

    if (httpMethod === 'POST' && path === '/privacy-scans') return handleStartScan(event, dbUserId);
    if (httpMethod === 'GET' && path === '/privacy-scans') return handleListScans(dbUserId);

    let params = matchPath(path, '/privacy-scans/:scanId');
    if (params && httpMethod === 'GET') return handleGetScanResults(dbUserId, params.scanId);

    params = matchPath(path, '/privacy-scans/:scanId/compare');
    if (params && httpMethod === 'GET') return handleCompareScans(dbUserId, params.scanId);

    return json(404, { error: 'Not found' });
  } catch (err) {
    logger.error('Unhandled error', err);
    return json(500, { error: 'Internal server error' });
  }
}
