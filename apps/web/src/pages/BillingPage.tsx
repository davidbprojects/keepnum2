import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, Button } from '@keepnum/ui-components';
import {
  createBillingSession,
  getPublicPackages,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  reactivateSubscription,
  listInvoices,
} from '@keepnum/shared';
import type { Package, Invoice } from '@keepnum/shared';

const BillingPage: React.FC = () => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDropIn, setShowDropIn] = useState(false);
  const dropInRef = useRef<HTMLDivElement>(null);
  const dropInInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    Promise.all([getPublicPackages(), listInvoices()])
      .then(([pkgs, invs]) => { setPackages(pkgs); setInvoices(invs); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load billing data'))
      .finally(() => setLoading(false));
  }, []);

  const initAdyenDropIn = useCallback(async () => {
    if (!dropInRef.current) return;
    setError('');
    try {
      const { sessionId, sessionData } = await createBillingSession();
      const AdyenCheckout = (await import('@adyen/adyen-web')).default;
      const checkout = await AdyenCheckout({
        environment: 'test',
        clientKey: process.env.REACT_APP_ADYEN_CLIENT_KEY ?? '',
        session: { id: sessionId, sessionData },
        onPaymentCompleted: (result: { resultCode: string }) => {
          if (result.resultCode === 'Authorised') {
            setShowDropIn(false);
            listInvoices().then(setInvoices).catch(() => {});
          }
        },
        onError: (err: Error) => { setError(err.message ?? 'Payment failed'); },
      });
      if (dropInInstanceRef.current && typeof (dropInInstanceRef.current as { unmount: () => void }).unmount === 'function') {
        (dropInInstanceRef.current as { unmount: () => void }).unmount();
      }
      const dropin = checkout.create('dropin');
      dropin.mount(dropInRef.current);
      dropInInstanceRef.current = dropin;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialise payment');
    }
  }, []);

  const handleSubscribe = async (packageId: string) => {
    setSelectedPackageId(packageId);
    setShowDropIn(true);
    setTimeout(() => initAdyenDropIn(), 100);
  };

  const handleCancelSubscription = async (subscriptionId: string) => {
    try { await cancelSubscription(subscriptionId); listInvoices().then(setInvoices).catch(() => {}); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to cancel'); }
  };

  if (loading) return <p style={{ color: '#64748b', padding: 24 }}>Loading billing…</p>;

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
        💳 Billing & Subscription
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px' }}>Manage your plan and payment history.</p>
      {error && <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', color: '#dc2626', marginBottom: 16 }}>{error}</div>}

      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 16px', color: '#334155' }}>Available Plans</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
        {packages.map((pkg) => (
          <Card key={pkg.id} padding="md">
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#eff6ff', display: 'grid', placeItems: 'center', fontSize: '1.1rem', marginBottom: 12 }}>📦</div>
            <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '1rem' }}>{pkg.name}</h4>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 12px' }}>{pkg.description ?? 'No description'}</p>
            <p style={{ fontWeight: 700, fontSize: '1.5rem', color: '#2563eb', margin: '0 0 4px' }}>
              {pkg.price_monthly_cents === 0 ? 'Free' : `$${(pkg.price_monthly_cents / 100).toFixed(2)}`}
            </p>
            {pkg.price_monthly_cents > 0 && <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 16px' }}>per month</p>}
            <Button label={pkg.price_monthly_cents === 0 ? 'Get Started' : 'Subscribe'} size="sm" onClick={() => handleSubscribe(pkg.id)} />
          </Card>
        ))}
      </div>

      {showDropIn && (
        <Card title="Payment" padding="lg">
          <div ref={dropInRef} data-testid="adyen-dropin-container" />
        </Card>
      )}

      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 16px', color: '#334155' }}>Invoices</h3>
      {invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🧾</div>
          <p style={{ color: '#94a3b8', margin: 0 }}>No invoices yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {invoices.map((inv) => (
            <Card key={inv.id} padding="sm">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: inv.status === 'paid' ? '#ecfdf5' : '#fef2f2', display: 'grid', placeItems: 'center', fontSize: '1rem' }}>
                    {inv.status === 'paid' ? '✅' : '⏳'}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>${(inv.amount_cents / 100).toFixed(2)} {inv.currency}</span>
                    <span style={{ display: 'inline-block', marginLeft: 8, padding: '1px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 500, backgroundColor: inv.status === 'paid' ? '#ecfdf5' : '#fef2f2', color: inv.status === 'paid' ? '#059669' : '#dc2626' }}>{inv.status}</span>
                  </div>
                </div>
                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                  {new Date(inv.period_start).toLocaleDateString()} – {new Date(inv.period_end).toLocaleDateString()}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default BillingPage;
