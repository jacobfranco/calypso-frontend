import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Link } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function ProfileScreen() {
  const { account, status, error, logout } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  const muted = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.6)', dark: 'rgba(255, 255, 255, 0.6)' },
    'text'
  );
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  const handleLogout = async () => {
    await logout();
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
        <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <ThemedText type="defaultSemiBold">Welcome to Calypso</ThemedText>
          <ThemedText style={[styles.muted, { color: muted }]}>
            Complete onboarding to continue.
          </ThemedText>
          <Link href="/onboarding" asChild>
            <Pressable style={[styles.primaryButton, { backgroundColor: primaryBg }]}>
              <ThemedText style={[styles.primaryButtonText, { color: primaryText }]}>
                Start onboarding
              </ThemedText>
            </Pressable>
          </Link>
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
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontWeight: '600',
  },
  muted: {
    opacity: 0.6,
  },
});
