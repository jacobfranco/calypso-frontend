import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const PROMPTS = [
  {
    id: 'prompt.values.spark',
    question: 'What quality instantly gets your attention in a partner?',
  },
  {
    id: 'prompt.weekend.vibes',
    question: 'How do you usually spend a perfect Saturday?',
  },
  {
    id: 'prompt.music.throwback',
    question: 'Which song instantly transports you back in time?',
  },
];

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Prompts</ThemedText>
        <ThemedText type="subtitle">Swipe through prompts to share more about yourself.</ThemedText>
      </View>

      <View style={styles.section}>
        <ThemedText type="defaultSemiBold">Today&apos;s lineup</ThemedText>
        {PROMPTS.map((prompt) => (
          <View key={prompt.id} style={styles.card}>
            <ThemedText type="default">{prompt.question}</ThemedText>
            <ThemedText type="default" style={styles.cardHint}>
              Answer, skip, or save for later.
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
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    gap: 8,
  },
  cardHint: {
    opacity: 0.6,
  },
});
