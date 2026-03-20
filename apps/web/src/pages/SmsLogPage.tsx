import React, { useEffect, useState } from 'react';
import { Card, Button, Input } from '@keepnum/ui-components';
import { getSmsLogs, getSmsDownloadUrl } from '@keepnum/shared';
import type { SmsLogItem } from '@keepnum/shared';

const SmsLogPage: React.FC = () => {
  const [logs, setLogs] = useState<SmsLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [senderFilter, setSenderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const items = await getSmsLogs({ sender: senderFilter || undefined, status: statusFilter || undefined });
      setLogs(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SMS logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleDownload = async (numberId: string) => {
    const { url } = await getSmsDownloadUrl(numberId);
    window.open(url, '_blank');
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
        💬 SMS Log
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>
        {logs.length} message{logs.length !== 1 ? 's' : ''}
      </p>

      <Card padding="md">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Input label="Sender" value={senderFilter} onChangeText={setSenderFilter} placeholder="Filter by sender" testID="sms-sender-filter" />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Input label="Status" value={statusFilter} onChangeText={setStatusFilter} placeholder="delivered, failed…" testID="sms-status-filter" />
          </div>
          <Button label="Filter" size="sm" onClick={fetchLogs} />
        </div>
      </Card>

      {loading && <p style={{ color: '#64748b', marginTop: 16 }}>Loading…</p>}
      {error && <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626', marginTop: 12 }}>{error}</div>}
      {!loading && logs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
          <p style={{ color: '#94a3b8', margin: 0 }}>No SMS logs found.</p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {logs.map((log) => (
          <Card key={log.sk} padding="sm">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: '#eff6ff', display: 'grid', placeItems: 'center', fontSize: '1rem', flexShrink: 0 }}>
                  💬
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{log.sender}</span>
                  <span style={{ color: '#94a3b8', margin: '0 6px' }}>→</span>
                  <span style={{ color: '#64748b' }}>{log.recipient}</span>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: log.status === 'delivered' ? '#ecfdf5' : '#fef3c7', color: log.status === 'delivered' ? '#059669' : '#d97706' }}>{log.status}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{log.direction}</span>
                  </div>
                </div>
              </div>
              <Button label="Export" variant="ghost" size="sm" onClick={() => handleDownload(log.pk.split('#')[1])} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SmsLogPage;
