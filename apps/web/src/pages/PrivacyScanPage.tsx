import React, { useEffect, useState } from 'react';
import { startPrivacyScan, listPrivacyScans, getPrivacyScanResults } from '@keepnum/shared';

const severityColors: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };

const PrivacyScanPage: React.FC = () => {
  const [scans, setScans] = useState<any[]>([]);
  const [selectedScan, setSelectedScan] = useState<any>(null);
  const [phone, setPhone] = useState('');
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { const d = await listPrivacyScans() as any; setScans(d?.scans ?? []); } catch {} setLoading(false); }
  async function handleScan() { setScanning(true); try { await startPrivacyScan({ phone_number: phone }); load(); } catch {} setScanning(false); }
  async function viewResults(scanId: string) { try { const d = await getPrivacyScanResults(scanId) as any; setSelectedScan(d); } catch {} }

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Privacy Scan</h1>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input placeholder="Phone number to scan" value={phone} onChange={e => setPhone(e.target.value)} style={{ flex: 1, padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }} />
        <button onClick={handleScan} disabled={scanning} style={{ padding: '0.5rem 1.5rem', borderRadius: '9999px', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>{scanning ? 'Scanning...' : 'Start Scan'}</button>
      </div>
      {selectedScan && (
        <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Scan Results — {selectedScan.findings?.length ?? 0} findings</h2>
          {(selectedScan.findings ?? []).map((f: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <div><div style={{ fontWeight: 500 }}>{f.source_name}</div><div style={{ fontSize: '0.875rem', color: '#64748b' }}>{f.listing_url}</div></div>
              <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', background: severityColors[f.severity] ?? '#94a3b8', color: '#fff', fontSize: '0.75rem', height: 'fit-content' }}>{f.severity}</span>
            </div>
          ))}
          <button onClick={() => setSelectedScan(null)} style={{ marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer' }}>Close</button>
        </div>
      )}
      {loading ? <p>Loading...</p> : scans.map((s: any) => (
        <div key={s.id} onClick={() => viewResults(s.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderRadius: '0.75rem', background: '#fff', border: '1px solid #e2e8f0', marginBottom: '0.5rem', cursor: 'pointer' }}>
          <div><div style={{ fontWeight: 500 }}>{s.phone_number}</div><div style={{ fontSize: '0.875rem', color: '#64748b' }}>{s.findings_count} findings • {s.sources_scanned}/{s.sources_total} sources</div></div>
          <span style={{ padding: '0.125rem 0.75rem', borderRadius: '9999px', background: s.status === 'completed' ? '#dcfce7' : '#fef3c7', color: s.status === 'completed' ? '#16a34a' : '#d97706', fontSize: '0.75rem' }}>{s.status}</span>
        </div>
      ))}
    </div>
  );
};
export default PrivacyScanPage;
