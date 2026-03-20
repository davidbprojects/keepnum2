import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Input, Card } from '@keepnum/ui-components';
import { getUser, getUserBilling, setUserStatus, setUserPackage, setUserFeatureFlags } from '../api/adminApi';
import type { UserDetail } from '../api/adminApi';
import type { Invoice, Subscription, FlagValue } from '@keepnum/shared';

const sectionTitle: React.CSSProperties = { fontSize: '1rem', fontWeight: 600, margin: '0 0 12px', color: '#334155' };
const thStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: '0.85rem', color: '#334155' };
const infoRow = (label: string, value: string) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
    <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{label}</span>
    <span style={{ fontWeight: 500, fontSize: '0.85rem', color: '#0f172a' }}>{value}</span>
  </div>
);

const UserDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [billing, setBilling] = useState<{ invoices: Invoice[]; subscription: Subscription | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [packageId, setPackageId] = useState('');
  const [flagName, setFlagName] = useState('');
  const [flagValue, setFlagValue] = useState('');

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      try {
        const [u, b] = await Promise.all([getUser(userId), getUserBilling(userId)]);
        setUser(u); setBilling(b);
      } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load user'); }
      finally { setLoading(false); }
    })();
  }, [userId]);

  const handleToggleStatus = async () => {
    if (!userId || !user) return;
    await setUserStatus(userId, { enabled: !!user.deleted_at });
    setUser(await getUser(userId));
  };

  const handleAssignPackage = async () => {
    if (!userId || !packageId) return;
    await setUserPackage(userId, { packageId, effectiveImmediately: true });
    setUser(await getUser(userId));
  };

  const handleSetFlag = async () => {
    if (!userId || !flagName) return;
    let parsed: FlagValue;
    if (flagValue === 'true') parsed = true;
    else if (flagValue === 'false') parsed = false;
    else parsed = Number(flagValue) || 0;
    await setUserFeatureFlags(userId, { [flagName]: parsed });
  };

  if (loading) return <p style={{ color: '#64748b', padding: 24 }}>Loading…</p>;
  if (error) return <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626' }}>{error}</div>;
  if (!user) return <p style={{ color: '#64748b' }}>User not found</p>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>👤 {user.email}</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>User management</p>

      <div style={{ display: 'grid', gap: 16 }}>
        <Card padding="md">
          <h3 style={sectionTitle}>Account</h3>
          {infoRow('ID', user.id)}
          {infoRow('Cognito ID', user.cognito_id)}
          {infoRow('Created', new Date(user.created_at).toLocaleString())}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Status</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: user.deleted_at ? '#fef2f2' : '#ecfdf5', color: user.deleted_at ? '#dc2626' : '#059669' }}>
                {user.deleted_at ? 'Disabled' : 'Active'}
              </span>
              <Button label={user.deleted_at ? 'Enable' : 'Disable'} variant={user.deleted_at ? 'primary' : 'ghost'} size="sm" onClick={handleToggleStatus} />
            </div>
          </div>
        </Card>

        <Card padding="md">
          <h3 style={sectionTitle}>Usage Metrics</h3>
          {infoRow('Parked Numbers', String(user.parkedNumberCount ?? '—'))}
          {infoRow('Virtual Numbers', String((user as any).virtualNumberCount ?? '—'))}
          {infoRow('Voicemails', String(user.voicemailCount ?? '—'))}
          {infoRow('SMS Messages', String(user.smsCount ?? '—'))}
          {infoRow('Conferences', String((user as any).conferenceCount ?? '—'))}
          {infoRow('Privacy Scans', String((user as any).privacyScanCount ?? '—'))}
          {infoRow('Call Recordings', String((user as any).recordingCount ?? '—'))}
          {infoRow('Add-ons', user.addOns?.join(', ') || 'None')}
          {infoRow('Package', user.packageName ?? '—')}
        </Card>

        <Card padding="md">
          <h3 style={sectionTitle}>Assign Package</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <Input placeholder="Package ID" value={packageId} onChange={(e) => setPackageId(e.target.value)} />
            <Button label="Assign" variant="primary" size="sm" onClick={handleAssignPackage} />
          </div>
        </Card>

        <Card padding="md">
          <h3 style={sectionTitle}>Feature Flag Override</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <Input placeholder="Flag name" value={flagName} onChange={(e) => setFlagName(e.target.value)} />
            <Input placeholder="Value (true/false/number)" value={flagValue} onChange={(e) => setFlagValue(e.target.value)} />
            <Button label="Set Override" variant="primary" size="sm" onClick={handleSetFlag} />
          </div>
        </Card>

        <Card padding="md">
          <h3 style={sectionTitle}>Billing</h3>
          {billing?.subscription && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: '#eff6ff', color: '#2563eb' }}>
                {billing.subscription.status}
              </span>
              <span style={{ marginLeft: 8, fontSize: '0.85rem', color: '#64748b' }}>Package: {billing.subscription.package_id}</span>
            </div>
          )}
          {billing?.invoices && billing.invoices.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid #e2e8f0' }}><th style={thStyle}>Date</th><th style={thStyle}>Amount</th><th style={thStyle}>Status</th></tr></thead>
                <tbody>
                  {billing.invoices.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}>{new Date(inv.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>${(inv.amount_cents / 100).toFixed(2)} {inv.currency}</td>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: inv.status === 'paid' ? '#ecfdf5' : '#fef2f2', color: inv.status === 'paid' ? '#059669' : '#dc2626' }}>{inv.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No invoices found.</p>
          )}
        </Card>
      </div>
    </div>
  );
};

export default UserDetailPage;
