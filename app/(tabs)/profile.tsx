import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import { useThemeColor } from '@/hooks/use-theme-color';

type Mode = 'login' | 'signup';

export default function ProfileScreen() {
  const { account, status, error, login, signup, logout } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const borderColor = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.18)' },
    'icon'
  );
  const cardBorder = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.08)', dark: 'rgba(255, 255, 255, 0.12)' },
    'icon'
  );
  const cardBg = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.02)', dark: 'rgba(255, 255, 255, 0.04)' },
    'background'
  );
  const inputBg = useThemeColor(
    { light: 'rgba(255, 255, 255, 0.85)', dark: 'rgba(255, 255, 255, 0.08)' },
    'background'
  );
  const inputText = useThemeColor({}, 'text');
  const placeholderColor = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.4)', dark: 'rgba(255, 255, 255, 0.4)' },
    'text'
  );
  const muted = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.6)', dark: 'rgba(255, 255, 255, 0.6)' },
    'text'
  );
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  const canSubmit = useMemo(() => {
    if (mode === 'signup') {
      return name.trim().length > 0 && email.trim().length > 0 && password.length > 0;
    }
    return email.trim().length > 0 && password.length > 0;
  }, [email, mode, name, password]);

  const handleLogin = async () => {
    if (!canSubmit) return;
    setErrorMessage(null);

    try {
      await login(email.trim(), password);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Login failed');
    }
  };

  const handleSignup = async () => {
    if (!canSubmit) return;
    setErrorMessage(null);

    try {
      await signup(name.trim(), email.trim(), password);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Signup failed');
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'));
    setErrorMessage(null);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <ThemedText type="title">Your profile</ThemedText>
          {account ? (
            <Pressable
              onPress={handleLogout}
              style={[styles.headerLogout, { borderColor: cardBorder }]}
            >
              <ThemedText style={[styles.headerLogoutText, { color: muted }]}>Log out</ThemedText>
            </Pressable>
          ) : null}
        </View>
        <ThemedText type="subtitle">
          {account ? 'Loaded from your Calypso account.' : 'Log in to continue.'}
        </ThemedText>
      </View>

      {status === 'loading' && (
        <View style={styles.stateBlock}>
          <ActivityIndicator />
          <ThemedText>Loading…</ThemedText>
        </View>
      )}

      {(status === 'error' || errorMessage || error) && (
        <View style={styles.stateBlock}>
          <ThemedText type="defaultSemiBold">Couldn&apos;t continue</ThemedText>
          <ThemedText style={[styles.muted, { color: muted }]}>{errorMessage ?? error}</ThemedText>
        </View>
      )}

      {!account && status !== 'loading' && (
        <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}
        >
          <ThemedText type="defaultSemiBold">
            {mode === 'login' ? 'Log in' : 'Create your account'}
          </ThemedText>

          {mode === 'signup' && (
            <View style={styles.field}>
              <ThemedText style={[styles.label, { color: muted }]}>Name</ThemedText>
              <TextInput
                autoCapitalize="words"
                value={name}
                onChangeText={setName}
                style={[styles.input, { borderColor, backgroundColor: inputBg, color: inputText }]}
                placeholder="Your name"
                placeholderTextColor={placeholderColor}
              />
            </View>
          )}

          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: muted }]}>Email</ThemedText>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={[styles.input, { borderColor, backgroundColor: inputBg, color: inputText }]}
              placeholder="email@example.com"
              placeholderTextColor={placeholderColor}
            />
          </View>

          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: muted }]}>Password</ThemedText>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={[styles.input, { borderColor, backgroundColor: inputBg, color: inputText }]}
              placeholder="password"
              placeholderTextColor={placeholderColor}
            />
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: primaryBg },
              !canSubmit && styles.primaryButtonDisabled,
            ]}
            onPress={mode === 'login' ? handleLogin : handleSignup}
            disabled={!canSubmit}
          >
            <ThemedText style={[styles.primaryButtonText, { color: primaryText }]}
            >
              {mode === 'login' ? 'Continue' : 'Sign up'}
            </ThemedText>
          </Pressable>

          <Pressable style={styles.linkButton} onPress={toggleMode}>
            <ThemedText style={[styles.linkText, { color: muted }]}
            >
              {mode === 'login'
                ? 'Need an account? Sign up'
                : 'Already have an account? Log in'}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {account && status !== 'loading' && (
        <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <Link href="/filters" asChild>
            <Pressable style={[styles.primaryButton, { backgroundColor: primaryBg }]}
            >
              <ThemedText style={[styles.primaryButtonText, { color: primaryText }]}
              >
                Edit filters
              </ThemedText>
            </Pressable>
          </Link>
          <View style={styles.row}>
            <ThemedText type="defaultSemiBold">Name</ThemedText>
            <ThemedText>{account.name}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="defaultSemiBold">Account ID</ThemedText>
            <ThemedText>{account.id}</ThemedText>
          </View>
          {account.created_at ? (
            <View style={styles.row}>
              <ThemedText type="defaultSemiBold">Created</ThemedText>
              <ThemedText>{account.created_at}</ThemedText>
            </View>
          ) : null}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 56,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLogout: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerLogoutText: {
    opacity: 0.8,
  },
  stateBlock: {
    gap: 12,
    alignItems: 'flex-start',
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
  },
  row: {
    gap: 6,
  },
  field: {
    gap: 6,
  },
  label: {
    opacity: 0.7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
  },
  linkText: {
    opacity: 0.7,
  },
  muted: {
    opacity: 0.6,
  },
});
