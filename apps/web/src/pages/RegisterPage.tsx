import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input, Card } from '@keepnum/ui-components';
import { useAuth } from '../context/AuthContext';

const RegisterPage: React.FC = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password);
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span style={{ fontSize: '2.5rem' }}>📱</span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginTop: 8, letterSpacing: '-0.02em' }}>Create your account</h1>
          <p style={{ color: '#64748b', fontSize: '0.9375rem', marginTop: 4 }}>Get started with KeepNum in seconds</p>
        </div>
        <Card padding="lg">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input label="Email" type="email" value={email} onChangeText={setEmail} placeholder="you@example.com" testID="register-email" autoComplete="email" />
              <Input label="Password" type="password" value={password} onChangeText={setPassword} placeholder="••••••••" testID="register-password" autoComplete="new-password" />
              <Input label="Confirm Password" type="password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" testID="register-confirm" autoComplete="new-password" />
              {error && <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0, padding: '8px 12px', backgroundColor: '#fef2f2', borderRadius: 8 }}>{error}</p>}
              <Button label="Create Account" loading={loading} testID="register-submit" onClick={() => handleSubmit(new Event('submit') as unknown as React.FormEvent)} />
            </div>
          </form>
          <p style={{ marginTop: 20, fontSize: '0.875rem', textAlign: 'center', color: '#64748b' }}>
            Already have an account? <Link to="/login" style={{ fontWeight: 600 }}>Sign In</Link>
          </p>
        </Card>
      </div>
    </div>
  );
};

export default RegisterPage;
