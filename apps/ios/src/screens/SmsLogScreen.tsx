import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, Alert, Linking } from 'react-native';
import { Card, Button, Input } from '@keepnum/ui-components';
import { getSmsLogs, getSmsDownloadUrl } from '@keepnum/shared';
import type { SmsLogItem } from '@keepnum/shared';

const SmsLogScreen: React.FC = () => {
  const [logs, setLogs] = useState<SmsLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [senderFilter, setSenderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getSmsLogs({
        sender: senderFilter || undefined,
        status: statusFilter || undefined,
      });
      setLogs(items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SMS logs');
    } finally {
      setLoading(false);
    }
  }, [senderFilter, statusFilter]);

  useEffect(() => { fetchLogs(); }, []);

  const handleExport = async (numberId: string) => {
    try {
      const { url } = await getSmsDownloadUrl(numberId);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Export failed');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ padding: 16, gap: 8 }}>
        <Input label="Sender" value={senderFilter} onChangeText={setSenderFilter} placeholder="Filter by sender" testID="sms-sender-filter" />
        <Input label="Status" value={statusFilter} onChangeText={setStatusFilter} placeholder="delivered, failed…" testID="sms-status-filter" />
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
          ListEmptyComponent={<Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 12 }}>No SMS logs found.</Text>}
          renderItem={({ item }) => (
            <Card padding="sm">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 14 }}>{item.sender} → {item.recipient}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>{item.status} · {item.direction}</Text>
                </View>
                <Button label="Export" variant="ghost" size="sm" onPress={() => handleExport(item.pk.split('#')[1])} />
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
};

export default SmsLogScreen;
