import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getCurrentAuthUser,
  loginUser,
  logoutUser,
  getAuthSession,
  getCognitoGroups,
} from '@keepnum/shared';
import type { AuthUser } from '@keepnum/shared';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const authedUser = await getCurrentAuthUser();
        setUser(authedUser);
        if (authedUser) {
          const groups = await getCognitoGroups();
          setIsAdmin(groups.includes('admin'));
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const authedUser = await loginUser(email, password);
    setUser(authedUser);
    const groups = await getCognitoGroups();
    setIsAdmin(groups.includes('admin'));
  }, []);

  const signOut = useCallback(async () => {
    await logoutUser();
    setUser(null);
    setIsAdmin(false);
  }, []);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    try {
      const session = await getAuthSession();
      return session.accessToken || null;
    } catch {
      setUser(null);
      setIsAdmin(false);
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, signIn, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
