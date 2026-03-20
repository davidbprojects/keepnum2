import React, { useEffect, useState } from 'react';
import { listVirtualNumbers, searchVirtualNumbers, provisionVirtualNumber, releaseVirtualNumber } from '@keepnum/shared';

const VirtualNumbersPage: React.FC = () => {
  const [numbers, setNumbers] = useState<any[]>([]);
  const [showProvision, setShowProvision] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [areaCode, setAreaCode] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { const d = await listVirtualNumbers() as any; setNumbers(d?.virtual_numbers ?? []); } catch {} setLoading(false); }
  async function handleSearch() { try { const d = await searchVirtualNumbers({ area_code: areaCode }) as any; setSearchResults(d?.numbers ?? []); } catch {} }
  async function handleProvision(phone: string) { await provisionVirtualNumber({ phone_number: phone }); setShowProvision(false); load(); }
  async function handleRelease(id: string) { if (confirm('Release this number?')) { await releaseVirtualNumber(id); load(); } }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Virtual Numbers</h1>
        <button onClick={() => setShowProvision(!showProvision)} style={{ padding: '0.5rem 1.5rem', borderRadius: '9999px', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>+ Add Number</button>
      </div>
      {showProvision && (
        <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input placeholder="Area code" value={areaCode} onChange={e => setAreaCode(e.target.value)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }} />
            <button onClick={handleSearch} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>Search</button>
          </div>
          {searchResults.map((n: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <span>{n.phone_number}</span>
              <button onClick={() => handleProvision(n.phone_number)} style={{ padding: '0.25rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontSize: '0.875rem' }}>Provision</button>
            </div>
          ))}
        </div>
      )}
      {loading ? <p>Loading...</p> : numbers.length === 0 ? <p style={{ color: '#94a3b8' }}>No virtual numbers yet</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {numbers.map((n: any) => (
            <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: '0.75rem', background: '#fff', border: '1px solid #e2e8f0' }}>
              <div><div style={{ fontWeight: 600 }}>{n.phone_number}</div><div style={{ fontSize: '0.875rem', color: '#64748b' }}>{n.label ?? 'No label'}</div></div>
              <button onClick={() => handleRelease(n.id)} style={{ padding: '0.25rem 1rem', borderRadius: '0.5rem', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '0.875rem' }}>Release</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default VirtualNumbersPage;
