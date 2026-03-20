import React, { useEffect, useState } from 'react';
import { Button, Input, Card } from '@keepnum/ui-components';
import { getAuditLog } from '../api/adminApi';
import type { AdminAuditLog } from '@keepnum/shared';

const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: '0.85rem', color: '#334155' };

const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const fetchLogs = async () => {
    setLoading(true); setError('');
    try { setLogs(await getAuditLog({ userId: filterUserId || undefined, from: filterFrom || undefined, to: filterTo || undefined })); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load audit log'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, []);

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>📋 Audit Log</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>Track admin actions</p>

      <Card padding="md">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Input placeholder="User ID" value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)} />
          <Input type="date" placeholder="From" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          <Input type="date" placeholder="To" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          <Button label="Filter" variant="primary" size="sm" onClick={fetchLogs} />
        </div>
      </Card>

      {error && <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626', marginTop: 12 }}>{error}</div>}
      {loading && <p style={{ color: '#64748b', marginTop: 16 }}>Loading…</p>}

      {!loading && (
        <Card padding="sm" style={{ marginTop: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={thStyle}>Timestamp</th>
                  <th style={thStyle}>Admin</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Target</th>
                  <th style={thStyle}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={tdStyle}>{new Date(log.created_at).toLocaleString()}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.75rem' }}>{log.admin_sub}</td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: '#eff6ff', color: '#2563eb' }}>{log.action}</span>
                    </td>
                    <td style={tdStyle}>{log.target_type}: {log.target_id}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.payload ? JSON.stringify(log.payload) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AuditLogPage;
