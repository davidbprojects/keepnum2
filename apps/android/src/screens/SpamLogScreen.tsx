import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import { getSpamLog } from '@keepnum/shared';
import type { SpamLogItem } from '@keepnum/shared';

const SpamLogScreen: React.FC = () => {
  const [logs, setLogs] = useState<SpamLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getSpamLog()
      .then(setLogs)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load spam log'))
      .finally(() => setLoading(false));
  }, []);

  const handleMarkFalsePositive = (item: SpamLogItem) => {
    // In a full implementation, this would call an API to mark as false positive
    setLogs((prev) =>
      prev.map((l) => (l.sk === item.sk ? { ...l, falsePositive: true } : l))
    );
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
      data={logs}
      keyExtractor={(item) => item.sk}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      ListEmptyComponent={
        <Card padding="lg">
          <Text style={{ textAlign: 'center', color: '#6b7280' }}>No spam detected.</Text>
        </Card>
      }
      renderItem={({ item }) => (
        <Card padding="sm">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 14 }}>{item.callerId}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>{item.itemType}</Text>
                {item.falsePositive && (
                  <Text style={{ fontSize: 12, color: '#059669', fontWeight: '600' }}>False Positive</Text>
                )}
              </View>
            </View>
            {!item.falsePositive && (
              <Button label="Not Spam" variant="ghost" size="sm" onPress={() => handleMarkFalsePositive(item)} />
            )}
          </View>
        </Card>
      )}
    />
  );
};

export default SpamLogScreen;
