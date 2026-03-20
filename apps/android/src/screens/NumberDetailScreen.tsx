import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Card } from '@keepnum/ui-components';
import {
  setForwardingRule,
  setRetentionPolicy,
  setGreeting,
  addCallerRule,
  addToBlockList,
} from '@keepnum/shared';
import type { RetentionPolicy, CallerRuleAction, GreetingType } from '@keepnum/shared';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'NumberDetail'>;
type Tab = 'forwarding' | 'retention' | 'greeting' | 'caller-rules' | 'block-list';

const TABS: { key: Tab; label: string }[] = [
  { key: 'forwarding', label: 'Forwarding' },
  { key: 'retention', label: 'Retention' },
  { key: 'greeting', label: 'Greeting' },
  { key: 'caller-rules', label: 'Rules' },
  { key: 'block-list', label: 'Block List' },
];

const NumberDetailScreen: React.FC<Props> = ({ route }) => {
  const { numberId } = route.params;
  const [activeTab, setActiveTab] = useState<Tab>('forwarding');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Number: {numberId}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setActiveTab(t.key)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: activeTab === t.key ? '#2563eb' : '#e5e7eb',
            }}
          >
            <Text style={{ color: activeTab === t.key ? '#fff' : '#111827', fontSize: 13, fontWeight: '600' }}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Card padding="lg">
        {activeTab === 'forwarding' && <ForwardingTab numberId={numberId} />}
        {activeTab === 'retention' && <RetentionTab numberId={numberId} />}
        {activeTab === 'greeting' && <GreetingTab numberId={numberId} />}
        {activeTab === 'caller-rules' && <CallerRulesTab numberId={numberId} />}
        {activeTab === 'block-list' && <BlockListTab numberId={numberId} />}
      </Card>
    </ScrollView>
  );
};

/* ── Forwarding Tab ─────────────────────────────────────────────────────── */
const ForwardingTab: React.FC<{ numberId: string }> = ({ numberId }) => {
  const [destination, setDestination] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setForwardingRule(numberId, { destination, enabled });
      Alert.alert('Saved', 'Forwarding rule updated');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Input label="Forward to (E.164)" type="tel" value={destination} onChangeText={setDestination} placeholder="+1234567890" testID="fwd-dest" />
      <TouchableOpacity onPress={() => setEnabled(!enabled)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: enabled ? '#2563eb' : '#fff' }} />
        <Text>Enabled</Text>
      </TouchableOpacity>
      <Button label="Save Forwarding Rule" loading={saving} onPress={handleSave} />
    </View>
  );
};

/* ── Retention Tab ──────────────────────────────────────────────────────── */
const RetentionTab: React.FC<{ numberId: string }> = ({ numberId }) => {
  const [policy, setPolicy] = useState<RetentionPolicy>('30d');
  const [saving, setSaving] = useState(false);
  const options: RetentionPolicy[] = ['30d', '60d', '90d', 'forever'];

  const handleSave = async () => {
    setSaving(true);
    try {
      await setRetentionPolicy(numberId, { policy });
      Alert.alert('Saved', 'Retention policy updated');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontWeight: '500' }}>Retention Policy</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((o) => (
          <TouchableOpacity
            key={o}
            onPress={() => setPolicy(o)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: policy === o ? '#2563eb' : '#e5e7eb',
            }}
          >
            <Text style={{ color: policy === o ? '#fff' : '#111827', fontSize: 13 }}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Button label="Save Retention Policy" loading={saving} onPress={handleSave} />
    </View>
  );
};

/* ── Greeting Tab ───────────────────────────────────────────────────────── */
const GreetingTab: React.FC<{ numberId: string }> = ({ numberId }) => {
  const [greetingType, setGreetingType] = useState<GreetingType>('default');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const types: { key: GreetingType; label: string }[] = [
    { key: 'default', label: 'Default' },
    { key: 'smart_known', label: 'Smart (Known)' },
    { key: 'smart_unknown', label: 'Smart (Unknown)' },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await setGreeting(numberId, { greetingType, text: text || undefined });
      Alert.alert('Saved', 'Greeting updated');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontWeight: '500' }}>Greeting Type</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {types.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setGreetingType(t.key)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: greetingType === t.key ? '#2563eb' : '#e5e7eb',
            }}
          >
            <Text style={{ color: greetingType === t.key ? '#fff' : '#111827', fontSize: 13 }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Input label="TTS Text (optional)" value={text} onChangeText={setText} placeholder="Hi, leave a message…" testID="greeting-text" />
      <Button label="Save Greeting" loading={saving} onPress={handleSave} />
    </View>
  );
};

/* ── Caller Rules Tab ───────────────────────────────────────────────────── */
const CallerRulesTab: React.FC<{ numberId: string }> = ({ numberId }) => {
  const [callerId, setCallerId] = useState('');
  const [action, setAction] = useState<CallerRuleAction>('voicemail');
  const [saving, setSaving] = useState(false);
  const actions: { key: CallerRuleAction; label: string }[] = [
    { key: 'voicemail', label: 'Voicemail' },
    { key: 'disconnect', label: 'Disconnect' },
    { key: 'forward', label: 'Forward' },
    { key: 'custom_greeting', label: 'Custom' },
  ];

  const handleAdd = async () => {
    if (!callerId) { Alert.alert('Error', 'Enter a caller ID'); return; }
    setSaving(true);
    try {
      await addCallerRule(numberId, { callerId, action });
      setCallerId('');
      Alert.alert('Added', 'Caller rule created');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Input label="Caller ID (E.164)" type="tel" value={callerId} onChangeText={setCallerId} placeholder="+1234567890" testID="rule-caller" />
      <Text style={{ fontWeight: '500' }}>Action</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {actions.map((a) => (
          <TouchableOpacity
            key={a.key}
            onPress={() => setAction(a.key)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: action === a.key ? '#2563eb' : '#e5e7eb',
            }}
          >
            <Text style={{ color: action === a.key ? '#fff' : '#111827', fontSize: 13 }}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Button label="Add Caller Rule" loading={saving} onPress={handleAdd} />
    </View>
  );
};

/* ── Block List Tab ─────────────────────────────────────────────────────── */
const BlockListTab: React.FC<{ numberId: string }> = ({ numberId }) => {
  const [callerId, setCallerId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!callerId) { Alert.alert('Error', 'Enter a caller ID'); return; }
    setSaving(true);
    try {
      await addToBlockList(numberId, { callerId });
      setCallerId('');
      Alert.alert('Added', 'Number blocked');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to block');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Input label="Block Caller ID (E.164)" type="tel" value={callerId} onChangeText={setCallerId} placeholder="+1234567890" testID="block-caller" />
      <Button label="Add to Block List" loading={saving} onPress={handleAdd} />
    </View>
  );
};

export default NumberDetailScreen;
