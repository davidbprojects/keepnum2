import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input, Card } from '@keepnum/ui-components';
import { useAuth } from '../context/AuthContext';

const LoginPage: React.FC = () => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span style={{ fontSize: '2.5rem' }}>📱</span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginTop: 8, letterSpacing: '-0.02em' }}>Welcome back</h1>
          <p style={{ color: '#64748b', fontSize: '0.9375rem', marginTop: 4 }}>Sign in to your KeepNum account</p>
        </div>
        <Card padding="lg">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input
                label="Email"
                type="email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                testID="login-email"
                autoComplete="email"
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                testID="login-password"
                autoComplete="current-password"
              />
              {error && <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0, padding: '8px 12px', backgroundColor: '#fef2f2', borderRadius: 8 }}>{error}</p>}
              <Button label="Sign In" loading={loading} testID="login-submit" onClick={() => handleSubmit(new Event('submit') as unknown as React.FormEvent)} />
            </div>
          </form>
          <p style={{ marginTop: 20, fontSize: '0.875rem', textAlign: 'center', color: '#64748b' }}>
            Don't have an account? <Link to="/register" style={{ fontWeight: 600 }}>Register</Link>
          </p>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
