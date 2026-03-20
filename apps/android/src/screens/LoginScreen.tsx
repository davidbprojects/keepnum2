import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Button, Input } from '@keepnum/ui-components';
import { useAuth } from '../context/AuthContext';

const LoginScreen: React.FC = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      Alert.alert('Sign-in failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: 24,
          backgroundColor: '#f9fafb',
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 32, color: '#111827' }}>
          KeepNum
        </Text>
        <View style={{ gap: 12 }}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            testID="login-email"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            testID="login-password"
          />
          <Button
            label="Sign In"
            loading={loading}
            onPress={handleLogin}
            testID="login-submit"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
