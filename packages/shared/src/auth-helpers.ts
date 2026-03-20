/**
 * Auth helpers wrapping Amplify Libraries Auth category.
 * Used by web, iOS, and Android clients for Cognito authentication flows.
 */

import {
  signUp,
  signIn,
  signOut,
  fetchAuthSession,
  getCurrentUser,
  deleteUser,
} from 'aws-amplify/auth';

export interface AuthUser {
  userId: string;
  username: string;
}

export interface AuthSession {
  accessToken: string;
  idToken: string;
  isAuthenticated: boolean;
}

/**
 * Register a new user with Cognito.
 */
export async function registerUser(email: string, password: string): Promise<void> {
  await signUp({
    username: email,
    password,
    options: {
      userAttributes: { email },
    },
  });
}

/**
 * Sign in with email and password.
 * Returns the authenticated user on success.
 */
export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const result = await signIn({ username: email, password });
  if (result.isSignedIn) {
    const user = await getCurrentUser();
    return { userId: user.userId, username: user.username };
  }
  throw new Error('Sign-in did not complete');
}

/**
 * Sign out the current user.
 */
export async function logoutUser(): Promise<void> {
  await signOut();
}

/**
 * Get the current auth session including tokens.
 * Amplify automatically refreshes the access token if expired.
 */
export async function getAuthSession(): Promise<AuthSession> {
  const session = await fetchAuthSession();
  const accessToken = session.tokens?.accessToken?.toString() ?? '';
  const idToken = session.tokens?.idToken?.toString() ?? '';
  return {
    accessToken,
    idToken,
    isAuthenticated: !!accessToken,
  };
}

/**
 * Get the current authenticated user.
 * Returns null if not authenticated.
 */
export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  try {
    const user = await getCurrentUser();
    return { userId: user.userId, username: user.username };
  } catch {
    return null;
  }
}

/**
 * Delete the current user's Cognito account.
 * Should be called after the backend has cleaned up user data.
 */
export async function deleteCurrentUser(): Promise<void> {
  await deleteUser();
}

/**
 * Extract the Cognito groups from the current session's access token.
 * Returns an empty array if not authenticated or no groups assigned.
 */
export async function getCognitoGroups(): Promise<string[]> {
  const session = await fetchAuthSession();
  const payload = session.tokens?.accessToken?.payload;
  if (!payload) return [];
  const groups = payload['cognito:groups'];
  if (Array.isArray(groups)) return groups as string[];
  return [];
}

/**
 * Check whether the current user belongs to the Cognito "admin" group.
 */
export async function isAdmin(): Promise<boolean> {
  const groups = await getCognitoGroups();
  return groups.includes('admin');
}
