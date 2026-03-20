import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { Card, Button, Input } from '@keepnum/ui-components';
import { getCallLogs } from '@keepnum/shared';
import type { CallLogItem } from '@keepnum/shared';

const CallLogScreen: React.FC = () => {
  const [logs, setLogs] = useState<CallLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [callerFilter, setCallerFilter] = useState('');
  const [dispositionFilter, setDispositionFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getCallLogs({
        callerId: callerFilter || undefined,
        disposition: dispositionFilter || undefined,
      });
      setLogs(items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call logs');
    } finally {
      setLoading(false);
    }
  }, [callerFilter, dispositionFilter]);

  useEffect(() => { fetchLogs(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ padding: 16, gap: 8 }}>
        <Input label="Caller ID" value={callerFilter} onChangeText={setCallerFilter} placeholder="Filter by caller" testID="call-caller-filter" />
        <Input label="Disposition" value={dispositionFilter} onChangeText={setDispositionFilter} placeholder="answered, voicemail…" testID="call-disp-filter" />
        <Button label="Filter" size="sm" onPress={fetchLogs} />
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={{ color: '#dc2626', padding: 16 }}>{error}</Text>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.sk}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 24 }}
          ListEmptyComponent={<Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 12 }}>No call logs found.</Text>}
          renderItem={({ item }) => (
            <Card padding="sm">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 14 }}>{item.callerId}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>
                    {item.disposition} · {item.direction} · {item.duration}s
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>{item.sk.split('#')[0]}</Text>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
};

export default CallLogScreen;
