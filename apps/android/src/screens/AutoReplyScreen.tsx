import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import { listAutoReplyTemplates, deleteAutoReplyTemplate } from '@keepnum/shared';

const AutoReplyScreen: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await listAutoReplyTemplates() as any;
      setTemplates(d?.templates ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (id: string) => {
    Alert.alert('Delete Template', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteAutoReplyTemplate(id); load(); } },
    ]);
  };

  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  if (error) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}><Text style={{ color: '#dc2626' }}>{error}</Text></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <FlatList
        data={templates}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Card padding="lg"><Text style={{ textAlign: 'center', color: '#6b7280' }}>No auto-reply templates</Text></Card>}
        renderItem={({ item }) => (
          <Card padding="md">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ backgroundColor: '#eef2ff', paddingVertical: 2, paddingHorizontal: 10, borderRadius: 12 }}>
                <Text style={{ color: '#6366f1', fontSize: 12, fontWeight: '500' }}>{item.scenario}</Text>
              </View>
              <Button label="Delete" variant="danger" size="sm" onPress={() => handleDelete(item.id)} />
            </View>
            <Text style={{ fontSize: 14, color: '#475569' }}>{item.message}</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{item.message?.length ?? 0}/480 characters</Text>
          </Card>
        )}
      />
    </View>
  );
};

export default AutoReplyScreen;
