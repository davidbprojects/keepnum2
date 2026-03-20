import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Button, Input } from '@keepnum/ui-components';
import {
  setForwardingRule,
  setRetentionPolicy,
  setGreeting,
  addCallerRule,
  deleteCallerRule,
  addToBlockList,
  removeFromBlockList,
} from '@keepnum/shared';
import type { RetentionPolicy, CallerRuleAction, GreetingType } from '@keepnum/shared';

type Tab = 'forwarding' | 'retention' | 'greeting' | 'caller-rules' | 'block-list';

const selectStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  backgroundColor: '#fff',
  color: '#0f172a',
  transition: 'border-color 0.15s ease',
  width: '100%',
};

const tabActiveStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
  backgroundColor: '#2563eb',
  color: '#fff',
  transition: 'all 0.15s ease',
};

const tabInactiveStyle: React.CSSProperties = {
  ...tabActiveStyle,
  backgroundColor: '#f1f5f9',
  color: '#64748b',
  fontWeight: 500,
};

const NumberDetailPage: React.FC = () => {
  const { numberId } = useParams<{ numberId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('forwarding');

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'forwarding', label: 'Forwarding', icon: '↗️' },
    { key: 'retention', label: 'Retention', icon: '🗄️' },
    { key: 'greeting', label: 'Greeting', icon: '👋' },
    { key: 'caller-rules', label: 'Caller Rules', icon: '📋' },
    { key: 'block-list', label: 'Block List', icon: '🚫' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          📞 Number Details
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>{numberId}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            style={activeTab === t.key ? tabActiveStyle : tabInactiveStyle}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <Card padding="lg">
        {activeTab === 'forwarding' && <ForwardingTab numberId={numberId!} />}
        {activeTab === 'retention' && <RetentionTab numberId={numberId!} />}
        {activeTab === 'greeting' && <GreetingTab numberId={numberId!} />}
        {activeTab === 'caller-rules' && <CallerRulesTab numberId={numberId!} />}
        {activeTab === 'block-list' && <BlockListTab numberId={numberId!} />}
      </Card>
    </div>
  );
};

/* ── Forwarding Tab ─────────────────────────────────────────────────────── */
const ForwardingTab: React.FC<{ numberId: string }> = ({ numberId }) => {
  const [destination, setDestination] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await setForwardingRule(numberId, { destination, enabled }); } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input label="Forward to (E.164)" type="tel" value={destination} onChangeText={setDestination} placeholder="+1234567890" testID="fwd-dest" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: '#334155' }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 16, height: 16 }} />
        Enabled
      </label>
      <Button label="Save Forwarding Rule" loading={saving} onClick={handleSave} />
    </div>
  );
};

/* ── Retention Tab ──────────────────────────────────────────────────────── */
const RetentionTab: React.FC<{ numberId: string }> = ({ numberId }) => {
  const [policy, setPolicy] = useState<RetentionPolicy>('30d');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await setRetentionPolicy(numberId, { policy }); } finally { setSaving(false); }
  };

  const options: RetentionPolicy[] = ['30d', '60d', '90d', 'forever'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>Retention Policy</label>
      <select value={policy} onChange={(e) => setPolicy(e.target.value as RetentionPolicy)} style={selectStyle}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <Button label="Save Retention Policy" loading={saving} onClick={handleSave} />
    </div>
  );
};

/* ── Greeting Tab ───────────────────────────────────────────────────────── */
const GreetingTab: React.FC<{ numberId: string }> = ({ numberId }) => {
  const [greetingType, setGreetingType] = useState<GreetingType>('default');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await setGreeting(numberId, { greetingType, text: text || undefined }); } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>Greeting Type</label>
      <select value={greetingType} onChange={(e) => setGreetingType(e.target.value as GreetingType)} style={selectStyle}>
        <option value="default">Default</option>
        <option value="smart_known">Smart (Known Callers)</option>
        <option value="smart_unknown">Smart (Unknown Callers)</option>
      </select>
      <Input label="TTS Text (optional)" value={text} onChangeText={setText} placeholder="Hi, leave a message…" testID="greeting-text" />
      <Button label="Save Greeting" loading={saving} onClick={handleSave} />
    </div>
  );
};

/* ── Caller Rules Tab ───────────────────────────────────────────────────── */
const CallerRulesTab: React.FC<{ numberId: string }> = ({ numberId }) => {
  const [callerId, setCallerId] = useState('');
  const [action, setAction] = useState<CallerRuleAction>('voicemail');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    setSaving(true);
    try { await addCallerRule(numberId, { callerId, action }); setCallerId(''); } finally { setSaving(false); }
  };

  const handleDelete = async (ruleId: string) => { await deleteCallerRule(numberId, ruleId); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input label="Caller ID (E.164)" type="tel" value={callerId} onChangeText={setCallerId} placeholder="+1234567890" testID="rule-caller" />
      <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>Action</label>
      <select value={action} onChange={(e) => setAction(e.target.value as CallerRuleAction)} style={selectStyle}>
        <option value="voicemail">Voicemail</option>
        <option value="disconnect">Disconnect</option>
        <option value="forward">Forward</option>
        <option value="custom_greeting">Custom Greeting</option>
      </select>
      <Button label="Add Caller Rule" loading={saving} onClick={handleAdd} />
      <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Existing rules will appear here. Use the API to list and delete rules.</p>
    </div>
  );
};

/* ── Block List Tab ─────────────────────────────────────────────────────── */
const BlockListTab: React.FC<{ numberId: string }> = ({ numberId }) => {
  const [callerId, setCallerId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    setSaving(true);
    try { await addToBlockList(numberId, { callerId }); setCallerId(''); } finally { setSaving(false); }
  };

  const handleRemove = async (id: string) => { await removeFromBlockList(numberId, id); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input label="Block Caller ID (E.164)" type="tel" value={callerId} onChangeText={setCallerId} placeholder="+1234567890" testID="block-caller" />
      <Button label="Add to Block List" loading={saving} onClick={handleAdd} />
      <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Blocked numbers will appear here.</p>
    </div>
  );
};

export default NumberDetailPage;
