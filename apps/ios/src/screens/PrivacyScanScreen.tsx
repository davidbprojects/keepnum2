import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import { startPrivacyScan, listPrivacyScans, getPrivacyScanResults } from '@keepnum/shared';

const severityColors: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };

const PrivacyScanScreen: React.FC = () => {
  const [scans, setScans] = useState<any[]>([]);
  const [selectedScan, setSelectedScan] = useState<any>(null);
  const [phone, setPhone] = useState('');
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await listPrivacyScans() as any;
      setScans(d?.scans ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleScan = async () => {
    if (!phone.trim()) { Alert.alert('Enter a phone number'); return; }
    setScanning(true);
    try { await startPrivacyScan({ phone_number: phone }); setPhone(''); load(); } catch {}
    setScanning(false);
  };

  const viewResults = async (scanId: string) => {
    try {
      const d = await getPrivacyScanResults(scanId) as any;
      setSelectedScan(d);
    } catch {}
  };

  if (selectedScan) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Scan Results — {selectedScan.findings?.length ?? 0} findings</Text>
        <FlatList
          data={selectedScan.findings ?? []}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item: f }) => (
            <Card padding="md">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontWeight: '500' }}>{f.source_name}</Text>
                  <Text style={{ fontSize: 12, color: '#64748b' }}>{f.listing_url}</Text>
                </View>
                <View style={{ backgroundColor: severityColors[f.severity] ?? '#94a3b8', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 12 }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{f.severity}</Text>
                </View>
              </View>
            </Card>
          )}
        />
        <View style={{ marginTop: 12 }}>
          <Button label="Close" variant="secondary" onPress={() => setSelectedScan(null)} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            placeholder="Phone number to scan"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }}
          />
          <Button label={scanning ? 'Scanning...' : 'Scan'} variant="primary" onPress={handleScan} disabled={scanning} />
        </View>
      </View>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={scans}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          ListEmptyComponent={<Card padding="lg"><Text style={{ textAlign: 'center', color: '#6b7280' }}>No privacy scans yet</Text></Card>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => viewResults(item.id)}>
              <Card padding="md">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontWeight: '500' }}>{item.phone_number}</Text>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>{item.findings_count} findings • {item.sources_scanned}/{item.sources_total} sources</Text>
                  </View>
                  <View style={{ backgroundColor: item.status === 'completed' ? '#dcfce7' : '#fef3c7', paddingVertical: 2, paddingHorizontal: 10, borderRadius: 12 }}>
                    <Text style={{ color: item.status === 'completed' ? '#16a34a' : '#d97706', fontSize: 11 }}>{item.status}</Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

export default PrivacyScanScreen;
