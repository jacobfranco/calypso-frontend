import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import { fetchPublicPromptFeed, postPublicPromptReaction, PublicPromptFeedCard } from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function HomeScreen() {
  const { account, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<PublicPromptFeedCard | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const cardBorder = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.08)', dark: 'rgba(255, 255, 255, 0.12)' },
    'icon'
  );
  const cardBg = useThemeColor(
    { light: '#fff', dark: 'rgba(255, 255, 255, 0.04)' },
    'background'
  );
  const muted = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.6)', dark: 'rgba(255, 255, 255, 0.6)' },
    'text'
  );
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  const loadCard = useCallback(async () => {
    if (!account || !token) return;
    setLoading(true);
    setMessage(null);
    try {
      const cards = await fetchPublicPromptFeed(account.id, token, 1);
      setCard(cards.length ? cards[0] : null);
      if (!cards.length) {
        setMessage('Nothing new right now. Check back later.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, [account, token]);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  const handleReaction = useCallback(
    async (reaction: 'LIKE' | 'DISLIKE' | 'SKIP') => {
      if (!account || !token || !card) return;
      setLoading(true);
      try {
        await postPublicPromptReaction(account.id, token, card.answerId, { reaction });
        await loadCard();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to react');
        setLoading(false);
      }
    },
    [account, card, loadCard, token]
  );

  return (
    <ThemedView style={styles.container}>
      {loading && (
        <View style={styles.stateRow}>
          <ActivityIndicator />
          <ThemedText>Loading feed…</ThemedText>
        </View>
      )}

      {message && (
        <View style={[styles.notice, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <ThemedText style={[styles.mutedText, { color: muted }]}>{message}</ThemedText>
        </View>
      )}

      {card && (
        <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <ThemedText type="defaultSemiBold">{card.promptText}</ThemedText>
          <ThemedText style={[styles.bodyText, { color: muted }]}>{card.body}</ThemedText>
          <View style={styles.actionsRow}>
            {[
              { label: 'Dislike', value: 'DISLIKE' as const },
              { label: 'Skip', value: 'SKIP' as const },
              { label: 'Like', value: 'LIKE' as const },
            ].map((action) => (
              <Pressable
                key={action.value}
                onPress={() => handleReaction(action.value)}
                disabled={loading}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    borderColor: cardBorder,
                    backgroundColor: action.value === 'LIKE' ? primaryBg : 'transparent',
                    opacity: pressed || loading ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.actionText,
                    { color: action.value === 'LIKE' ? primaryText : muted },
                  ]}
                >
                  {action.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
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
    gap: 20,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notice: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  card: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 22,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mutedText: {
    fontSize: 13,
  },
});
