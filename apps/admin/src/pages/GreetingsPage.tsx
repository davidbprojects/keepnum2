import React, { useEffect, useState } from 'react';
import { Button, Input, Card } from '@keepnum/ui-components';
import { listAdminGreetings, createAdminGreeting, updateAdminGreeting, deleteAdminGreeting } from '../api/adminApi';

const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: '0.85rem', color: '#334155' };

const GreetingsPage: React.FC = () => {
  const [greetings, setGreetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('professional');
  const [audioUrl, setAudioUrl] = useState('');
  const [voiceTalent, setVoiceTalent] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { const d = await listAdminGreetings() as any; setGreetings(d?.greetings ?? d ?? []); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!name) return;
    try {
      if (editId) { await updateAdminGreeting(editId, { name, category, audioUrl, voiceTalent }); }
      else { await createAdminGreeting({ name, category, audioUrl, voiceTalent }); }
      setName(''); setCategory('professional'); setAudioUrl(''); setVoiceTalent(''); setEditId(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save'); }
  };
  const handleEdit = (g: any) => { setEditId(g.id); setName(g.name); setCategory(g.category ?? 'professional'); setAudioUrl(g.audio_url ?? ''); setVoiceTalent(g.voice_talent ?? ''); };
  const handleDelete = async (id: string) => { try { await deleteAdminGreeting(id); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete'); } };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>🎙️ Greetings Marketplace</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>Manage marketplace greeting catalogue</p>

      <Card padding="md" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 12px', color: '#334155' }}>{editId ? 'Edit Greeting' : 'Add Greeting'}</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
            <option value="professional">Professional</option><option value="casual">Casual</option><option value="holiday">Holiday</option><option value="funny">Funny</option><option value="multilingual">Multilingual</option>
          </select>
          <Input placeholder="Audio URL" value={audioUrl} onChange={e => setAudioUrl(e.target.value)} />
          <Input placeholder="Voice Talent" value={voiceTalent} onChange={e => setVoiceTalent(e.target.value)} />
          <Button label={editId ? 'Update' : 'Create'} variant="primary" size="sm" onClick={handleSave} />
          {editId && <Button label="Cancel" variant="ghost" size="sm" onClick={() => { setEditId(null); setName(''); setCategory('professional'); setAudioUrl(''); setVoiceTalent(''); }} />}
        </div>
      </Card>

      {error && <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626', marginBottom: 12 }}>{error}</div>}
      {loading ? <p style={{ color: '#64748b' }}>Loading…</p> : (
        <Card padding="sm">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid #e2e8f0' }}><th style={thStyle}>Name</th><th style={thStyle}>Category</th><th style={thStyle}>Voice</th><th style={thStyle}>Actions</th></tr></thead>
              <tbody>
                {greetings.map((g: any, i: number) => (
                  <tr key={g.id} style={{ borderBottom: i < greetings.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={tdStyle}><span style={{ fontWeight: 500 }}>{g.name}</span></td>
                    <td style={tdStyle}><span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: '#f1f5f9', color: '#64748b' }}>{g.category}</span></td>
                    <td style={tdStyle}>{g.voice_talent ?? '—'}</td>
                    <td style={tdStyle}><div style={{ display: 'flex', gap: 6 }}><Button label="Edit" variant="ghost" size="sm" onClick={() => handleEdit(g)} /><Button label="Delete" variant="ghost" size="sm" onClick={() => handleDelete(g.id)} /></div></td>
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
export default GreetingsPage;
