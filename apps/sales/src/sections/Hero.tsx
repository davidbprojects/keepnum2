import React from 'react';
import { Button } from '@keepnum/ui-components';

const WEB_APP_URL = '/register';

const sectionStyle: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  minHeight: '80vh',
  padding: '80px 24px',
  background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #3b82f6 100%)',
  color: '#fff',
  textAlign: 'center',
  position: 'relative' as const,
  overflow: 'hidden',
};

const headingStyle: React.CSSProperties = {
  fontSize: 'clamp(2.25rem, 5vw, 3.75rem)',
  fontWeight: 800,
  margin: '0 0 20px 0',
  maxWidth: '720px',
  letterSpacing: '-0.03em',
  lineHeight: 1.1,
};

const subheadingStyle: React.CSSProperties = {
  fontSize: 'clamp(1.0625rem, 2.5vw, 1.25rem)',
  margin: '0 0 40px 0',
  maxWidth: '560px',
  opacity: 0.85,
  lineHeight: 1.6,
};

export const Hero: React.FC = () => (
  <section style={sectionStyle} aria-label="Hero">
    <div>
      <div style={{ fontSize: '3rem', marginBottom: 16 }}>📱</div>
      <h1 style={headingStyle}>Park Your Phone Numbers</h1>
      <p style={subheadingStyle}>
        Keep your numbers active without a carrier plan. Forward calls, receive
        voicemail transcriptions by email, filter spam, and more.
      </p>
      <Button
        label="Get Started Free →"
        size="lg"
        variant="secondary"
        onClick={() => {
          window.location.href = WEB_APP_URL;
        }}
        testID="hero-cta"
      />
    </div>
  </section>
);
