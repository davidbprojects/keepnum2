import React, { useEffect, useState } from 'react';
import { Button, Input, Card } from '@keepnum/ui-components';
import { getFeatureFlagDefaults, updateFeatureFlagDefaults } from '../api/adminApi';
import type { FeatureFlag, FlagValue } from '@keepnum/shared';

const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: '0.85rem', color: '#334155' };

const FeatureFlagsPage: React.FC = () => {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const result = await getFeatureFlagDefaults();
      setFlags(result);
      const vals: Record<string, string> = {};
      result.forEach((f) => { vals[f.flag_name] = String(f.value); });
      setEditValues(vals);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load flags'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchFlags(); }, []);

  const handleSave = async () => {
    const updates: Record<string, FlagValue> = {};
    Object.entries(editValues).forEach(([name, val]) => {
      if (val === 'true') updates[name] = true;
      else if (val === 'false') updates[name] = false;
      else updates[name] = Number(val) || 0;
    });
    try { await updateFeatureFlagDefaults(updates); await fetchFlags(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to update flags'); }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>🚩 Feature Flags</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>System-wide default values</p>

      {error && <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626', marginBottom: 12 }}>{error}</div>}
      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}

      {!loading && (
        <Card padding="sm">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={thStyle}>Flag Name</th>
                  <th style={thStyle}>Current Value</th>
                  <th style={thStyle}>New Value</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag, i) => (
                  <tr key={flag.flag_name} style={{ borderBottom: i < flags.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={tdStyle}><span style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8rem' }}>{flag.flag_name}</span></td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: '#f1f5f9', color: '#64748b' }}>{String(flag.value)}</span>
                    </td>
                    <td style={tdStyle}>
                      <Input value={editValues[flag.flag_name] ?? ''} onChange={(e) => setEditValues((prev) => ({ ...prev, [flag.flag_name]: e.target.value }))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, padding: '0 14px 14px' }}>
            <Button label="Save All" variant="primary" size="md" onClick={handleSave} />
          </div>
        </Card>
      )}
    </div>
  );
};

export default FeatureFlagsPage;
