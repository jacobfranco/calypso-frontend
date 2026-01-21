import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const SECTIONS = [
  {
    id: 'basics',
    title: 'Basics',
    subtitle: 'Name, age, hometown, pronouns',
  },
  {
    id: 'photos',
    title: 'Photos',
    subtitle: 'Add or reorder your favorites',
  },
  {
    id: 'preferences',
    title: 'Preferences',
    subtitle: 'What you want Calypso to prioritize',
  },
  {
    id: 'prompts',
    title: 'Your answers',
    subtitle: 'Review past prompt responses',
  },
];

export default function ProfileScreen() {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Your profile</ThemedText>
        <ThemedText type="subtitle">Keep things current so matches stay on point.</ThemedText>
      </View>

      <View style={styles.section}>
        {SECTIONS.map((section) => (
          <View key={section.id} style={styles.card}>
            <ThemedText type="defaultSemiBold">{section.title}</ThemedText>
            <ThemedText type="default" style={styles.cardHint}>
              {section.subtitle}
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
    gap: 6,
  },
  cardHint: {
    opacity: 0.6,
  },
});
