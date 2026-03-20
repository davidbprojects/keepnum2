import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import { listVirtualNumbers, searchVirtualNumbers, provisionVirtualNumber, releaseVirtualNumber } from '@keepnum/shared';

const VirtualNumbersScreen: React.FC = () => {
  const [numbers, setNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProvision, setShowProvision] = useState(false);
  const [areaCode, setAreaCode] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => { load(); }, []);
  async function load() { setLoading(true); try { const d = await listVirtualNumbers() as any; setNumbers(d?.virtualNumbers ?? []); } catch {} setLoading(false); }
  async function handleSearch() { if (!areaCode) return; try { const d = await searchVirtualNumbers({ areaCode }) as any; setSearchResults(d?.numbers ?? []); } catch {} }
  async function handleProvision(phoneNumber: string) { try { await provisionVirtualNumber({ phoneNumber }); setShowProvision(false); setSearchResults([]); await load(); } catch {} }
  async function handleRelease(id: string) { try { await releaseVirtualNumber(id); await load(); } catch {} }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>Virtual Numbers</Text>
        <Button label="Add Number" variant="primary" size="sm" onPress={() => setShowProvision(!showProvision)} />
      </View>
      {showProvision && (
        <Card padding="md">
          <Text style={{ fontWeight: '600', marginBottom: 8 }}>Search Available Numbers</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={areaCode} onChangeText={setAreaCode} placeholder="Area code" style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' }} />
            <Button label="Search" variant="primary" size="sm" onPress={handleSearch} />
          </View>
          {searchResults.map((n: any) => (
            <View key={n.phone_number} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <Text style={{ fontSize: 14 }}>{n.phone_number}</Text>
              <Button label="Provision" variant="primary" size="sm" onPress={() => handleProvision(n.phone_number)} />
            </View>
          ))}
        </Card>
      )}
      {loading ? <Text style={{ color: '#94a3b8' }}>Loading...</Text> : numbers.length === 0 ? <Text style={{ color: '#94a3b8' }}>No virtual numbers</Text> : numbers.map((n: any) => (
        <Card key={n.id} padding="md">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View><Text style={{ fontWeight: '600', fontSize: 15 }}>{n.phone_number}</Text><Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{n.type} · {n.status}</Text></View>
            <Button label="Release" variant="danger" size="sm" onPress={() => handleRelease(n.id)} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
};
export default VirtualNumbersScreen;
