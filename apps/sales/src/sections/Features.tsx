import React from 'react';
import { Card } from '@keepnum/ui-components';

interface Feature {
  title: string;
  description: string;
  icon: string;
}

const features: Feature[] = [
  {
    title: 'Call Forwarding',
    description:
      'Route inbound calls from any parked number to your phone so you never miss a call.',
    icon: '📞',
  },
  {
    title: 'Voicemail Transcription',
    description:
      'Voicemails are transcribed to text and emailed to you automatically.',
    icon: '📝',
  },
  {
    title: 'SMS Forwarding',
    description:
      'Receive inbound SMS via text or email — or both at the same time.',
    icon: '💬',
  },
  {
    title: 'Spam Filtering',
    description:
      'Block spam calls and messages automatically with our paid add-on.',
    icon: '🛡️',
  },
  {
    title: 'Call Screening',
    description:
      'Screen unknown callers before connecting — hear their name first.',
    icon: '🔍',
  },
  {
    title: 'Number Search',
    description:
      'Find the perfect number by area code, region, or pattern.',
    icon: '🔎',
  },
];

const sectionStyle: React.CSSProperties = {
  padding: '80px 24px',
  maxWidth: '1120px',
  margin: '0 auto',
};

const headingStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
  fontWeight: 700,
  margin: '0 0 12px 0',
  letterSpacing: '-0.02em',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: '20px',
};

const iconStyle: React.CSSProperties = {
  fontSize: '2rem',
  marginBottom: '12px',
  display: 'inline-block',
  width: 52,
  height: 52,
  lineHeight: '52px',
  textAlign: 'center',
  borderRadius: 14,
  backgroundColor: '#eff6ff',
};

export const Features: React.FC = () => (
  <section style={sectionStyle} aria-label="Features">
    <h2 style={headingStyle}>Everything You Need to Manage Your Numbers</h2>
    <p style={{ textAlign: 'center', color: '#64748b', maxWidth: 520, margin: '0 auto 48px', fontSize: '1.0625rem' }}>
      A complete toolkit for parking, forwarding, and protecting your phone numbers.
    </p>
    <div style={gridStyle}>
      {features.map((f) => (
        <Card key={f.title} padding="lg">
          <div style={iconStyle} aria-hidden="true">
            {f.icon}
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-0.01em' }}>
            {f.title}
          </h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.9375rem', lineHeight: 1.6 }}>
            {f.description}
          </p>
        </Card>
      ))}
    </div>
  </section>
);
