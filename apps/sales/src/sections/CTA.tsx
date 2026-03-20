import React from 'react';
import { Button } from '@keepnum/ui-components';

const sectionStyle: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  padding: '80px 24px',
  background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #3b82f6 100%)',
  color: '#fff',
  textAlign: 'center',
};

const headingStyle: React.CSSProperties = {
  fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  margin: '0 0 16px 0',
};

const subStyle: React.CSSProperties = {
  fontSize: 'clamp(1rem, 2vw, 1.125rem)',
  margin: '0 0 36px 0',
  opacity: 0.9,
  maxWidth: '520px',
  lineHeight: 1.7,
};

export const CTA: React.FC = () => (
  <section style={sectionStyle} aria-label="Call to action">
    <div>
      <h2 style={headingStyle}>Ready to Park Your Numbers?</h2>
      <p style={subStyle}>
        Sign up in seconds — no credit card required for the free plan.
      </p>
      <Button
        label="Create Your Account →"
        size="lg"
        variant="secondary"
        onClick={() => {
          window.location.href = '/register';
        }}
        testID="cta-signup"
      />
    </div>
  </section>
);
