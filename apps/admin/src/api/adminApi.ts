// @ts-nocheck
/**
 * Admin API helper — wraps Amplify REST API for /admin/* routes.
 * The shared api-client does not expose admin-specific endpoints,
 * so we call Amplify REST directly here.
 */

import { get, post, put, del } from 'aws-amplify/api';
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

const API_NAME = 'keepnumApi';

// ─── Users ────────────────────────────────────────────────────────────────────

export interface UserDetail extends User {
  packageName?: string;
  parkedNumberCount?: number;
  voicemailCount?: number;
  smsCount?: number;
  addOns?: string[];
}

export async function listUsers(
  search?: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<User>> {
  const queryParams: Record<string, string> = { page: String(page), limit: String(limit) };
  if (search) queryParams['search'] = search;
  const { body } = await get({ apiName: API_NAME, path: '/admin/users', options: { queryParams } }).response;
  return body.json() as Promise<PaginatedResponse<User>>;
}

export async function getUser(userId: string): Promise<UserDetail> {
  const { body } = await get({ apiName: API_NAME, path: `/admin/users/${userId}` }).response;
  return body.json() as Promise<UserDetail>;
}

export async function setUserStatus(userId: string, req: SetUserStatusRequest): Promise<void> {
  await put({ apiName: API_NAME, path: `/admin/users/${userId}/status`, options: { body: req as unknown as Record<string, unknown> } }).response;
}

export async function setUserPackage(userId: string, req: SetUserPackageRequest): Promise<void> {
  await put({ apiName: API_NAME, path: `/admin/users/${userId}/package`, options: { body: req as unknown as Record<string, unknown> } }).response;
}

export async function setUserFeatureFlags(userId: string, req: SetUserFeatureFlagsRequest): Promise<void> {
  await put({ apiName: API_NAME, path: `/admin/users/${userId}/feature-flags`, options: { body: req as unknown as Record<string, unknown> } }).response;
}

export async function getUserBilling(userId: string): Promise<{ invoices: Invoice[]; subscription: Subscription | null }> {
  const { body } = await get({ apiName: API_NAME, path: `/admin/users/${userId}/billing` }).response;
  return body.json() as Promise<{ invoices: Invoice[]; subscription: Subscription | null }>;
}

// ─── Packages ─────────────────────────────────────────────────────────────────

export async function listPackages(): Promise<Package[]> {
  const { body } = await get({ apiName: API_NAME, path: '/admin/packages' }).response;
  return body.json() as Promise<Package[]>;
}

export async function createPackage(req: CreatePackageRequest): Promise<Package> {
  const { body } = await post({ apiName: API_NAME, path: '/admin/packages', options: { body: req as any } }).response;
  return body.json() as Promise<Package>;
}

export async function updatePackage(packageId: string, req: Partial<CreatePackageRequest>): Promise<Package> {
  const { body } = await put({ apiName: API_NAME, path: `/admin/packages/${packageId}`, options: { body: req as any } }).response;
  return body.json() as Promise<Package>;
}

export async function deletePackage(packageId: string): Promise<void> {
  await del({ apiName: API_NAME, path: `/admin/packages/${packageId}` }).response;
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

export async function getFeatureFlagDefaults(): Promise<FeatureFlag[]> {
  const { body } = await get({ apiName: API_NAME, path: '/admin/feature-flags/defaults' }).response;
  return body.json() as Promise<FeatureFlag[]>;
}

export async function updateFeatureFlagDefaults(flags: Record<string, FlagValue>): Promise<void> {
  await put({ apiName: API_NAME, path: '/admin/feature-flags/defaults', options: { body: flags as unknown as Record<string, unknown> } }).response;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function getAuditLog(params?: {
  userId?: string;
  from?: string;
  to?: string;
}): Promise<AdminAuditLog[]> {
  const queryParams: Record<string, string> = {};
  if (params?.userId) queryParams['userId'] = params.userId;
  if (params?.from) queryParams['from'] = params.from;
  if (params?.to) queryParams['to'] = params.to;
  const { body } = await get({ apiName: API_NAME, path: '/admin/audit-log', options: { queryParams } }).response;
  return body.json() as unknown as Promise<AdminAuditLog[]>;
}

// ─── Greetings Marketplace ────────────────────────────────────────────────────

export async function listAdminGreetings(): Promise<any[]> {
  const { body } = await get({ apiName: API_NAME, path: '/admin/greetings' }).response;
  return body.json() as Promise<any[]>;
}

export async function createAdminGreeting(req: { name: string; category: string; audioUrl: string; voiceTalent?: string }): Promise<any> {
  const { body } = await post({ apiName: API_NAME, path: '/admin/greetings', options: { body: req as any } }).response;
  return body.json() as Promise<any>;
}

export async function updateAdminGreeting(id: string, req: { name?: string; category?: string; audioUrl?: string; voiceTalent?: string }): Promise<any> {
  const { body } = await put({ apiName: API_NAME, path: `/admin/greetings/${id}`, options: { body: req as any } }).response;
  return body.json() as Promise<any>;
}

export async function deleteAdminGreeting(id: string): Promise<void> {
  await del({ apiName: API_NAME, path: `/admin/greetings/${id}` }).response;
}
