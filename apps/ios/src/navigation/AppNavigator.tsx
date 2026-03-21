import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import NumberDetailScreen from '../screens/NumberDetailScreen';
import VoicemailsScreen from '../screens/VoicemailsScreen';
import SmsLogScreen from '../screens/SmsLogScreen';
import CallLogScreen from '../screens/CallLogScreen';
import SpamLogScreen from '../screens/SpamLogScreen';
import BillingScreen from '../screens/BillingScreen';
import SettingsScreen from '../screens/SettingsScreen';
import VoicemailInboxScreen from '../screens/VoicemailInboxScreen';
import VirtualNumbersScreen from '../screens/VirtualNumbersScreen';
import UnifiedInboxScreen from '../screens/UnifiedInboxScreen';
import ConferenceScreen from '../screens/ConferenceScreen';
import SettingsExtScreen from '../screens/SettingsExtScreen';
import IvrMenuScreen from '../screens/IvrMenuScreen';
import AutoReplyScreen from '../screens/AutoReplyScreen';
import PrivacyScanScreen from '../screens/PrivacyScanScreen';
import RecordingsScreen from '../screens/RecordingsScreen';
import GreetingsMarketplaceScreen from '../screens/GreetingsMarketplaceScreen';

export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  NumberDetail: { numberId: string };
  Voicemails: undefined;
  VoicemailInbox: undefined;
  VirtualNumbers: undefined;
  UnifiedInbox: undefined;
  Conference: undefined;
  SettingsExt: undefined;
  IvrMenus: undefined;
  AutoReply: undefined;
  PrivacyScan: undefined;
  Recordings: undefined;
  GreetingsMarketplace: undefined;
  SmsLog: undefined;
  CallLog: undefined;
  SpamLog: undefined;
  Billing: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerTintColor: '#2563eb' }}>
      {user ? (
        <>
          <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'My Numbers' }} />
          <Stack.Screen name="NumberDetail" component={NumberDetailScreen} options={{ title: 'Number Detail' }} />
          <Stack.Screen name="VoicemailInbox" component={VoicemailInboxScreen} options={{ title: 'Voicemail Inbox' }} />
          <Stack.Screen name="Voicemails" component={VoicemailsScreen} />
          <Stack.Screen name="VirtualNumbers" component={VirtualNumbersScreen} options={{ title: 'Virtual Numbers' }} />
          <Stack.Screen name="UnifiedInbox" component={UnifiedInboxScreen} options={{ title: 'Inbox' }} />
          <Stack.Screen name="Conference" component={ConferenceScreen} options={{ title: 'Conference' }} />
          <Stack.Screen name="SmsLog" component={SmsLogScreen} options={{ title: 'SMS Log' }} />
          <Stack.Screen name="CallLog" component={CallLogScreen} options={{ title: 'Call Log' }} />
          <Stack.Screen name="SpamLog" component={SpamLogScreen} options={{ title: 'Spam Log' }} />
          <Stack.Screen name="Billing" component={BillingScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="SettingsExt" component={SettingsExtScreen} options={{ title: 'Advanced Settings' }} />
          <Stack.Screen name="IvrMenus" component={IvrMenuScreen} options={{ title: 'IVR Menus' }} />
          <Stack.Screen name="AutoReply" component={AutoReplyScreen} options={{ title: 'Auto-Reply' }} />
          <Stack.Screen name="PrivacyScan" component={PrivacyScanScreen} options={{ title: 'Privacy Scan' }} />
          <Stack.Screen name="Recordings" component={RecordingsScreen} options={{ title: 'Recordings' }} />
          <Stack.Screen name="GreetingsMarketplace" component={GreetingsMarketplaceScreen} options={{ title: 'Greetings' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
