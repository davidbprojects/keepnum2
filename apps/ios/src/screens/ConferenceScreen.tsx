import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import { createConference, listConferences, getConference, endConference, muteParticipant, removeParticipant } from '@keepnum/shared';

const ConferenceScreen: React.FC = () => {
  const [conferences, setConferences] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { const d = await listConferences() as any; setConferences(d?.conferences ?? []); } catch {} setLoading(false); }
  async function handleCreate() { if (!name) return; try { await createConference({ name, maxParticipants: 10 }); setName(''); setShowCreate(false); await load(); } catch {} }
  async function handleView(id: string) { try { const d = await getConference(id) as any; setActive(d); } catch {} }
  async function handleEnd(id: string) { try { await endConference(id); setActive(null); await load(); } catch {} }
  async function handleMute(cId: string, pId: string, muted: boolean) { try { await muteParticipant(cId, pId, { muted }); await handleView(cId); } catch {} }
  async function handleRemove(cId: string, pId: string) { try { await removeParticipant(cId, pId); await handleView(cId); } catch {} }

  if (active) return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Button label="← Back" variant="ghost" size="sm" onPress={() => setActive(null)} />
      <Text style={{ fontSize: 18, fontWeight: '700' }}>{active.name}</Text>
      <Text style={{ fontSize: 13, color: '#64748b' }}>PIN: {active.pin} · {active.status}</Text>
      {active.status === 'active' && <Button label="End Conference" variant="danger" size="sm" onPress={() => handleEnd(active.id)} />}
      <Text style={{ fontSize: 15, fontWeight: '600', marginTop: 8 }}>Participants</Text>
      {(active.participants ?? []).map((p: any) => (
        <Card key={p.id} padding="sm">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View><Text style={{ fontWeight: '500' }}>{p.phone_number ?? 'Participant'}</Text>{p.is_host && <Text style={{ fontSize: 11, color: '#6366f1' }}>HOST</Text>}</View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Button label={p.muted ? 'Unmute' : 'Mute'} variant="ghost" size="sm" onPress={() => handleMute(active.id, p.id, !p.muted)} />
              {!p.is_host && <Button label="Remove" variant="danger" size="sm" onPress={() => handleRemove(active.id, p.id)} />}
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>Conferences</Text>
        <Button label="New" variant="primary" size="sm" onPress={() => setShowCreate(!showCreate)} />
      </View>
      {showCreate && (
        <Card padding="md">
          <TextInput value={name} onChangeText={setName} placeholder="Conference name" style={{ backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8 }} />
          <Button label="Create" variant="primary" size="sm" onPress={handleCreate} />
        </Card>
      )}
      {loading ? <Text style={{ color: '#94a3b8' }}>Loading...</Text> : conferences.length === 0 ? <Text style={{ color: '#94a3b8' }}>No conferences</Text> : conferences.map((c: any) => (
        <Card key={c.id} padding="md">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View><Text style={{ fontWeight: '600' }}>{c.name}</Text><Text style={{ fontSize: 12, color: '#64748b' }}>PIN: {c.pin} · {c.participant_count ?? 0} participants</Text></View>
            <Button label="View" variant="ghost" size="sm" onPress={() => handleView(c.id)} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
};
export default ConferenceScreen;
