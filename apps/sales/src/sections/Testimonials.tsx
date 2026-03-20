import React from 'react';

const testimonials = [
  {
    name: 'Sarah M.',
    role: 'Freelance Consultant',
    quote: 'KeepNum saved me from losing my business number when I switched carriers. Setup took 30 seconds.',
    emoji: '💼',
  },
  {
    name: 'James T.',
    role: 'Small Business Owner',
    quote: 'I park three numbers for different ventures. The voicemail transcription alone is worth it.',
    emoji: '🏪',
  },
  {
    name: 'Priya K.',
    role: 'Digital Nomad',
    quote: 'I travel full-time and KeepNum keeps my US number alive with zero hassle. Love the spam filter.',
    emoji: '✈️',
  },
];

const sectionStyle: React.CSSProperties = {
  padding: '80px 24px',
  backgroundColor: '#f8fafc',
  textAlign: 'center',
};

const headingStyle: React.CSSProperties = {
  fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  margin: '0 0 12px 0',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  color: '#64748b',
  margin: '0 auto 48px',
  maxWidth: '480px',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '24px',
  maxWidth: '1120px',
  margin: '0 auto',
  textAlign: 'left',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: 14,
  padding: '28px 24px',
  border: '1px solid #e2e8f0',
  transition: 'box-shadow 0.2s ease',
};

const quoteStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  color: '#334155',
  lineHeight: 1.7,
  margin: '16px 0 20px',
};

const nameStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '0.9rem',
  color: '#0f172a',
  margin: 0,
};

const roleStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: '#94a3b8',
  margin: '2px 0 0',
};

export const Testimonials: React.FC = () => (
  <section style={sectionStyle} aria-label="Testimonials">
    <h2 style={headingStyle}>What Our Customers Say</h2>
    <p style={subtitleStyle}>Trusted by freelancers, small businesses, and travelers worldwide.</p>
    <div style={gridStyle}>
      {testimonials.map((t) => (
        <div key={t.name} style={cardStyle}>
          <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#eff6ff', display: 'grid', placeItems: 'center', fontSize: '1.25rem' }}>
            {t.emoji}
          </div>
          <p style={quoteStyle}>"{t.quote}"</p>
          <p style={nameStyle}>{t.name}</p>
          <p style={roleStyle}>{t.role}</p>
        </div>
      ))}
    </div>
  </section>
);
