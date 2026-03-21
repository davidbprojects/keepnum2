import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Button } from '@keepnum/ui-components';
import { useAuth } from '../context/AuthContext';

const navStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 24px',
  height: 56,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  backgroundColor: '#0f172a',
  position: 'sticky' as const,
  top: 0,
  zIndex: 50,
};

const linkStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: '#94a3b8',
  fontSize: '0.875rem',
  fontWeight: 500,
  padding: '6px 12px',
  borderRadius: 6,
  transition: 'color 0.15s ease, background-color 0.15s ease',
};

const Layout: React.FC = () => {
  const { signOut } = useAuth();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <nav style={navStyle}>
        <Link to="/" style={{ ...linkStyle, fontWeight: 700, fontSize: '1rem', color: '#60a5fa', marginRight: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '1.125rem' }}>⚙️</span> KeepNum Admin
          </span>
        </Link>
        <Link to="/" style={linkStyle}>Users</Link>
        <Link to="/packages" style={linkStyle}>Packages</Link>
        <Link to="/feature-flags" style={linkStyle}>Feature Flags</Link>
        <Link to="/greetings" style={linkStyle}>Greetings</Link>
        <Link to="/audit-log" style={linkStyle}>Audit Log</Link>
        <Link to="/logs" style={linkStyle}>Logs</Link>
        <div style={{ marginLeft: 'auto' }}>
          <Button label="Sign Out" variant="ghost" size="sm" onClick={signOut} />
        </div>
      </nav>
      <main style={{ padding: '32px 24px', maxWidth: 1120, margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
