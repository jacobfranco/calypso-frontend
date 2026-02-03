import React, { useLayoutEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Link, useNavigation } from 'expo-router';
import type { Href } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import { useFiltersDraft } from '@/lib/filters-draft';
import { useThemeColor } from '@/hooks/use-theme-color';

const RELATIONSHIP_CATEGORY = { key: 'relationship', label: 'Relationship mode' };
const GENDER_CATEGORY = { key: 'gender', label: 'Gender' };
const AGE_CATEGORY = { key: 'age', label: 'Age' };
const LOCATION_CATEGORY = { key: 'location', label: 'Location' };
const RELIGION_CATEGORY = { key: 'religion', label: 'Religion' };
const POLITICS_CATEGORY = { key: 'politics', label: 'Politics' };
const LIFESTYLE_CATEGORY = { key: 'lifestyle', label: 'Lifestyle' };
const INTERESTS_CATEGORY = { key: 'interests', label: 'Interests' };

const FILTER_CATEGORIES = [
  RELATIONSHIP_CATEGORY,
  GENDER_CATEGORY,
  AGE_CATEGORY,
  LOCATION_CATEGORY,
  RELIGION_CATEGORY,
  POLITICS_CATEGORY,
  LIFESTYLE_CATEGORY,
  INTERESTS_CATEGORY,
] as const;

type FilterCategoryKey = (typeof FILTER_CATEGORIES)[number]['key'];

type FilterCategoryRowProps = {
  href: Href;
  label: string;
  summary: string;
  disabled: boolean;
  itemBg: string;
  border: string;
  muted: string;
};

function FilterCategoryRow({
  href,
  label,
  summary,
  disabled,
  itemBg,
  border,
  muted,
}: FilterCategoryRowProps) {
  return (
    <Link href={href} asChild>
      <Pressable
        disabled={disabled}
        style={({ pressed }) => [
          styles.categoryPressable,
          pressed && !disabled ? styles.categoryPressed : null,
        ]}
      >
        <View
          style={[
            styles.categoryButton,
            { backgroundColor: itemBg, borderColor: border, opacity: disabled ? 0.5 : 1 },
          ]}
        >
          <View style={styles.categoryCopy}>
            <ThemedText type="defaultSemiBold">{label}</ThemedText>
            <ThemedText
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.summaryText, { color: muted }]}
            >
              {summary}
            </ThemedText>
          </View>
          <View style={styles.categoryChevronWrap}>
            <ThemedText style={[styles.categoryChevron, { color: muted }]}>›</ThemedText>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

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

  const summaries = useMemo<Record<FilterCategoryKey, string>>(() => {
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

  const categoryItems = useMemo(
    () =>
      FILTER_CATEGORIES.map((category) => ({
        ...category,
        href: `/filters/${category.key}` as Href,
        summary: summaries[category.key] ?? 'Not set',
      })),
    [summaries]
  );

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

        {categoryItems.map((cat) => (
          <FilterCategoryRow
            key={cat.key}
            href={cat.href}
            label={cat.label}
            summary={cat.summary}
            disabled={!account}
            itemBg={itemBg}
            border={border}
            muted={muted}
          />
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
  categoryPressable: {
    alignSelf: 'stretch',
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
