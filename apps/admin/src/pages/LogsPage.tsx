import React, { useState, useEffect, useCallback } from 'react';
import { Button, Input, Card } from '@keepnum/ui-components';
import { useAuth } from '../context/AuthContext';

interface LogEntry {
  timestamp?: string;
  level?: string;
  service?: string;
  message?: string;
  action?: string;
  userId?: string;
  error?: string;
  duration?: number;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

const SERVICES = [
  { value: '', label: 'All Services' },
  { value: 'auth', label: 'Auth' },
  { value: 'admin', label: 'Admin' },
  { value: 'number', label: 'Number' },
  { value: 'billing', label: 'Billing' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'sms', label: 'SMS' },
  { value: 'call', label: 'Call' },
  { value: 'call-screening', label: 'Call Screening' },
  { value: 'spam-filter', label: 'Spam Filter' },
  { value: 'notification', label: 'Notification' },
  { value: 'conference', label: 'Conference' },
  { value: 'virtual-number', label: 'Virtual Number' },
];

const LEVELS = [
  { value: '', label: 'All Levels' },
  { value: 'ERROR', label: 'Error' },
  { value: 'WARN', label: 'Warning' },
  { value: 'INFO', label: 'Info' },
  { value: 'DEBUG', label: 'Debug' },
];

const TIME_RANGES = [
  { value: '15m', label: 'Last 15 min' },
  { value: '1h', label: 'Last 1 hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
];

const levelColors: Record<string, string> = {
  ERROR: '#ef4444',
  WARN: '#f59e0b',
  INFO: '#3b82f6',
  DEBUG: '#6b7280',
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: '0.875rem',
  backgroundColor: '#fff',
  minWidth: 140,
};

const LogsPage: React.FC = () => {
  const { refreshSession } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [service, setService] = useState('');
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState('1h');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [tab, setTab] = useState<'all' | 'auth'>('all');

  const apiUrl = process.env.REACT_APP_API_URL || '';

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const token = await refreshSession();
      const endpoint = tab === 'auth' ? '/admin/logs/auth' : '/admin/logs';
      const params = new URLSearchParams();
      if (service && tab === 'all') params.set('service', service);
      if (level && tab === 'all') params.set('level', level);
      if (search) params.set('search', search);
      params.set('from', timeRange);
      params.set('limit', '200');

      const res = await fetch(`${apiUrl}${endpoint}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLogs(data.items || []);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, refreshSession, service, level, search, timeRange, tab]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>Application Logs</h1>
        <Button label={loading ? 'Loading…' : 'Refresh'} variant="primary" size="sm" onClick={fetchLogs} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
        {(['all', 'auth'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#3b82f6' : '#64748b',
              fontSize: '0.9rem',
              marginBottom: -2,
            }}
          >
            {t === 'all' ? 'All Logs' : 'Auth / Sign-in Logs'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={timeRange} onChange={e => setTimeRange(e.target.value)} style={selectStyle}>
            {TIME_RANGES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {tab === 'all' && (
            <>
              <select value={service} onChange={e => setService(e.target.value)} style={selectStyle}>
                {SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select value={level} onChange={e => setLevel(e.target.value)} style={selectStyle}>
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </>
          )}
          <Input
            type="text"
            placeholder="Search logs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </Card>

      {/* Results */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8 }}>
          {logs.length} log entries
        </div>
        {logs.length === 0 && !loading && (
          <Card><p style={{ textAlign: 'center', color: '#94a3b8', margin: '24px 0' }}>No logs found for the selected filters.</p></Card>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {logs.map((log, i) => (
            <div
              key={i}
              onClick={() => setExpanded(expanded === i ? null : i)}
              style={{
                padding: '10px 16px',
                backgroundColor: log.level === 'ERROR' ? '#fef2f2' : '#fff',
                borderRadius: 6,
                border: `1px solid ${log.level === 'ERROR' ? '#fecaca' : '#e2e8f0'}`,
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', minWidth: 160 }}>{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</span>
                <span style={{
                  color: levelColors[log.level ?? ''] ?? '#6b7280',
                  fontWeight: 600,
                  minWidth: 50,
                }}>{log.level ?? '—'}</span>
                <span style={{ color: '#7c3aed', minWidth: 100 }}>{log.service ?? '—'}</span>
                <span style={{ color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {log.message ?? JSON.stringify(log).slice(0, 200)}
                </span>
              </div>
              {expanded === i && (
                <pre style={{
                  marginTop: 8,
                  padding: 12,
                  backgroundColor: '#f8fafc',
                  borderRadius: 6,
                  overflow: 'auto',
                  maxHeight: 300,
                  fontSize: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {JSON.stringify(log, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LogsPage;
