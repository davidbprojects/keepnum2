import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AuthGuard from './components/AuthGuard';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import NumberDetailPage from './pages/NumberDetailPage';
import VoicemailsPage from './pages/VoicemailsPage';
import VoicemailDetailPage from './pages/VoicemailDetailPage';
import SmsLogPage from './pages/SmsLogPage';
import CallLogPage from './pages/CallLogPage';
import SpamLogPage from './pages/SpamLogPage';
import BillingPage from './pages/BillingPage';
import SettingsPage from './pages/SettingsPage';
import VoicemailInboxPage from './pages/VoicemailInboxPage';
import VirtualNumbersPage from './pages/VirtualNumbersPage';
import IvrMenuPage from './pages/IvrMenuPage';
import AutoReplyPage from './pages/AutoReplyPage';
import UnifiedInboxPage from './pages/UnifiedInboxPage';
import PrivacyScanPage from './pages/PrivacyScanPage';
import RecordingsPage from './pages/RecordingsPage';
import ConferencePage from './pages/ConferencePage';
import GreetingsMarketplacePage from './pages/GreetingsMarketplacePage';

const App: React.FC = () => (
  <AuthProvider>
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Authenticated routes */}
      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/numbers/:numberId" element={<NumberDetailPage />} />
          <Route path="/voicemails" element={<VoicemailsPage />} />
          <Route path="/voicemails/:voicemailId" element={<VoicemailDetailPage />} />
          <Route path="/voicemail-inbox" element={<VoicemailInboxPage />} />
          <Route path="/virtual-numbers" element={<VirtualNumbersPage />} />
          <Route path="/ivr-menus" element={<IvrMenuPage />} />
          <Route path="/auto-reply" element={<AutoReplyPage />} />
          <Route path="/unified-inbox" element={<UnifiedInboxPage />} />
          <Route path="/privacy-scan" element={<PrivacyScanPage />} />
          <Route path="/recordings" element={<RecordingsPage />} />
          <Route path="/conferences" element={<ConferencePage />} />
          <Route path="/greetings-marketplace" element={<GreetingsMarketplacePage />} />
          <Route path="/sms-log" element={<SmsLogPage />} />
          <Route path="/call-log" element={<CallLogPage />} />
          <Route path="/spam-log" element={<SpamLogPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  </AuthProvider>
);

export default App;
