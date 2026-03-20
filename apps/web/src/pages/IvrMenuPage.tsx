import React, { useEffect, useState } from 'react';
import { listIvrMenus, createIvrMenu, deleteIvrMenu } from '@keepnum/shared';

const IvrMenuPage: React.FC = () => {
  const [menus, setMenus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { const d = await listIvrMenus() as any; setMenus(d?.menus ?? []); } catch {} setLoading(false); }
  async function handleDelete(id: string) { if (confirm('Delete this IVR menu?')) { await deleteIvrMenu(id); load(); } }

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>IVR Auto-Attendant</h1>
      {loading ? <p>Loading...</p> : menus.length === 0 ? <p style={{ color: '#94a3b8' }}>No IVR menus configured</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {menus.map((m: any) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: '0.75rem', background: '#fff', border: '1px solid #e2e8f0' }}>
              <div><div style={{ fontWeight: 600 }}>{m.name}</div><div style={{ fontSize: '0.875rem', color: '#64748b' }}>Menu ID: {m.id}</div></div>
              <button onClick={() => handleDelete(m.id)} style={{ padding: '0.25rem 1rem', borderRadius: '0.5rem', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default IvrMenuPage;
