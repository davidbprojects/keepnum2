import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import { listIvrMenus, deleteIvrMenu } from '@keepnum/shared';

const IvrMenuScreen: React.FC = () => {
  const [menus, setMenus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await listIvrMenus() as any;
      setMenus(d?.menus ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load IVR menus');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (id: string) => {
    Alert.alert('Delete IVR Menu', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteIvrMenu(id); load(); } },
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
        data={menus}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Card padding="lg"><Text style={{ textAlign: 'center', color: '#6b7280' }}>No IVR menus configured</Text></Card>}
        renderItem={({ item }) => (
          <Card padding="md">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontWeight: '600', fontSize: 15 }}>{item.name}</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Menu ID: {item.id}</Text>
              </View>
              <Button label="Delete" variant="danger" size="sm" onPress={() => handleDelete(item.id)} />
            </View>
          </Card>
        )}
      />
    </View>
  );
};

export default IvrMenuScreen;
