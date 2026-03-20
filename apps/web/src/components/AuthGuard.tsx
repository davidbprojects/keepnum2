import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard that redirects unauthenticated users to /login.
 * Shows a loading indicator while the auth state is being resolved.
 */
const AuthGuard: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default AuthGuard;
