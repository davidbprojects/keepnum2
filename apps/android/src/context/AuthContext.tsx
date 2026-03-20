import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getCurrentAuthUser,
  loginUser,
  logoutUser,
  registerUser,
  getAuthSession,
} from '@keepnum/shared';
import type { AuthUser } from '@keepnum/shared';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentAuthUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const authedUser = await loginUser(email, password);
    setUser(authedUser);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await registerUser(email, password);
  }, []);

  const signOut = useCallback(async () => {
    await logoutUser();
    setUser(null);
  }, []);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    try {
      const session = await getAuthSession();
      return session.accessToken || null;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
