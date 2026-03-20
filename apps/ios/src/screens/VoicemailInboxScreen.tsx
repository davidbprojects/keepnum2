import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import { searchVoicemails, bulkMoveVoicemails, bulkReadVoicemails, bulkDeleteVoicemails } from '@keepnum/shared';

const folders = ['inbox', 'saved', 'trash'] as const;

const VoicemailInboxScreen: React.FC = () => {
  const [voicemails, setVoicemails] = useState<any[]>([]);
  const [folder, setFolder] = useState<string>('inbox');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [folder]);
  async function load() { setLoading(true); try { const d = await searchVoicemails({ folder, query: search || '' }) as any; setVoicemails(d?.voicemails ?? []); } catch {} setLoading(false); setSelected(new Set()); }
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = () => Array.from(selected);
  async function handleMove(dest: string) { if (!selected.size) return; try { await bulkMoveVoicemails({ ids: ids(), folder: dest }); await load(); } catch {} }
  async function handleRead(read: boolean) { if (!selected.size) return; try { await bulkReadVoicemails({ ids: ids(), read }); await load(); } catch {} }
  async function handleDelete() { if (!selected.size) return; try { await bulkDeleteVoicemails({ ids: ids() }); await load(); } catch {} }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        {folders.map(f => (
          <TouchableOpacity key={f} onPress={() => setFolder(f)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: folder === f ? '#eef2ff' : '#f1f5f9' }}>
            <Text style={{ fontSize: 13, fontWeight: folder === f ? '600' : '400', color: folder === f ? '#6366f1' : '#64748b', textTransform: 'capitalize' }}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput value={search} onChangeText={setSearch} onSubmitEditing={() => load()} placeholder="Search voicemails..." style={{ backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 14 }} />
      {selected.size > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {folder !== 'saved' && <Button label="Save" variant="ghost" size="sm" onPress={() => handleMove('saved')} />}
          {folder !== 'trash' && <Button label="Trash" variant="ghost" size="sm" onPress={() => handleMove('trash')} />}
          <Button label="Mark Read" variant="ghost" size="sm" onPress={() => handleRead(true)} />
          {folder === 'trash' && <Button label="Delete" variant="danger" size="sm" onPress={handleDelete} />}
        </View>
      )}
      {loading ? <Text style={{ color: '#94a3b8' }}>Loading...</Text> : voicemails.length === 0 ? <Text style={{ color: '#94a3b8' }}>No voicemails</Text> : voicemails.map((vm: any) => (
        <TouchableOpacity key={vm.id} onPress={() => toggle(vm.id)}>
          <Card padding="md">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: vm.read ? '400' : '700', fontSize: 15 }}>{vm.caller_id ?? 'Unknown'}</Text>
                <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{vm.duration_seconds}s · {new Date(vm.created_at).toLocaleDateString()}</Text>
                {vm.transcription && <Text numberOfLines={1} style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{vm.transcription}</Text>}
              </View>
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selected.has(vm.id) ? '#6366f1' : '#e2e8f0', backgroundColor: selected.has(vm.id) ? '#6366f1' : 'transparent' }} />
            </View>
          </Card>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};
export default VoicemailInboxScreen;
