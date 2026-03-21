import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Modal } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import { listMarketplaceGreetings, previewGreeting, applyGreeting, requestCustomGreeting } from '@keepnum/shared';

const categories = ['All', 'professional', 'casual', 'holiday', 'funny', 'multilingual'];

const GreetingsMarketplaceScreen: React.FC = () => {
  const [greetings, setGreetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [showCustom, setShowCustom] = useState(false);
  const [customScript, setCustomScript] = useState('');
  const [customVoice, setCustomVoice] = useState('');
  const [applyTarget, setApplyTarget] = useState<any>(null);
  const [numberId, setNumberId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (category !== 'All') params.category = category;
      const d = await listMarketplaceGreetings(params) as any;
      setGreetings(d?.greetings ?? []);
    } catch {}
    setLoading(false);
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const handleApply = (greeting: any) => {
    setApplyTarget(greeting);
    setNumberId('');
  };

  const confirmApply = async () => {
    if (!applyTarget || !numberId.trim()) return;
    try { await applyGreeting(applyTarget.id, { numberId }); Alert.alert('Success', 'Greeting applied'); } catch {}
    setApplyTarget(null);
    setNumberId('');
  };

  const handleCustomRequest = async () => {
    if (!customScript.trim()) { Alert.alert('Enter a script'); return; }
    try {
      await requestCustomGreeting({ script: customScript, voicePreference: customVoice || undefined });
      Alert.alert('Success', 'Custom greeting requested');
      setShowCustom(false);
      setCustomScript('');
      setCustomVoice('');
    } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {applyTarget && (
        <Modal transparent animationType="fade" visible>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%' }}>
              <Text style={{ fontWeight: '600', fontSize: 16, marginBottom: 12 }}>Apply "{applyTarget.name}"</Text>
              <TextInput placeholder="Enter number ID" value={numberId} onChangeText={setNumberId} style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, padding: 10, marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                <Button label="Cancel" variant="secondary" size="sm" onPress={() => setApplyTarget(null)} />
                <Button label="Apply" variant="primary" size="sm" onPress={confirmApply} />
              </View>
            </View>
          </View>
        </Modal>
      )}
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '600' }}>Greetings Marketplace</Text>
          <Button label="Request Custom" variant="primary" size="sm" onPress={() => setShowCustom(!showCustom)} />
        </View>
        {showCustom && (
          <Card padding="md">
            <Text style={{ fontWeight: '600', marginBottom: 8 }}>Custom Greeting Request</Text>
            <TextInput
              placeholder="Enter your greeting script..."
              value={customScript}
              onChangeText={setCustomScript}
              multiline
              numberOfLines={3}
              style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, padding: 8, marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                placeholder="Voice preference (optional)"
                value={customVoice}
                onChangeText={setCustomVoice}
                style={{ flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, padding: 8 }}
              />
              <Button label="Submit" variant="primary" size="sm" onPress={handleCustomRequest} />
            </View>
          </Card>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {categories.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                style={{
                  paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16,
                  borderWidth: 1, borderColor: category === c ? '#6366f1' : '#e2e8f0',
                  backgroundColor: category === c ? '#eef2ff' : '#fff',
                }}
              >
                <Text style={{ color: category === c ? '#6366f1' : '#64748b', fontSize: 13 }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={greetings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 16 }}
          ListEmptyComponent={<Card padding="lg"><Text style={{ textAlign: 'center', color: '#6b7280' }}>No greetings found</Text></Card>}
          renderItem={({ item }) => (
            <Card padding="md">
              <Text style={{ fontWeight: '500', marginBottom: 2 }}>{item.name}</Text>
              <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{item.category} · {item.voice_talent ?? 'Standard'}</Text>
              {item.description ? <Text style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{item.description}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Apply" variant="primary" size="sm" onPress={() => handleApply(item)} />
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
};

export default GreetingsMarketplaceScreen;
