import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button } from '@keepnum/ui-components';
import { listVoicemails, getVoicemailDownloadUrl } from '@keepnum/shared';
import type { Voicemail } from '@keepnum/shared';

const VoicemailsPage: React.FC = () => {
  const [voicemails, setVoicemails] = useState<Voicemail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listVoicemails()
      .then(setVoicemails)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load voicemails'))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (id: string) => {
    const { url } = await getVoicemailDownloadUrl(id);
    window.open(url, '_blank');
  };

  if (loading) return <p style={{ color: '#64748b', padding: 24 }}>Loading voicemails…</p>;
  if (error) return (
    <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626' }}>{error}</div>
  );

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
        🎙️ Voicemails
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>
        {voicemails.length} voicemail{voicemails.length !== 1 ? 's' : ''}
      </p>
      {voicemails.length === 0 ? (
        <Card padding="lg">
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
            <p style={{ color: '#94a3b8', margin: 0 }}>No voicemails yet.</p>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {voicemails.map((vm) => (
            <Card key={vm.id} padding="md">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#eff6ff', display: 'grid', placeItems: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                    🎙️
                  </div>
                  <div>
                    <Link to={`/voicemails/${vm.id}`} style={{ fontWeight: 600, color: '#0f172a', textDecoration: 'none' }}>
                      {vm.caller_id ?? 'Unknown Caller'}
                    </Link>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>
                      {vm.duration_seconds ? `${vm.duration_seconds}s` : ''} · <span style={{
                        display: 'inline-block',
                        padding: '1px 8px',
                        borderRadius: 99,
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        backgroundColor: vm.transcription_status === 'complete' ? '#ecfdf5' : '#fef3c7',
                        color: vm.transcription_status === 'complete' ? '#059669' : '#d97706',
                      }}>{vm.transcription_status}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(vm.received_at).toLocaleString()}</span>
                  <Button label="Download" variant="ghost" size="sm" onClick={() => handleDownload(vm.id)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default VoicemailsPage;
