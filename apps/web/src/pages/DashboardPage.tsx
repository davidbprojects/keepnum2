import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@keepnum/ui-components';
import { listNumbers } from '@keepnum/shared';
import type { ParkedNumber } from '@keepnum/shared';

const DashboardPage: React.FC = () => {
  const [numbers, setNumbers] = useState<ParkedNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listNumbers()
      .then(setNumbers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load numbers'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><p style={{ color: '#64748b', fontSize: '0.9375rem' }}>Loading your numbers…</p></div>;
  if (error) return <p style={{ color: '#dc2626', padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: 8 }}>{error}</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Parked Numbers</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.875rem' }}>{numbers.length} number{numbers.length !== 1 ? 's' : ''} active</p>
        </div>
        <Link to="/numbers/search">
          <Button label="+ Add Number" size="sm" />
        </Link>
      </div>
      {numbers.length === 0 ? (
        <Card padding="lg">
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: 12 }}>📱</span>
            <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>No parked numbers yet. Add one to get started.</p>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {numbers.map((num) => (
            <Link key={num.id} to={`/numbers/${num.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card padding="md">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      backgroundColor: num.status === 'active' ? '#ecfdf5' : '#f3f4f6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.125rem',
                    }}>
                      {num.status === 'active' ? '✅' : '⏸️'}
                    </div>
                    <div>
                      <strong style={{ fontSize: '1.0625rem', letterSpacing: '-0.01em' }}>{num.phone_number}</strong>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 600,
                          color: num.status === 'active' ? '#059669' : '#6b7280',
                          backgroundColor: num.status === 'active' ? '#ecfdf5' : '#f3f4f6',
                          padding: '1px 8px', borderRadius: 99,
                        }}>
                          {num.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 500 }}>
                    {num.retention_policy}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
