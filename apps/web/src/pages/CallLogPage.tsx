import React, { useEffect, useState } from 'react';
import { Card, Button, Input } from '@keepnum/ui-components';
import { getCallLogs } from '@keepnum/shared';
import type { CallLogItem } from '@keepnum/shared';

const CallLogPage: React.FC = () => {
  const [logs, setLogs] = useState<CallLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [callerFilter, setCallerFilter] = useState('');
  const [dispositionFilter, setDispositionFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const items = await getCallLogs({ callerId: callerFilter || undefined, disposition: dispositionFilter || undefined });
      setLogs(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
        📞 Call Log
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>
        {logs.length} record{logs.length !== 1 ? 's' : ''}
      </p>

      <Card padding="md">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Input label="Caller ID" value={callerFilter} onChangeText={setCallerFilter} placeholder="Filter by caller" testID="call-caller-filter" />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Input label="Disposition" value={dispositionFilter} onChangeText={setDispositionFilter} placeholder="answered, voicemail…" testID="call-disp-filter" />
          </div>
          <Button label="Filter" size="sm" onClick={fetchLogs} />
        </div>
      </Card>

      {loading && <p style={{ color: '#64748b', marginTop: 16 }}>Loading…</p>}
      {error && <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626', marginTop: 12 }}>{error}</div>}
      {!loading && logs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
          <p style={{ color: '#94a3b8', margin: 0 }}>No call logs found.</p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {logs.map((log) => (
          <Card key={log.sk} padding="sm">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: log.direction === 'inbound' ? '#eff6ff' : '#f0fdf4', display: 'grid', placeItems: 'center', fontSize: '1rem', flexShrink: 0 }}>
                  {log.direction === 'inbound' ? '📥' : '📤'}
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{log.callerId}</span>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: log.disposition === 'answered' ? '#ecfdf5' : '#fef3c7', color: log.disposition === 'answered' ? '#059669' : '#d97706' }}>{log.disposition}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{log.duration}s</span>
                  </div>
                </div>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{log.sk.split('#')[0]}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default CallLogPage;
