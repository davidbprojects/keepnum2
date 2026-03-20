import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';
import type { AddOnType } from '@keepnum/shared';

interface AddOnState {
  type: AddOnType;
  label: string;
  description: string;
  enabled: boolean;
}

const SettingsScreen: React.FC = () => {
  const [addOns, setAddOns] = useState<AddOnState[]>([
    {
      type: 'spam_filter',
      label: 'Spam Filter',
      description: 'Automatically detect and block spam calls and SMS using Telnyx reputation data.',
      enabled: false,
    },
    {
      type: 'call_screening',
      label: 'Call Screening',
      description: 'Screen unknown callers by prompting them to state their name before connecting.',
      enabled: false,
    },
  ]);

  const toggleAddOn = (type: AddOnType) => {
    setAddOns((prev) =>
      prev.map((a) => (a.type === type ? { ...a, enabled: !a.enabled } : a))
    );
    // In a full implementation, this would call the API to update the add-on state
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4 }}>Add-ons</Text>
      {addOns.map((addon) => (
        <Card key={addon.type} padding="md">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontWeight: '600', fontSize: 15 }}>{addon.label}</Text>
              <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                {addon.description}
              </Text>
            </View>
            <Button
              label={addon.enabled ? 'Disable' : 'Enable'}
              variant={addon.enabled ? 'danger' : 'primary'}
              size="sm"
              onPress={() => toggleAddOn(addon.type)}
            />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
};

export default SettingsScreen;
