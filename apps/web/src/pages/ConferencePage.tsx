import React, { useEffect, useState } from 'react';
import { createConference, listConferences, getConference, endConference, muteParticipant, removeParticipant } from '@keepnum/shared';

const ConferencePage: React.FC = () => {
  const [conferences, setConferences] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [maxP, setMaxP] = useState('10');

  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { const d = await listConferences() as any; setConferences(d?.conferences ?? []); } catch {} setLoading(false); }

  async function handleCreate() {
    if (!name) return;
    try { await createConference({ name, maxParticipants: parseInt(maxP) || 10 }); setName(''); setMaxP('10'); setShowCreate(false); await load(); } catch {}
  }
  async function handleView(id: string) { try { const d = await getConference(id) as any; setActive(d); } catch {} }
  async function handleEnd(id: string) { try { await endConference(id); setActive(null); await load(); } catch {} }
  async function handleMute(confId: string, pId: string, muted: boolean) { try { await muteParticipant(confId, pId, { muted }); await handleView(confId); } catch {} }
  async function handleRemove(confId: string, pId: string) { try { await removeParticipant(confId, pId); await handleView(confId); } catch {} }

  if (active) return (
    <div style={{ padding: '2rem' }}>
      <button onClick={() => setActive(null)} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', marginBottom: '1rem', fontSize: '0.875rem' }}>← Back to list</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>{active.name}</h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            Status: <span style={{ color: active.status === 'active' ? '#059669' : '#64748b' }}>{active.status}</span> · PIN: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{active.pin}</span> · Dial-in: {active.dial_in_number ?? '—'}
          </p>
        </div>
        {active.status === 'active' && <button onClick={() => handleEnd(active.id)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}>End Conference</button>}
      </div>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Participants ({active.participants?.length ?? 0})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {(active.participants ?? []).map((p: any) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: '#fff', border: '1px solid #e2e8f0' }}>
            <div><span style={{ fontWeight: 500 }}>{p.phone_number ?? p.name ?? 'Participant'}</span>{p.is_host && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#6366f1' }}>HOST</span>}{p.muted && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#ef4444' }}>MUTED</span>}</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => handleMute(active.id, p.id, !p.muted)} style={{ padding: '0.25rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>{p.muted ? 'Unmute' : 'Mute'}</button>
              {!p.is_host && <button onClick={() => handleRemove(active.id, p.id)} style={{ padding: '0.25rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #fca5a5', background: '#fff', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>Remove</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Conference Calling</h1>
        <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>New Conference</button>
      </div>
      {showCreate && (
        <div style={{ padding: '1rem', borderRadius: '0.75rem', background: '#fff', border: '1px solid #e2e8f0', marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}><label style={{ fontSize: '0.8rem', color: '#64748b' }}>Name</label><input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', marginTop: 4 }} /></div>
          <div style={{ width: 100 }}><label style={{ fontSize: '0.8rem', color: '#64748b' }}>Max</label><input type="number" value={maxP} onChange={e => setMaxP(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', marginTop: 4 }} /></div>
          <button onClick={handleCreate} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>Create</button>
        </div>
      )}
      {loading ? <p>Loading...</p> : conferences.length === 0 ? <p style={{ color: '#94a3b8' }}>No conferences</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {conferences.map((c: any) => (
            <div key={c.id} onClick={() => handleView(c.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: '0.75rem', background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
              <div><div style={{ fontWeight: 500 }}>{c.name}</div><div style={{ fontSize: '0.875rem', color: '#64748b' }}>PIN: {c.pin} · {c.participant_count ?? 0} participants · {c.status}</div></div>
              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: c.status === 'active' ? '#ecfdf5' : '#f1f5f9', color: c.status === 'active' ? '#059669' : '#64748b' }}>{c.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default ConferencePage;
