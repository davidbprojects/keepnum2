import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import {
  getPublicPackages,
  createSubscription,
  cancelSubscription,
  listInvoices,
} from '@keepnum/shared';
import type { Package, Invoice } from '@keepnum/shared';

/**
 * BillingScreen — subscription management for Android.
 * Note: Adyen Drop-in UI is web-only. On mobile, subscription actions
 * call the billing API directly. Payment method collection would use
 * Adyen's native SDK in a production build.
 */
const BillingScreen: React.FC = () => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getPublicPackages(), listInvoices()])
      .then(([pkgs, invs]) => {
        setPackages(pkgs);
        setInvoices(invs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load billing data'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (packageId: string) => {
    try {
      await createSubscription({ packageId });
      Alert.alert('Success', 'Subscription created');
      const invs = await listInvoices();
      setInvoices(invs);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Subscription failed');
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {error ? <Text style={{ color: '#dc2626' }}>{error}</Text> : null}

      <Text style={{ fontSize: 18, fontWeight: '600' }}>Available Plans</Text>
      {packages.map((pkg) => (
        <Card key={pkg.id} padding="md">
          <Text style={{ fontWeight: '600', fontSize: 16 }}>{pkg.name}</Text>
          <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
            {pkg.description ?? 'No description'}
          </Text>
          <Text style={{ fontWeight: '600', fontSize: 17, marginTop: 8 }}>
            ${(pkg.price_monthly_cents / 100).toFixed(2)}/mo
          </Text>
          <View style={{ marginTop: 8 }}>
            <Button label="Subscribe" size="sm" onPress={() => handleSubscribe(pkg.id)} />
          </View>
        </Card>
      ))}

      <Text style={{ fontSize: 18, fontWeight: '600', marginTop: 8 }}>Invoices</Text>
      {invoices.length === 0 ? (
        <Text style={{ color: '#6b7280' }}>No invoices yet.</Text>
      ) : (
        invoices.map((inv) => (
          <Card key={inv.id} padding="sm">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontWeight: '600', fontSize: 14 }}>
                  ${(inv.amount_cents / 100).toFixed(2)} {inv.currency}
                </Text>
                <Text style={{ fontSize: 12, color: inv.status === 'paid' ? '#059669' : '#dc2626' }}>
                  {inv.status}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: '#6b7280' }}>
                {new Date(inv.period_start).toLocaleDateString()} – {new Date(inv.period_end).toLocaleDateString()}
              </Text>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
};

export default BillingScreen;
