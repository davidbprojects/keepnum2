import React, { useState } from 'react';
import { Card, Button, Input } from '@keepnum/ui-components';
import type { AddOnType } from '@keepnum/shared';

interface AddOnState { type: AddOnType; label: string; description: string; enabled: boolean; icon: string; }
interface DndSchedule { id: string; name: string; days: string[]; startTime: string; endTime: string; timezone: string; enabled: boolean; }
interface NotifSetting { numberId: string; numberLabel: string; push: boolean; sms: boolean; }

const SettingsPage: React.FC = () => {
  const [addOns, setAddOns] = useState<AddOnState[]>([
    { type: 'spam_filter', label: 'Spam Filter', description: 'Automatically detect and block spam calls and SMS using Telnyx reputation data.', enabled: false, icon: '🛡️' },
    { type: 'call_screening', label: 'Call Screening', description: 'Screen unknown callers by prompting them to state their name before connecting.', enabled: false, icon: '📋' },
  ]);
  const [dndSchedules, setDndSchedules] = useState<DndSchedule[]>([]);
  const [showDndForm, setShowDndForm] = useState(false);
  const [dndName, setDndName] = useState('');
  const [dndDays, setDndDays] = useState('Mon,Tue,Wed,Thu,Fri');
  const [dndStart, setDndStart] = useState('22:00');
  const [dndEnd, setDndEnd] = useState('07:00');
  const [notifSettings] = useState<NotifSetting[]>([
    { numberId: '1', numberLabel: '+1 (555) 000-0001', push: true, sms: false },
  ]);
  const [callerIdEnabled, setCallerIdEnabled] = useState(true);
  const [vmSmsEnabled, setVmSmsEnabled] = useState(false);
  const [vmSmsNumber, setVmSmsNumber] = useState('');

  const toggleAddOn = (type: AddOnType) => setAddOns(prev => prev.map(a => a.type === type ? { ...a, enabled: !a.enabled } : a));
  const addDnd = () => {
    if (!dndName) return;
    setDndSchedules(prev => [...prev, { id: Date.now().toString(), name: dndName, days: dndDays.split(','), startTime: dndStart, endTime: dndEnd, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: true }]);
    setDndName(''); setShowDndForm(false);
  };
  const toggleDnd = (id: string) => setDndSchedules(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  const removeDnd = (id: string) => setDndSchedules(prev => prev.filter(s => s.id !== id));

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>⚙️ Settings</h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>Manage your add-ons, notifications, and preferences.</p>

      {/* Add-ons */}
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 12px', color: '#334155' }}>Add-ons</h3>
      <div style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
        {addOns.map(addon => (
          <Card key={addon.type} padding="md">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: addon.enabled ? '#ecfdf5' : '#f1f5f9', display: 'grid', placeItems: 'center', fontSize: '1.2rem', flexShrink: 0 }}>{addon.icon}</div>
                <div><p style={{ fontWeight: 600, margin: '0 0 4px', color: '#0f172a' }}>{addon.label}</p><p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>{addon.description}</p></div>
              </div>
              <Button label={addon.enabled ? 'Disable' : 'Enable'} variant={addon.enabled ? 'danger' : 'primary'} size="sm" onClick={() => toggleAddOn(addon.type)} />
            </div>
          </Card>
        ))}
      </div>

      {/* DND Schedules */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#334155' }}>🌙 Do Not Disturb Schedules</h3>
        <Button label="Add Schedule" variant="primary" size="sm" onClick={() => setShowDndForm(!showDndForm)} />
      </div>
      {showDndForm && (
        <Card padding="md">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label style={{ fontSize: '0.8rem', color: '#64748b' }}>Name</label><Input value={dndName} onChange={e => setDndName(e.target.value)} placeholder="e.g. Weeknight" /></div>
            <div><label style={{ fontSize: '0.8rem', color: '#64748b' }}>Days</label><Input value={dndDays} onChange={e => setDndDays(e.target.value)} placeholder="Mon,Tue,..." /></div>
            <div><label style={{ fontSize: '0.8rem', color: '#64748b' }}>Start</label><Input value={dndStart} onChange={e => setDndStart(e.target.value)} placeholder="22:00" /></div>
            <div><label style={{ fontSize: '0.8rem', color: '#64748b' }}>End</label><Input value={dndEnd} onChange={e => setDndEnd(e.target.value)} placeholder="07:00" /></div>
            <Button label="Save" variant="primary" size="sm" onClick={addDnd} />
          </div>
        </Card>
      )}
      <div style={{ display: 'grid', gap: 8, marginBottom: 32 }}>
        {dndSchedules.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No DND schedules configured.</p> : dndSchedules.map(s => (
          <Card key={s.id} padding="sm">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><span style={{ fontWeight: 500 }}>{s.name}</span><span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: 8 }}>{s.days.join(', ')} · {s.startTime}–{s.endTime}</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button label={s.enabled ? 'On' : 'Off'} variant={s.enabled ? 'primary' : 'ghost'} size="sm" onClick={() => toggleDnd(s.id)} />
                <Button label="Remove" variant="ghost" size="sm" onClick={() => removeDnd(s.id)} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Notification Settings */}
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 12px', color: '#334155' }}>🔔 Notification Settings</h3>
      <div style={{ display: 'grid', gap: 8, marginBottom: 32 }}>
        {notifSettings.map(ns => (
          <Card key={ns.numberId} padding="sm">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>{ns.numberLabel}</span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', color: '#64748b' }}>
                  <input type="checkbox" defaultChecked={ns.push} /> Push
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', color: '#64748b' }}>
                  <input type="checkbox" defaultChecked={ns.sms} /> SMS
                </label>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Caller ID */}
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 12px', color: '#334155' }}>🔍 Caller ID Lookup</h3>
      <Card padding="md">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><p style={{ fontWeight: 500, margin: '0 0 4px' }}>Automatic Caller ID</p><p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Look up caller name, location, and spam score for incoming calls.</p></div>
          <Button label={callerIdEnabled ? 'Enabled' : 'Disabled'} variant={callerIdEnabled ? 'primary' : 'ghost'} size="sm" onClick={() => setCallerIdEnabled(!callerIdEnabled)} />
        </div>
      </Card>

      {/* Voicemail-to-SMS */}
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 12px', color: '#334155' }}>💬 Voicemail-to-SMS</h3>
      <Card padding="md">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: vmSmsEnabled ? 12 : 0 }}>
          <div><p style={{ fontWeight: 500, margin: '0 0 4px' }}>Forward Transcriptions via SMS</p><p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Receive voicemail transcriptions as text messages.</p></div>
          <Button label={vmSmsEnabled ? 'Enabled' : 'Disabled'} variant={vmSmsEnabled ? 'primary' : 'ghost'} size="sm" onClick={() => setVmSmsEnabled(!vmSmsEnabled)} />
        </div>
        {vmSmsEnabled && (
          <div style={{ display: 'flex', gap: 10 }}>
            <Input value={vmSmsNumber} onChange={e => setVmSmsNumber(e.target.value)} placeholder="Destination phone number" />
            <Button label="Save" variant="primary" size="sm" onClick={() => {}} />
          </div>
        )}
      </Card>

      {/* Contacts & Tiers */}
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 12px', color: '#334155' }}>👥 Contacts & Smart Routing</h3>
      <Card padding="md">
        <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#64748b' }}>Import contacts and configure tier-based call routing (VIP, Known, Unknown).</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button label="Import Contacts" variant="primary" size="sm" onClick={() => {}} />
          <Button label="Manage Tiers" variant="ghost" size="sm" onClick={() => {}} />
        </div>
      </Card>
    </div>
  );
};

export default SettingsPage;
