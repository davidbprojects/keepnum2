import React, { useEffect, useState } from 'react';
import { listVoicemails, bulkMoveVoicemails, bulkReadVoicemails, bulkDeleteVoicemails, searchVoicemails, shareVoicemail } from '@keepnum/shared';

type VoicemailFolder = 'inbox' | 'saved' | 'trash';

const VoicemailInboxPage: React.FC = () => {
  const [folder, setFolder] = useState<VoicemailFolder>('inbox');
  const [voicemails, setVoicemails] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadVoicemails(); }, [folder]);

  async function loadVoicemails() {
    setLoading(true);
    try {
      const data = searchQuery
        ? await searchVoicemails({ q: searchQuery, folder }) as any
        : await listVoicemails() as any;
      setVoicemails(Array.isArray(data) ? data : data?.voicemails ?? []);
    } catch { setVoicemails([]); }
    setLoading(false);
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleBulkMove = async (target: VoicemailFolder) => {
    await bulkMoveVoicemails({ ids: [...selected], folder: target });
    setSelected(new Set());
    loadVoicemails();
  };

  const handleBulkRead = async (read: boolean) => {
    await bulkReadVoicemails({ ids: [...selected], read });
    setSelected(new Set());
    loadVoicemails();
  };

  const handleBulkDelete = async () => {
    await bulkDeleteVoicemails({ ids: [...selected] });
    setSelected(new Set());
    loadVoicemails();
  };

  const folders: VoicemailFolder[] = ['inbox', 'saved', 'trash'];

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Visual Voicemail</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {folders.map(f => (
          <button key={f} onClick={() => setFolder(f)}
            style={{ padding: '0.5rem 1rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
              background: folder === f ? '#6366f1' : '#f1f5f9', color: folder === f ? '#fff' : '#475569', fontWeight: 500 }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input placeholder="Search voicemails..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadVoicemails()}
          style={{ flex: 1, padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }} />
        {selected.size > 0 && (
          <>
            <button onClick={() => handleBulkMove('saved')} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}>Save</button>
            <button onClick={() => handleBulkMove('trash')} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer' }}>Trash</button>
            <button onClick={() => handleBulkRead(true)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>Mark Read</button>
            {folder === 'trash' && <button onClick={handleBulkDelete} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}>Delete Forever</button>}
          </>
        )}
      </div>

      {loading ? <p>Loading...</p> : voicemails.length === 0 ? <p style={{ color: '#94a3b8' }}>No voicemails in {folder}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {voicemails.map((vm: any) => (
            <div key={vm.id} onClick={() => toggleSelect(vm.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', borderRadius: '0.75rem',
                background: selected.has(vm.id) ? '#eef2ff' : '#fff', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(vm.id)} readOnly />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: vm.read ? 400 : 600 }}>{vm.caller_id ?? 'Unknown'}</div>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>{vm.transcription_text?.substring(0, 80) ?? 'No transcription'}</div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{vm.duration_seconds ? `${vm.duration_seconds}s` : ''}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{vm.received_at ? new Date(vm.received_at).toLocaleDateString() : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VoicemailInboxPage;
