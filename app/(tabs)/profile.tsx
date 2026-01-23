import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Account,
  clearToken,
  createAccount,
  fetchMe,
  getStoredToken,
  loginWithPassword,
  revokeToken,
  storeToken,
} from '@/lib/api';

type Mode = 'login' | 'signup';

export default function ProfileScreen() {
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = useMemo(() => {
    if (mode === 'signup') {
      return name.trim().length > 0 && email.trim().length > 0 && password.length > 0;
    }
    return email.trim().length > 0 && password.length > 0;
  }, [email, mode, name, password]);

  useEffect(() => {
    let mounted = true;

    const loadAccount = async () => {
      setStatus('loading');
      setErrorMessage(null);

      try {
        const token = await getStoredToken();
        if (!token) {
          if (mounted) {
            setStatus('idle');
          }
          return;
        }

        const me = await fetchMe(token);
        if (mounted) {
          setAccount(me);
          setStatus('idle');
        }
      } catch (error) {
        await clearToken();
        if (mounted) {
          setAccount(null);
          setStatus('idle');
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load profile');
        }
      }
    };

    loadAccount();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogin = async () => {
    if (!canSubmit) return;
    setStatus('loading');
    setErrorMessage(null);

    try {
      const token = await loginWithPassword(email.trim(), password);
      await storeToken(token.access_token);
      const me = await fetchMe(token.access_token);
      setAccount(me);
      setStatus('idle');
    } catch (error) {
      setAccount(null);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Login failed');
    }
  };

  const handleSignup = async () => {
    if (!canSubmit) return;
    setStatus('loading');
    setErrorMessage(null);

    try {
      const token = await createAccount({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      await storeToken(token.access_token);
      const me = await fetchMe(token.access_token);
      setAccount(me);
      setStatus('idle');
    } catch (error) {
      setAccount(null);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Signup failed');
    }
  };

  const handleLogout = async () => {
    const token = await getStoredToken();
    if (token) {
      try {
        await revokeToken(token);
      } catch (error) {
        // Ignore revoke failures for local logout.
      }
    }
    await clearToken();
    setAccount(null);
    setErrorMessage(null);
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
            <Pressable onPress={handleLogout} style={styles.headerLogout}>
              <ThemedText style={styles.headerLogoutText}>Log out</ThemedText>
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

      {status === 'error' && errorMessage && (
        <View style={styles.stateBlock}>
          <ThemedText type="defaultSemiBold">Couldn&apos;t continue</ThemedText>
          <ThemedText style={styles.muted}>{errorMessage}</ThemedText>
        </View>
      )}

      {!account && status !== 'loading' && (
        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">
            {mode === 'login' ? 'Log in' : 'Create your account'}
          </ThemedText>

          {mode === 'signup' && (
            <View style={styles.field}>
              <ThemedText style={styles.label}>Name</ThemedText>
              <TextInput
                autoCapitalize="words"
                value={name}
                onChangeText={setName}
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor="rgba(0,0,0,0.4)"
              />
            </View>
          )}

          <View style={styles.field}>
            <ThemedText style={styles.label}>Email</ThemedText>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              placeholder="email@example.com"
              placeholderTextColor="rgba(0,0,0,0.4)"
            />
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Password</ThemedText>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              placeholder="password"
              placeholderTextColor="rgba(0,0,0,0.4)"
            />
          </View>

          <Pressable
            style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
            onPress={mode === 'login' ? handleLogin : handleSignup}
            disabled={!canSubmit}
          >
            <ThemedText style={styles.primaryButtonText}>
              {mode === 'login' ? 'Continue' : 'Sign up'}
            </ThemedText>
          </Pressable>

          <Pressable style={styles.linkButton} onPress={toggleMode}>
            <ThemedText style={styles.linkText}>
              {mode === 'login'
                ? 'Need an account? Sign up'
                : 'Already have an account? Log in'}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {account && status !== 'loading' && (
        <View style={styles.card}>
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
    borderColor: 'rgba(0, 0, 0, 0.12)',
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
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
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
    borderColor: 'rgba(0, 0, 0, 0.12)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#111',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  primaryButton: {
    backgroundColor: '#111',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
  },
  linkButton: {
    alignItems: 'center',
  },
  linkText: {
    opacity: 0.7,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.12)',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111',
  },
  muted: {
    opacity: 0.6,
  },
});
