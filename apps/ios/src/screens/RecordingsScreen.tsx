import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, Linking } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import { listRecordings, getRecordingDownloadUrl } from '@keepnum/shared';

const RecordingsScreen: React.FC = () => {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await listRecordings() as any;
      setRecordings(d?.recordings ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async (callId: string) => {
    try {
      const d = await getRecordingDownloadUrl(callId) as any;
      if (d?.url) Linking.openURL(d.url);
    } catch {}
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
        data={recordings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Card padding="lg"><Text style={{ textAlign: 'center', color: '#6b7280' }}>No recordings</Text></Card>}
        renderItem={({ item }) => (
          <Card padding="md">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontWeight: '500', fontSize: 15 }}>{item.caller_id ?? 'Unknown'}</Text>
                <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {item.duration_seconds}s • {item.direction} • {new Date(item.recorded_at).toLocaleDateString()}
                </Text>
              </View>
              <Button label="Download" variant="secondary" size="sm" onPress={() => handleDownload(item.call_id)} />
            </View>
          </Card>
        )}
      />
    </View>
  );
};

export default RecordingsScreen;
