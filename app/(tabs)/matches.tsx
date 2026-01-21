import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const MATCHES = [
  { id: 'match-1', name: 'Avery', note: 'Shared love of trail runs' },
  { id: 'match-2', name: 'Jordan', note: 'Both into sci-fi' },
  { id: 'match-3', name: 'Riley', note: 'Weekend farmers markets' },
];

export default function MatchesScreen() {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Matches</ThemedText>
        <ThemedText type="subtitle">Start with the concierge or dive into chats.</ThemedText>
      </View>

      <View style={styles.section}>
        <ThemedText type="defaultSemiBold">Calypso Concierge</ThemedText>
        <View style={styles.agentCard}>
          <ThemedText type="default">Ask Calypso to refine your preferences.</ThemedText>
          <ThemedText type="default" style={styles.cardHint}>
            New message waiting · tap to reply
          </ThemedText>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="defaultSemiBold">Your matches</ThemedText>
        {MATCHES.map((match) => (
          <View key={match.id} style={styles.matchRow}>
            <View>
              <ThemedText type="defaultSemiBold">{match.name}</ThemedText>
              <ThemedText type="default" style={styles.cardHint}>
                {match.note}
              </ThemedText>
            </View>
            <ThemedText type="default" style={styles.badge}>
              2 new
            </ThemedText>
          </View>
        ))}
      </View>
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
  section: {
    gap: 12,
  },
  agentCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    gap: 8,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
  },
  cardHint: {
    opacity: 0.6,
  },
});
