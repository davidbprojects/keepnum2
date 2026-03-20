import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AdminGuard from './components/AdminGuard';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import PackagesPage from './pages/PackagesPage';
import FeatureFlagsPage from './pages/FeatureFlagsPage';
import AuditLogPage from './pages/AuditLogPage';
import GreetingsPage from './pages/GreetingsPage';

const App: React.FC = () => (
  <AuthProvider>
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Admin-protected routes */}
      <Route element={<AdminGuard />}>
        <Route element={<Layout />}>
          <Route path="/" element={<UsersPage />} />
          <Route path="/users/:userId" element={<UserDetailPage />} />
          <Route path="/packages" element={<PackagesPage />} />
          <Route path="/feature-flags" element={<FeatureFlagsPage />} />
          <Route path="/greetings" element={<GreetingsPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
        </Route>
      </Route>
    </Routes>
  </AuthProvider>
);

export default App;
