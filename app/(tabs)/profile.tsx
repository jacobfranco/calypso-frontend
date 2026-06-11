import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Link } from 'expo-router';

import { flattenStyle } from '@/components/style-utils';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/lib/auth';

export default function ProfileScreen() {
  const { account, status, error, logout } = useAuth();
  const activeError = error;

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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <ThemedText type="title">Your profile</ThemedText>
            {account ? (
              <Pressable
                onPress={handleLogout}
                style={flattenStyle<ViewStyle>([styles.headerLogout, { borderColor: cardBorder }])}
              >
                <ThemedText style={flattenStyle<TextStyle>([styles.headerLogoutText, { color: muted }])}>
                  Log out
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>

        {status === 'loading' && (
          <View style={styles.stateBlock}>
            <ActivityIndicator />
            <ThemedText>Loading...</ThemedText>
          </View>
        )}

        {activeError && (
          <View style={styles.stateBlock}>
            <ThemedText type="defaultSemiBold">Couldn&apos;t continue</ThemedText>
            <ThemedText style={flattenStyle<TextStyle>([styles.muted, { color: muted }])}>
              {activeError}
            </ThemedText>
          </View>
        )}

        {!account && status !== 'loading' && (
          <View style={flattenStyle<ViewStyle>([styles.card, { borderColor: cardBorder, backgroundColor: cardBg }])}>
            <ThemedText type="defaultSemiBold">Welcome</ThemedText>
            <ThemedText style={flattenStyle<TextStyle>([styles.muted, { color: muted }])}>
              Complete onboarding to continue.
            </ThemedText>
            <Link href="/onboarding" asChild>
              <Pressable style={flattenStyle<ViewStyle>([styles.primaryButton, { backgroundColor: primaryBg }])}>
                <ThemedText style={flattenStyle<TextStyle>([styles.primaryButtonText, { color: primaryText }])}>
                  Start onboarding
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        )}

        {account && status !== 'loading' && (
          <View style={flattenStyle<ViewStyle>([styles.card, { borderColor: cardBorder, backgroundColor: cardBg }])}>
            <Link href="/filters" asChild>
              <Pressable style={flattenStyle<ViewStyle>([styles.secondaryButton, { borderColor }])}>
                <ThemedText style={flattenStyle<TextStyle>([styles.secondaryButtonText, { color: muted }])}>
                  Edit filters
                </ThemedText>
              </Pressable>
            </Link>
            <Link href="/prompts" asChild>
              <Pressable style={flattenStyle<ViewStyle>([styles.secondaryButton, { borderColor }])}>
                <ThemedText style={flattenStyle<TextStyle>([styles.secondaryButtonText, { color: muted }])}>
                  Edit prompts
                </ThemedText>
              </Pressable>
            </Link>
            <Link href="/match-standards" asChild>
              <Pressable style={flattenStyle<ViewStyle>([styles.secondaryButton, { borderColor }])}>
                <ThemedText style={flattenStyle<TextStyle>([styles.secondaryButtonText, { color: muted }])}>
                  Edit match standards
                </ThemedText>
              </Pressable>
            </Link>
            <Link href="/facecard-photos" asChild>
              <Pressable style={flattenStyle<ViewStyle>([styles.secondaryButton, { borderColor }])}>
                <ThemedText style={flattenStyle<TextStyle>([styles.secondaryButtonText, { color: muted }])}>
                  Edit facecard photos
                </ThemedText>
              </Pressable>
            </Link>
            <Link href="/admin" asChild>
              <Pressable style={flattenStyle<ViewStyle>([styles.secondaryButton, { borderColor }])}>
                <ThemedText style={flattenStyle<TextStyle>([styles.secondaryButtonText, { color: muted }])}>
                  Admin
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
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 40,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
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
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontWeight: '600',
  },
  muted: {
    opacity: 0.6,
  },
});
