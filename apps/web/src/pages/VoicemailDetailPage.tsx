import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Button } from '@keepnum/ui-components';
import { getVoicemail, getVoicemailDownloadUrl } from '@keepnum/shared';
import type { Voicemail } from '@keepnum/shared';

const VoicemailDetailPage: React.FC = () => {
  const { voicemailId } = useParams<{ voicemailId: string }>();
  const [voicemail, setVoicemail] = useState<Voicemail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!voicemailId) return;
    getVoicemail(voicemailId)
      .then(setVoicemail)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load voicemail'))
      .finally(() => setLoading(false));
  }, [voicemailId]);

  const handleDownload = async () => {
    if (!voicemailId) return;
    const { url } = await getVoicemailDownloadUrl(voicemailId);
    window.open(url, '_blank');
  };

  if (loading) return <p style={{ color: '#64748b', padding: 24 }}>Loading…</p>;
  if (error) return <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626' }}>{error}</div>;
  if (!voicemail) return <p style={{ color: '#64748b' }}>Voicemail not found.</p>;

  const infoRow = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: '0.9rem', color: '#0f172a' }}>{value}</span>
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
        🎙️ Voicemail Detail
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>
        From {voicemail.caller_id ?? 'Unknown'}
      </p>
      <Card padding="lg">
        {infoRow('Caller', voicemail.caller_id ?? 'Unknown')}
        {infoRow('Duration', `${voicemail.duration_seconds ?? 0}s`)}
        {infoRow('Received', new Date(voicemail.received_at).toLocaleString())}
        {infoRow('Transcription Status', voicemail.transcription_status)}
        {voicemail.transcription && (
          <div style={{ marginTop: 20, padding: 16, backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <p style={{ fontWeight: 600, fontSize: '0.85rem', color: '#64748b', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transcription</p>
            <p style={{ margin: 0, lineHeight: 1.7, color: '#334155' }}>{voicemail.transcription}</p>
          </div>
        )}
        <div style={{ marginTop: 20 }}>
          <Button label="Download Audio" onClick={handleDownload} />
        </div>
      </Card>
    </div>
  );
};

export default VoicemailDetailPage;
