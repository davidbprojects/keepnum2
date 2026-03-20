import React, { useEffect, useState } from 'react';
import { Card, Button } from '@keepnum/ui-components';
import { getSpamLog } from '@keepnum/shared';
import type { SpamLogItem } from '@keepnum/shared';

const SpamLogPage: React.FC = () => {
  const [logs, setLogs] = useState<SpamLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getSpamLog()
      .then(setLogs)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load spam log'))
      .finally(() => setLoading(false));
  }, []);

  const handleMarkFalsePositive = async (item: SpamLogItem) => {
    setLogs((prev) => prev.map((l) => (l.sk === item.sk ? { ...l, falsePositive: true } : l)));
  };

  if (loading) return <p style={{ color: '#64748b', padding: 24 }}>Loading spam log…</p>;
  if (error) return <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626' }}>{error}</div>;

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
        🛡️ Spam Log
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>
        {logs.length} blocked item{logs.length !== 1 ? 's' : ''}
      </p>

      {logs.length === 0 ? (
        <Card padding="lg">
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
            <p style={{ color: '#94a3b8', margin: 0 }}>No spam detected. Your inbox is clean.</p>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {logs.map((log) => (
            <Card key={log.sk} padding="sm">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: log.falsePositive ? '#ecfdf5' : '#fef2f2', display: 'grid', placeItems: 'center', fontSize: '1rem', flexShrink: 0 }}>
                    {log.falsePositive ? '✅' : '🚫'}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{log.callerId}</span>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                      <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: '#f1f5f9', color: '#64748b' }}>{log.itemType}</span>
                      {log.falsePositive && (
                        <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: '#ecfdf5', color: '#059669' }}>False Positive</span>
                      )}
                    </div>
                  </div>
                </div>
                {!log.falsePositive && (
                  <Button label="Not Spam" variant="ghost" size="sm" onClick={() => handleMarkFalsePositive(log)} />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SpamLogPage;
