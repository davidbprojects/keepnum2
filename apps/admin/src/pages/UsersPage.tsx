import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Card } from '@keepnum/ui-components';
import { listUsers } from '../api/adminApi';
import type { User, PaginatedResponse } from '@keepnum/shared';

const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: '0.875rem', color: '#334155' };

const UsersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<User> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = async (s: string, p: number) => {
    setLoading(true); setError('');
    try { const result = await listUsers(s || undefined, p); setData(result); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(search, page); }, [page]);

  const handleSearch = () => { setPage(1); fetchUsers(search, 1); };
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>👥 Users</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>{data ? `${data.total} total` : ''}</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <Input placeholder="Search by email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button label="Search" variant="primary" size="sm" onClick={handleSearch} />
      </div>

      {error && <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626', marginBottom: 12 }}>{error}</div>}
      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}

      {data && !loading && (
        <>
          <Card padding="sm">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Created</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user, i) => (
                    <tr key={user.id} style={{ borderBottom: i < data.items.length - 1 ? '1px solid #f1f5f9' : 'none', transition: 'background-color 0.1s' }}>
                      <td style={tdStyle}><span style={{ fontWeight: 500 }}>{user.email}</span></td>
                      <td style={tdStyle}>{new Date(user.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: user.deleted_at ? '#fef2f2' : '#ecfdf5', color: user.deleted_at ? '#dc2626' : '#059669' }}>
                          {user.deleted_at ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <Link to={`/users/${user.id}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500, fontSize: '0.85rem' }}>View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center', justifyContent: 'center' }}>
            <Button label="← Previous" variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} />
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Page {page} of {totalPages}</span>
            <Button label="Next →" variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} />
          </div>
        </>
      )}
    </div>
  );
};

export default UsersPage;
