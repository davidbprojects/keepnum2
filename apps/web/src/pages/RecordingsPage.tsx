import React, { useEffect, useState } from 'react';
import { listRecordings, getRecordingDownloadUrl } from '@keepnum/shared';

const RecordingsPage: React.FC = () => {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { const d = await listRecordings() as any; setRecordings(d?.recordings ?? []); } catch {} setLoading(false); }
  async function handleDownload(callId: string) { try { const d = await getRecordingDownloadUrl(callId) as any; if (d?.url) window.open(d.url, '_blank'); } catch {} }

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Call Recordings</h1>
      {loading ? <p>Loading...</p> : recordings.length === 0 ? <p style={{ color: '#94a3b8' }}>No recordings</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {recordings.map((r: any) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: '0.75rem', background: '#fff', border: '1px solid #e2e8f0' }}>
              <div><div style={{ fontWeight: 500 }}>{r.caller_id ?? 'Unknown'}</div><div style={{ fontSize: '0.875rem', color: '#64748b' }}>{r.duration_seconds}s • {r.direction} • {new Date(r.recorded_at).toLocaleDateString()}</div></div>
              <button onClick={() => handleDownload(r.call_id)} style={{ padding: '0.25rem 1rem', borderRadius: '0.5rem', border: '1px solid #6366f1', background: 'transparent', color: '#6366f1', cursor: 'pointer' }}>Download</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default RecordingsPage;
