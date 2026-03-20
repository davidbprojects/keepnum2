import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard that requires the user to be authenticated AND
 * belong to the Cognito "admin" group. Redirects to /login otherwise.
 */
const AdminGuard: React.FC = () => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>You must be an administrator to access this application.</p>
      </div>
    );
  }

  return <Outlet />;
};

export default AdminGuard;
