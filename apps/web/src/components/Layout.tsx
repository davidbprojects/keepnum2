import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Button } from '@keepnum/ui-components';
import { useAuth } from '../context/AuthContext';

const navStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 24px',
  height: 56,
  borderBottom: '1px solid #e5e7eb',
  backgroundColor: '#fff',
  position: 'sticky' as const,
  top: 0,
  zIndex: 50,
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
};

const linkStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: '#64748b',
  fontSize: '0.875rem',
  fontWeight: 500,
  padding: '6px 12px',
  borderRadius: 6,
  transition: 'color 0.15s ease, background-color 0.15s ease',
};

const Layout: React.FC = () => {
  const { signOut } = useAuth();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <nav style={navStyle}>
        <Link to="/" style={{ ...linkStyle, fontWeight: 700, fontSize: '1rem', color: '#2563eb', padding: '6px 12px 6px 0', marginRight: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '1.25rem' }}>📱</span> KeepNum
          </span>
        </Link>
        <Link to="/" style={linkStyle}>Dashboard</Link>
        <Link to="/voicemail-inbox" style={linkStyle}>Voicemail</Link>
        <Link to="/unified-inbox" style={linkStyle}>Inbox</Link>
        <Link to="/virtual-numbers" style={linkStyle}>Numbers</Link>
        <Link to="/call-log" style={linkStyle}>Calls</Link>
        <Link to="/recordings" style={linkStyle}>Recordings</Link>
        <Link to="/conferences" style={linkStyle}>Conference</Link>
        <Link to="/greetings-marketplace" style={linkStyle}>Greetings</Link>
        <Link to="/privacy-scan" style={linkStyle}>Privacy</Link>
        <Link to="/billing" style={linkStyle}>Billing</Link>
        <Link to="/settings" style={linkStyle}>Settings</Link>
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
