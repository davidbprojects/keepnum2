import React, { useEffect, useState } from 'react';
import { getUnifiedInbox, getUnreadCount } from '@keepnum/shared';

const typeIcons: Record<string, string> = { voicemail: '🎤', missed_call: '📞', sms: '💬' };

const UnifiedInboxPage: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [typeFilter]);
  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (typeFilter) params.type = typeFilter;
      const d = await getUnifiedInbox(params) as any;
      setItems(d?.items ?? []);
      const u = await getUnreadCount() as any;
      setUnread(u?.unread_count ?? 0);
    } catch {} setLoading(false);
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Unified Inbox {unread > 0 && <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#ef4444', color: '#fff', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{unread}</span>}</h1>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <option value="">All types</option>
          <option value="voicemail">Voicemail</option>
          <option value="missed_call">Missed Call</option>
          <option value="sms">SMS</option>
        </select>
      </div>
      {loading ? <p>Loading...</p> : items.length === 0 ? <p style={{ color: '#94a3b8' }}>No items</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map((item: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', borderRadius: '0.75rem', background: item.isRead ? '#fff' : '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '1.5rem' }}>{typeIcons[item.itemType] ?? '📋'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: item.isRead ? 400 : 600 }}>{item.callerId ?? item.from ?? 'Unknown'}</div>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>{item.preview ?? item.itemType}</div>
              </div>
              <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#f1f5f9', fontSize: '0.75rem', color: '#64748b' }}>{item.sourceNumber ?? ''}</span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.sk ? new Date(item.sk.split('#')[0]).toLocaleDateString() : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default UnifiedInboxPage;
