import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Card } from '@keepnum/ui-components';
import { useAuth } from '../context/AuthContext';

const LoginPage: React.FC = () => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0f172a' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔐</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 6px', color: '#f8fafc' }}>Admin Portal</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>Sign in to manage KeepNum</p>
        </div>
        <Card>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error && <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '0.85rem' }}>{error}</div>}
              <Button label={submitting ? 'Signing in…' : 'Sign In'} variant="primary" size="md" type="submit" disabled={submitting} />
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
