import React, { useEffect, useState } from 'react';
import { listAutoReplyTemplates, createAutoReplyTemplate, deleteAutoReplyTemplate } from '@keepnum/shared';

const AutoReplyPage: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { const d = await listAutoReplyTemplates() as any; setTemplates(d?.templates ?? []); } catch {} setLoading(false); }
  async function handleDelete(id: string) { await deleteAutoReplyTemplate(id); load(); }

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Auto-Reply SMS</h1>
      {loading ? <p>Loading...</p> : templates.length === 0 ? <p style={{ color: '#94a3b8' }}>No auto-reply templates</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {templates.map((t: any) => (
            <div key={t.id} style={{ padding: '1rem', borderRadius: '0.75rem', background: '#fff', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ padding: '0.125rem 0.75rem', borderRadius: '9999px', background: '#eef2ff', color: '#6366f1', fontSize: '0.75rem', fontWeight: 500 }}>{t.scenario}</span>
                <button onClick={() => handleDelete(t.id)} style={{ fontSize: '0.75rem', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Delete</button>
              </div>
              <p style={{ fontSize: '0.875rem', color: '#475569' }}>{t.message}</p>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{t.message?.length ?? 0}/480 characters</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default AutoReplyPage;
