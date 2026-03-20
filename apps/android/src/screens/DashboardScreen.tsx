import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@keepnum/ui-components';
import { listNumbers } from '@keepnum/shared';
import type { ParkedNumber } from '@keepnum/shared';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

const DashboardScreen: React.FC<Props> = ({ navigation }) => {
  const { signOut } = useAuth();
  const [numbers, setNumbers] = useState<ParkedNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchNumbers = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listNumbers();
      setNumbers(items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load numbers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNumbers(); }, [fetchNumbers]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Text style={{ color: '#2563eb', fontSize: 15 }}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={signOut}>
            <Text style={{ color: '#dc2626', fontSize: 15 }}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, signOut]);

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

  const navItems = [
    { label: 'Voicemails', screen: 'Voicemails' as const },
    { label: 'SMS Log', screen: 'SmsLog' as const },
    { label: 'Call Log', screen: 'CallLog' as const },
    { label: 'Spam Log', screen: 'SpamLog' as const },
    { label: 'Billing', screen: 'Billing' as const },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <FlatList
        data={numbers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {navItems.map((nav) => (
              <TouchableOpacity
                key={nav.screen}
                onPress={() => navigation.navigate(nav.screen)}
                style={{ backgroundColor: '#2563eb', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6 }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{nav.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        }
        ListEmptyComponent={
          <Card padding="lg">
            <Text style={{ textAlign: 'center', color: '#6b7280' }}>No parked numbers yet. Add one to get started.</Text>
          </Card>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate('NumberDetail', { numberId: item.id })}>
            <Card padding="md">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 17, fontWeight: '600' }}>{item.phone_number}</Text>
                  <Text style={{ fontSize: 12, color: item.status === 'active' ? '#059669' : '#6b7280', marginTop: 2 }}>
                    {item.status}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>Retention: {item.retention_policy}</Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

export default DashboardScreen;
