/**
 * Admin API helper — uses fetch directly with Cognito JWT.
 * Bypasses Amplify REST API to avoid "API name is invalid" config issues.
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import type {
  SetUserStatusRequest,
  SetUserPackageRequest,
  SetUserFeatureFlagsRequest,
  CreatePackageRequest,
  PaginatedResponse,
} from '@keepnum/shared';
import type {
  User,
  Package,
  FeatureFlag,
  AdminAuditLog,
  Invoice,
  Subscription,
  FlagValue,
} from '@keepnum/shared';

function getApiUrl(): string {
  return (
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_GATEWAY_URL ||
    ''
  );
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

async function apiGet<T>(path: string, queryParams?: Record<string, string>): Promise<T> {
  const base = getApiUrl();
  const url = new URL(`${base}${path}`);
  if (queryParams) Object.entries(queryParams).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const base = getApiUrl();
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: await getAuthHeaders(), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const base = getApiUrl();
  const res = await fetch(`${base}${path}`, { method: 'PUT', headers: await getAuthHeaders(), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDel(path: string): Promise<void> {
  const base = getApiUrl();
  const res = await fetch(`${base}${path}`, { method: 'DELETE', headers: await getAuthHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export interface UserDetail extends User {
  packageName?: string;
  parkedNumberCount?: number;
  voicemailCount?: number;
  smsCount?: number;
  addOns?: string[];
}

export async function listUsers(search?: string, page = 1, limit = 20): Promise<PaginatedResponse<User>> {
  const qp: Record<string, string> = { page: String(page), limit: String(limit) };
  if (search) qp['search'] = search;
  return apiGet('/admin/users', qp);
}

export async function getUser(userId: string): Promise<UserDetail> {
  return apiGet(`/admin/users/${userId}`);
}

export async function setUserStatus(userId: string, req: SetUserStatusRequest): Promise<void> {
  await apiPut(`/admin/users/${userId}/status`, req);
}

export async function setUserPackage(userId: string, req: SetUserPackageRequest): Promise<void> {
  await apiPut(`/admin/users/${userId}/package`, req);
}

export async function setUserFeatureFlags(userId: string, req: SetUserFeatureFlagsRequest): Promise<void> {
  await apiPut(`/admin/users/${userId}/feature-flags`, req);
}

export async function getUserBilling(userId: string): Promise<{ invoices: Invoice[]; subscription: Subscription | null }> {
  return apiGet(`/admin/users/${userId}/billing`);
}

// ─── Packages ─────────────────────────────────────────────────────────────────

export async function listPackages(): Promise<Package[]> {
  return apiGet('/admin/packages');
}

export async function createPackage(req: CreatePackageRequest): Promise<Package> {
  return apiPost('/admin/packages', req);
}

export async function updatePackage(packageId: string, req: Partial<CreatePackageRequest>): Promise<Package> {
  return apiPut(`/admin/packages/${packageId}`, req);
}

export async function deletePackage(packageId: string): Promise<void> {
  await apiDel(`/admin/packages/${packageId}`);
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

export async function getFeatureFlagDefaults(): Promise<FeatureFlag[]> {
  return apiGet('/admin/feature-flags/defaults');
}

export async function updateFeatureFlagDefaults(flags: Record<string, FlagValue>): Promise<void> {
  await apiPut('/admin/feature-flags/defaults', flags);
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function getAuditLog(params?: { userId?: string; from?: string; to?: string }): Promise<AdminAuditLog[]> {
  const qp: Record<string, string> = {};
  if (params?.userId) qp['userId'] = params.userId;
  if (params?.from) qp['from'] = params.from;
  if (params?.to) qp['to'] = params.to;
  return apiGet('/admin/audit-log', qp);
}

// ─── Greetings Marketplace ────────────────────────────────────────────────────

export async function listAdminGreetings(): Promise<any[]> {
  return apiGet('/admin/greetings');
}

export async function createAdminGreeting(req: { name: string; category: string; audioUrl: string; voiceTalent?: string }): Promise<any> {
  return apiPost('/admin/greetings', req);
}

export async function updateAdminGreeting(id: string, req: { name?: string; category?: string; audioUrl?: string; voiceTalent?: string }): Promise<any> {
  return apiPut(`/admin/greetings/${id}`, req);
}

export async function deleteAdminGreeting(id: string): Promise<void> {
  await apiDel(`/admin/greetings/${id}`);
}
