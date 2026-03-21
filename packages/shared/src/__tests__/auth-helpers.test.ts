/**
 * Tests for auth-helpers module
 */

const mockSignUp = jest.fn();
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockFetchAuthSession = jest.fn();
const mockGetCurrentUser = jest.fn();
const mockDeleteUser = jest.fn();

jest.mock('aws-amplify/auth', () => ({
  signUp: (...args: any[]) => mockSignUp(...args),
  signIn: (...args: any[]) => mockSignIn(...args),
  signOut: (...args: any[]) => mockSignOut(...args),
  fetchAuthSession: (...args: any[]) => mockFetchAuthSession(...args),
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
  deleteUser: (...args: any[]) => mockDeleteUser(...args),
}));

import {
  registerUser,
  loginUser,
  logoutUser,
  getAuthSession,
  getCurrentAuthUser,
  getCognitoGroups,
  isAdmin,
} from '../auth-helpers';

describe('auth-helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('should call signUp with email and password', async () => {
      mockSignUp.mockResolvedValue({});
      await registerUser('test@example.com', 'Password1!');
      expect(mockSignUp).toHaveBeenCalledWith({
        username: 'test@example.com',
        password: 'Password1!',
        options: { userAttributes: { email: 'test@example.com' } },
      });
    });
  });

  describe('loginUser', () => {
    it('should return user on successful sign-in', async () => {
      mockSignIn.mockResolvedValue({ isSignedIn: true });
      mockGetCurrentUser.mockResolvedValue({ userId: 'u1', username: 'test@example.com' });

      const user = await loginUser('test@example.com', 'Password1!');
      expect(user).toEqual({ userId: 'u1', username: 'test@example.com' });
    });

    it('should throw if sign-in did not complete', async () => {
      mockSignIn.mockResolvedValue({ isSignedIn: false });
      await expect(loginUser('test@example.com', 'wrong')).rejects.toThrow('Sign-in did not complete');
    });
  });

  describe('logoutUser', () => {
    it('should call signOut', async () => {
      mockSignOut.mockResolvedValue(undefined);
      await logoutUser();
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('getAuthSession', () => {
    it('should return tokens when authenticated', async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: {
          accessToken: { toString: () => 'access-token-123' },
          idToken: { toString: () => 'id-token-456' },
        },
      });

      const session = await getAuthSession();
      expect(session).toEqual({
        accessToken: 'access-token-123',
        idToken: 'id-token-456',
        isAuthenticated: true,
      });
    });

    it('should return empty tokens when not authenticated', async () => {
      mockFetchAuthSession.mockResolvedValue({ tokens: undefined });

      const session = await getAuthSession();
      expect(session).toEqual({
        accessToken: '',
        idToken: '',
        isAuthenticated: false,
      });
    });
  });

  describe('getCurrentAuthUser', () => {
    it('should return user when authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: 'u1', username: 'user@test.com' });
      const user = await getCurrentAuthUser();
      expect(user).toEqual({ userId: 'u1', username: 'user@test.com' });
    });

    it('should return null when not authenticated', async () => {
      mockGetCurrentUser.mockRejectedValue(new Error('Not authenticated'));
      const user = await getCurrentAuthUser();
      expect(user).toBeNull();
    });
  });

  describe('getCognitoGroups', () => {
    it('should return groups from access token payload', async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: {
          accessToken: {
            payload: { 'cognito:groups': ['admin', 'users'] },
          },
        },
      });

      const groups = await getCognitoGroups();
      expect(groups).toEqual(['admin', 'users']);
    });

    it('should return empty array when no groups', async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: {
          accessToken: { payload: {} },
        },
      });

      const groups = await getCognitoGroups();
      expect(groups).toEqual([]);
    });

    it('should return empty array when no tokens', async () => {
      mockFetchAuthSession.mockResolvedValue({ tokens: undefined });
      const groups = await getCognitoGroups();
      expect(groups).toEqual([]);
    });
  });

  describe('isAdmin', () => {
    it('should return true when user is in admin group', async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: {
          accessToken: {
            payload: { 'cognito:groups': ['admin'] },
          },
        },
      });

      expect(await isAdmin()).toBe(true);
    });

    it('should return false when user is not in admin group', async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: {
          accessToken: {
            payload: { 'cognito:groups': ['users'] },
          },
        },
      });

      expect(await isAdmin()).toBe(false);
    });
  });
});
