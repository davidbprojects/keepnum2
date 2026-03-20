import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Alert, Linking } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import { listVoicemails, getVoicemailDownloadUrl } from '@keepnum/shared';
import type { Voicemail } from '@keepnum/shared';

const VoicemailsScreen: React.FC = () => {
  const [voicemails, setVoicemails] = useState<Voicemail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listVoicemails()
      .then(setVoicemails)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load voicemails'))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (id: string) => {
    try {
      const { url } = await getVoicemailDownloadUrl(id);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Download failed');
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: '#dc2626' }}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={voicemails}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      ListEmptyComponent={
        <Card padding="lg">
          <Text style={{ textAlign: 'center', color: '#6b7280' }}>No voicemails yet.</Text>
        </Card>
      }
      renderItem={({ item }) => (
        <Card padding="md">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600' }}>{item.caller_id ?? 'Unknown Caller'}</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {item.duration_seconds ? `${item.duration_seconds}s` : ''} · {item.transcription_status} · {new Date(item.received_at).toLocaleString()}
              </Text>
              {item.transcription && (
                <Text style={{ fontSize: 13, color: '#374151', marginTop: 4 }} numberOfLines={2}>
                  {item.transcription}
                </Text>
              )}
            </View>
            <Button label="Download" variant="ghost" size="sm" onPress={() => handleDownload(item.id)} />
          </View>
        </Card>
      )}
    />
  );
};

export default VoicemailsScreen;
