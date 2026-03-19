import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import { fetchMatches, MatchCard } from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

function formatRelativeTime(epochMillis: number): string {
  if (!epochMillis || Number.isNaN(epochMillis)) return 'Just now';
  try {
    return new Date(epochMillis).toLocaleString();
  } catch {
    return 'Just now';
  }
}

export default function MessagesScreen() {
  const { account, token } = useAuth();
  const [matches, setMatches] = useState<MatchCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const cardBorder = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.10)', dark: 'rgba(255, 255, 255, 0.14)' },
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

  const loadMatches = useCallback(async () => {
    if (!account || !token) {
      setMatches([]);
      setMessage('Log in to view matches.');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const items = await fetchMatches(account.id, token, 30);
      setMatches(items);
      if (!items.length) {
        setMessage('No mutual matches yet. Keep reacting in feed and facecards.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load matches');
    } finally {
      setLoading(false);
    }
  }, [account, token]);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Messages</ThemedText>
        <Pressable
          onPress={loadMatches}
          disabled={loading}
          style={({ pressed }) => [
            styles.refreshButton,
            {
              backgroundColor: primaryBg,
              opacity: pressed || loading ? 0.75 : 1,
            },
          ]}
        >
          <ThemedText style={[styles.refreshButtonText, { color: primaryText }]}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </ThemedText>
        </Pressable>
      </View>

      {loading && matches.length === 0 ? (
        <View style={styles.stateBlock}>
          <ActivityIndicator />
          <ThemedText>Loading matches…</ThemedText>
        </View>
      ) : null}

      {message ? (
        <View style={styles.stateBlock}>
          <ThemedText style={{ color: muted }}>{message}</ThemedText>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {matches.map((match) => (
          <View
            key={`${match.account.id}-${match.computedAt}`}
            style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}
          >
            <Image
              source={{ uri: match.account.avatar_static ?? match.account.avatar }}
              style={styles.avatar}
            />
            <View style={styles.meta}>
              <ThemedText type="defaultSemiBold">{match.account.name}</ThemedText>
              <ThemedText style={[styles.metaText, { color: muted }]}>
                Mutual gate passed
              </ThemedText>
              <ThemedText style={[styles.metaText, { color: muted }]}>
                Updated {formatRelativeTime(match.computedAt)}
              </ThemedText>
            </View>
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 56,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshButton: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  refreshButtonText: {
    fontWeight: '600',
  },
  stateBlock: {
    gap: 8,
  },
  listContent: {
    gap: 12,
    paddingBottom: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  meta: {
    flex: 1,
    gap: 4,
  },
  metaText: {
    fontSize: 13,
  },
});
