import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Card } from '@keepnum/ui-components';
import { getUnifiedInbox } from '@keepnum/shared';

const typeIcons: Record<string, string> = { voicemail: '🎤', missed_call: '📞', sms: '💬', call: '📱' };

const UnifiedInboxScreen: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => { load(); }, [filter]);
  async function load() {
    setLoading(true);
    try {
      const params: any = {};
      if (filter !== 'all') params.type = filter;
      const d = await getUnifiedInbox(params) as any;
      setItems(d?.items ?? []);
    } catch {} setLoading(false);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {['all', 'voicemail', 'missed_call', 'sms'].map(t => (
          <TouchableOpacity key={t} onPress={() => setFilter(t)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: filter === t ? '#eef2ff' : '#f1f5f9' }}>
            <Text style={{ fontSize: 13, fontWeight: filter === t ? '600' : '400', color: filter === t ? '#6366f1' : '#64748b', textTransform: 'capitalize' }}>{t.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <Text style={{ color: '#94a3b8' }}>Loading...</Text> : items.length === 0 ? <Text style={{ color: '#94a3b8' }}>No items</Text> : items.map((item: any) => (
        <Card key={item.id} padding="md">
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 20 }}>{typeIcons[item.type] ?? '📋'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 14 }}>{item.caller_id ?? item.from ?? 'Unknown'}</Text>
              <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{item.type?.replace('_', ' ')} · {item.source_number ?? ''} · {new Date(item.timestamp).toLocaleString()}</Text>
              {item.preview && <Text numberOfLines={1} style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{item.preview}</Text>}
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
};
export default UnifiedInboxScreen;
