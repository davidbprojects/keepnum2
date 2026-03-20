/**
 * KeepNum Android App — React Native entry point.
 * Configures Amplify with the @aws-amplify/react-native adapter,
 * wraps the app in AuthProvider, and renders the navigation stack.
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import '@aws-amplify/react-native';
import { configureAmplify } from '@keepnum/shared';
import { AuthProvider } from './context/AuthContext';
import AppNavigator from './navigation/AppNavigator';

// Initialise Amplify Libraries with shared config (Cognito + API Gateway)
configureAmplify();

const App: React.FC = () => (
  <NavigationContainer>
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  </NavigationContainer>
);

export default App;
