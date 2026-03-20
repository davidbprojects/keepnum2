import React from 'react';
import { Hero } from './sections/Hero';
import { Features } from './sections/Features';
import { Pricing } from './sections/Pricing';
import { Testimonials } from './sections/Testimonials';
import { CTA } from './sections/CTA';

const globalStyles: React.CSSProperties = {
  margin: 0,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  color: '#0f172a',
  lineHeight: 1.6,
};

const App: React.FC = () => (
  <div style={globalStyles}>
    <Hero />
    <Features />
    <Pricing />
    <Testimonials />
    <CTA />
    <footer
      style={{
        textAlign: 'center',
        padding: '32px 24px',
        fontSize: '0.85rem',
        color: '#94a3b8',
        borderTop: '1px solid #e2e8f0',
        backgroundColor: '#fff',
        letterSpacing: '0.01em',
      }}
    >
      <span style={{ fontSize: '1rem', marginRight: 6 }}>📞</span>
      &copy; {new Date().getFullYear()} KeepNum. All rights reserved.
    </footer>
  </div>
);

export default App;
