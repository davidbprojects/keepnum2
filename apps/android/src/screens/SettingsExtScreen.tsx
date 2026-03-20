import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch } from 'react-native';
import { Card, Button } from '@keepnum/ui-components';

const SettingsExtScreen: React.FC = () => {
  const [callerIdEnabled, setCallerIdEnabled] = useState(true);
  const [vmSmsEnabled, setVmSmsEnabled] = useState(false);
  const [vmSmsNumber, setVmSmsNumber] = useState('');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [smsNotifEnabled, setSmsNotifEnabled] = useState(false);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4 }}>Advanced Settings</Text>

      <Card padding="md">
        <Text style={{ fontWeight: '600', fontSize: 15, marginBottom: 8 }}>🌙 Do Not Disturb</Text>
        <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Configure DND schedules per number from the web app.</Text>
        <Button label="Manage DND" variant="ghost" size="sm" onPress={() => {}} />
      </Card>

      <Card padding="md">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontWeight: '600', fontSize: 15 }}>🔍 Caller ID Lookup</Text>
            <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Look up caller name and spam score.</Text>
          </View>
          <Switch value={callerIdEnabled} onValueChange={setCallerIdEnabled} />
        </View>
      </Card>

      <Card padding="md">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: vmSmsEnabled ? 10 : 0 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontWeight: '600', fontSize: 15 }}>💬 Voicemail-to-SMS</Text>
            <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Forward transcriptions via text.</Text>
          </View>
          <Switch value={vmSmsEnabled} onValueChange={setVmSmsEnabled} />
        </View>
        {vmSmsEnabled && (
          <TextInput value={vmSmsNumber} onChangeText={setVmSmsNumber} placeholder="Destination number" style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' }} />
        )}
      </Card>

      <Card padding="md">
        <Text style={{ fontWeight: '600', fontSize: 15, marginBottom: 8 }}>🔔 Notifications</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 14, color: '#334155' }}>Push Notifications</Text>
          <Switch value={pushEnabled} onValueChange={setPushEnabled} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: '#334155' }}>SMS Notifications</Text>
          <Switch value={smsNotifEnabled} onValueChange={setSmsNotifEnabled} />
        </View>
      </Card>

      <Card padding="md">
        <Text style={{ fontWeight: '600', fontSize: 15, marginBottom: 8 }}>👥 Contacts & Smart Routing</Text>
        <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Import contacts and configure tier-based routing.</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Import" variant="primary" size="sm" onPress={() => {}} />
          <Button label="Manage Tiers" variant="ghost" size="sm" onPress={() => {}} />
        </View>
      </Card>
    </ScrollView>
  );
};
export default SettingsExtScreen;
