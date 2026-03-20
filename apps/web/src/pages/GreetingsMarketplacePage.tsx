import React, { useEffect, useState } from 'react';
import { listMarketplaceGreetings, previewGreeting, applyGreeting, requestCustomGreeting } from '@keepnum/shared';

const categories = ['All', 'professional', 'casual', 'holiday', 'funny', 'multilingual'];

const GreetingsMarketplacePage: React.FC = () => {
  const [greetings, setGreetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [applyDialog, setApplyDialog] = useState<any>(null);
  const [numberId, setNumberId] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [customScript, setCustomScript] = useState('');
  const [customVoice, setCustomVoice] = useState('');

  useEffect(() => { load(); }, [category]);
  async function load() {
    setLoading(true);
    try {
      const params: any = {};
      if (category !== 'All') params.category = category;
      const d = await listMarketplaceGreetings(params) as any;
      setGreetings(d?.greetings ?? []);
    } catch {} setLoading(false);
  }
  async function handlePreview(id: string) { try { const d = await previewGreeting(id) as any; setPreviewUrl(d?.url ?? null); } catch {} }
  async function handleApply() { if (!applyDialog || !numberId) return; try { await applyGreeting(applyDialog.id, { numberId }); setApplyDialog(null); setNumberId(''); } catch {} }
  async function handleCustomRequest() {
    if (!customScript) return;
    try { await requestCustomGreeting({ script: customScript, voicePreference: customVoice || undefined }); setShowCustom(false); setCustomScript(''); setCustomVoice(''); } catch {}
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Greetings Marketplace</h1>
        <button onClick={() => setShowCustom(!showCustom)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>Request Custom</button>
      </div>
      {showCustom && (
        <div style={{ padding: '1rem', borderRadius: '0.75rem', background: '#fff', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Custom Greeting Request</h3>
          <textarea value={customScript} onChange={e => setCustomScript(e.target.value)} placeholder="Enter your greeting script..." rows={3} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', marginBottom: '0.5rem', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input value={customVoice} onChange={e => setCustomVoice(e.target.value)} placeholder="Voice preference (optional)" style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }} />
            <button onClick={handleCustomRequest} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>Submit</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button key={c} onClick={() => setCategory(c)} style={{ padding: '0.375rem 0.75rem', borderRadius: '1rem', border: '1px solid', borderColor: category === c ? '#6366f1' : '#e2e8f0', background: category === c ? '#eef2ff' : '#fff', color: category === c ? '#6366f1' : '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>{c}</button>
        ))}
      </div>
      {previewUrl && (
        <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <audio controls src={previewUrl} style={{ flex: 1 }} />
          <button onClick={() => setPreviewUrl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>
      )}
      {applyDialog && (
        <div style={{ padding: '1rem', borderRadius: '0.75rem', background: '#fff', border: '2px solid #6366f1', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Apply "{applyDialog.name}" to number</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input value={numberId} onChange={e => setNumberId(e.target.value)} placeholder="Number ID" style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }} />
            <button onClick={handleApply} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>Apply</button>
            <button onClick={() => setApplyDialog(null)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? <p>Loading...</p> : greetings.length === 0 ? <p style={{ color: '#94a3b8' }}>No greetings found</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {greetings.map((g: any) => (
            <div key={g.id} style={{ padding: '1rem', borderRadius: '0.75rem', background: '#fff', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{g.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>{g.category} · {g.voice_talent ?? 'Standard'}</div>
              {g.description && <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 0.75rem' }}>{g.description}</p>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => handlePreview(g.id)} style={{ flex: 1, padding: '0.375rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>▶ Preview</button>
                <button onClick={() => setApplyDialog(g)} style={{ flex: 1, padding: '0.375rem', borderRadius: '0.375rem', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>Apply</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default GreetingsMarketplacePage;
