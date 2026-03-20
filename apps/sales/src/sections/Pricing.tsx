import React from 'react';
import useSWR from 'swr';
import { Card, Button } from '@keepnum/ui-components';
import type { Package } from '@keepnum/shared/src/types/aurora';

const API_BASE = process.env.REACT_APP_API_BASE ?? '';

const fetcher = (url: string): Promise<Package[]> =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<Package[]>;
  });

/* ── Fallback shown when the API is unavailable ─────────────────────── */

const PricingFallback: React.FC = () => (
  <div
    style={{
      textAlign: 'center',
      padding: '48px 16px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
    }}
    role="alert"
  >
    <p style={{ fontSize: '1.125rem', color: '#6b7280', margin: 0 }}>
      Pricing information is temporarily unavailable. Please check back soon.
    </p>
  </div>
);

/* ── Section styles ─────────────────────────────────────────────────── */

const sectionStyle: React.CSSProperties = {
  padding: '80px 24px',
  maxWidth: '1120px',
  margin: '0 auto',
};

const headingStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  margin: '0 0 12px 0',
};

const subtitleStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '1.05rem',
  color: '#64748b',
  margin: '0 0 48px 0',
  maxWidth: '520px',
  marginLeft: 'auto',
  marginRight: 'auto',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '24px',
};

const priceStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 800,
  margin: '0 0 4px 0',
  color: '#2563eb',
};

const perMonthStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#94a3b8',
  margin: '0 0 16px 0',
};

const descStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  color: '#64748b',
  margin: '0 0 24px 0',
  minHeight: '48px',
  lineHeight: 1.6,
};

/* ── Component ──────────────────────────────────────────────────────── */

export const Pricing: React.FC = () => {
  const { data: packages, error } = useSWR<Package[]>(
    `${API_BASE}/packages/public`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const isLoading = !packages && !error;

  return (
    <section style={sectionStyle} aria-label="Pricing">
      <h2 style={headingStyle}>Simple, Transparent Pricing</h2>
      <p style={subtitleStyle}>No hidden fees. Pick a plan that works for you and upgrade anytime.</p>

      {error && <PricingFallback />}

      {isLoading && (
        <p style={{ textAlign: 'center', color: '#6b7280' }}>
          Loading pricing…
        </p>
      )}

      {packages && packages.length > 0 && (
        <div style={gridStyle}>
          {packages.map((pkg) => (
            <Card key={pkg.id} padding="lg">
              <h3
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                }}
              >
                {pkg.name}
              </h3>
              <p style={priceStyle}>
                {pkg.price_monthly_cents === 0
                  ? 'Free'
                  : `$${(pkg.price_monthly_cents / 100).toFixed(2)}`}
              </p>
              {pkg.price_monthly_cents > 0 && (
                <p style={perMonthStyle}>per month</p>
              )}
              <p style={descStyle}>{pkg.description ?? ''}</p>
              <Button
                label={pkg.price_monthly_cents === 0 ? 'Get Started' : 'Subscribe'}
                variant="primary"
                size="md"
                onClick={() => {
                  window.location.href = '/register';
                }}
                testID={`pricing-cta-${pkg.id}`}
              />
            </Card>
          ))}
        </div>
      )}
    </section>
  );
};
