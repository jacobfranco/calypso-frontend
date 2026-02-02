import React, { useLayoutEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Link, useNavigation } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import { useFiltersDraft } from '@/lib/filters-draft';
import { useThemeColor } from '@/hooks/use-theme-color';

const CATEGORIES = [
  { key: 'relationship', label: 'Relationship mode' },
  { key: 'gender', label: 'Gender' },
  { key: 'age', label: 'Age' },
  { key: 'location', label: 'Location' },
  { key: 'religion', label: 'Religion' },
  { key: 'politics', label: 'Politics' },
  { key: 'lifestyle', label: 'Lifestyle' },
  { key: 'interests', label: 'Interests' },
];

export default function FiltersIndexScreen() {
  const { account } = useAuth();
  const { status, message, dirty, saveAll, draft } = useFiltersDraft();
  const navigation = useNavigation();
  const border = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.32)', dark: 'rgba(255, 255, 255, 0.35)' },
    'icon'
  );
  const itemBg = useThemeColor(
    { light: '#fff', dark: 'rgba(255, 255, 255, 0.03)' },
    'background'
  );
  const muted = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.6)', dark: 'rgba(255, 255, 255, 0.6)' },
    'text'
  );
  const headerAction = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const headerActionText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  const isBusy = status === 'loading' || status === 'saving';

  useLayoutEffect(() => {
    if (!account) {
      navigation.setOptions({ headerRight: () => null });
      return;
    }

    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={saveAll}
          disabled={!dirty || isBusy}
          style={[
            styles.headerSave,
            {
              backgroundColor: dirty ? headerAction : 'transparent',
              borderColor: headerAction,
              opacity: dirty && !isBusy ? 1 : 0.5,
            },
          ]}
        >
          <ThemedText
            style={[
              styles.headerSaveText,
              { color: dirty ? headerActionText : headerAction },
            ]}
          >
            Save
          </ThemedText>
        </Pressable>
      ),
    });
  }, [account, dirty, headerAction, headerActionText, isBusy, navigation, saveAll]);

  const summaries = useMemo(() => {
    const filters = draft ?? {};
    const relationship = filters.relationshipMode?.self ?? 'Not set';
    const genderSelf = filters.gender?.self ? `Self: ${filters.gender.self}` : '';
    const genderSeeking = (filters.gender?.seeking ?? []).length
      ? `Seeking: ${(filters.gender?.seeking ?? []).join(', ')}`
      : '';
    const gender = [genderSelf, genderSeeking].filter(Boolean).join(' · ') || 'Not set';
    const ageParts = [];
    if (filters.age?.self !== undefined) ageParts.push(`Self: ${filters.age.self}`);
    if (filters.age?.min !== undefined && filters.age?.max !== undefined) {
      ageParts.push(`${filters.age.min}-${filters.age.max}`);
    }
    const age = ageParts.length ? ageParts.join(' · ') : 'Not set';
    const location = filters.location?.lat !== undefined
      ? `Lat ${filters.location.lat} · Lon ${filters.location.lon} · ${filters.location.radiusKm}km`
      : 'Not set';
    const religionSelf = filters.religion?.self ? `Self: ${filters.religion.self}` : '';
    const religionSeeking = (filters.religion?.seeking ?? []).length
      ? `Seeking: ${(filters.religion?.seeking ?? []).join(', ')}`
      : '';
    const religion = [religionSelf, religionSeeking].filter(Boolean).join(' · ') || 'Not set';
    const politicsSelf = filters.politics?.self ? `Self: ${filters.politics.self}` : '';
    const politicsSeeking = (filters.politics?.seeking ?? []).length
      ? `Seeking: ${(filters.politics?.seeking ?? []).join(', ')}`
      : '';
    const politics = [politicsSelf, politicsSeeking].filter(Boolean).join(' · ') || 'Not set';
    const lifestyle = filters.lifestyle?.self?.length || filters.lifestyle?.preferences?.length
      ? [
          filters.lifestyle?.self?.length ? `Self: ${filters.lifestyle?.self?.join(', ')}` : '',
          filters.lifestyle?.preferences?.length
            ? `Seeking: ${filters.lifestyle?.preferences?.map((pref) => pref.tag).join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Not set';
    const interests = filters.interests?.self?.length || filters.interests?.preferences?.length
      ? [
          filters.interests?.self?.length ? `Self: ${filters.interests?.self?.join(', ')}` : '',
          filters.interests?.preferences?.length
            ? `Seeking: ${filters.interests?.preferences?.map((pref) => pref.tag).join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Not set';

    return {
      relationship,
      gender,
      age,
      location,
      religion,
      politics,
      lifestyle,
      interests,
    };
  }, [draft]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {isBusy && (
          <View style={styles.stateBlock}>
            <ActivityIndicator />
            <ThemedText>{status === 'saving' ? 'Saving…' : 'Loading…'}</ThemedText>
          </View>
        )}

        {message && (
          <View style={styles.stateBlock}>
            <ThemedText style={[styles.muted, { color: muted }]}>{message}</ThemedText>
          </View>
        )}

        {CATEGORIES.map((cat) => (
          <Link key={cat.key} href={`/filters/${cat.key}`} asChild>
            <Pressable
              disabled={!account}
              style={({ pressed }) => [
                styles.categoryButton,
                { backgroundColor: itemBg, borderColor: border, opacity: account ? 1 : 0.5 },
                pressed && account ? styles.categoryPressed : null,
              ]}
            >
              <View style={styles.categoryCopy}>
                <ThemedText type="defaultSemiBold">{cat.label}</ThemedText>
                <ThemedText
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.summaryText, { color: muted }]}
                >
                  {summaries[cat.key as keyof typeof summaries] ?? 'Not set'}
                </ThemedText>
              </View>
              <View style={styles.categoryChevronWrap}>
                <ThemedText style={[styles.categoryChevron, { color: muted }]}>›</ThemedText>
              </View>
            </Pressable>
          </Link>
        ))}

      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
    alignItems: 'stretch',
  },
  stateBlock: {
    gap: 8,
  },
  categoryButton: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
    gap: 12,
  },
  categoryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  categoryChevronWrap: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    flexShrink: 0,
    width: 20,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '500',
  },
  categoryPressed: {
    transform: [{ scale: 0.99 }],
  },
  categoryChevron: {
    fontSize: 18,
    opacity: 0.4,
  },
  muted: {
    opacity: 0.6,
  },
  headerSave: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerSaveText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
