import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MultiSlider from '@ptomasroos/react-native-multi-slider';

import { AgeRangeSlider } from '@/components/age-range-slider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Filters, TagsResponse, fetchTags } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFiltersDraft } from '@/lib/filters-draft';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatTagLabel } from '@/lib/tag-labels';
import {
  formatCoordinateInput,
  formatCoordinateLabel,
  getCurrentLocationSnapshot,
  getLocationErrorMessage,
  normalizeCountryCodeInput,
  parseLatitudeInput,
  parseLongitudeInput,
} from '@/lib/location';

const CATEGORY_LABELS: Record<string, string> = {
  relationship: 'Relationship mode',
  gender: 'Gender',
  age: 'Age',
  location: 'Location',
};

const RELATIONSHIP_MODES = ['focused', 'balanced', 'exploratory'];
const AGE_MIN = 18;
const AGE_MAX = 99;
const RADIUS_MIN = 1;
const RADIUS_MAX = 100;
const COUNTRY_RADIUS_KM = 3000;
const WORLDWIDE_RADIUS_KM = 30000;

type LocationScopeDraft = 'nearby' | 'country' | 'worldwide';
type RadiusUnit = 'mi' | 'km';

function flattenTags(groups: TagsResponse | null): string[] {
  if (!groups) return [];
  return Object.values(groups).flat();
}

function calculateAge(date: Date): number {
  const today = new Date();
  let years = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    years -= 1;
  }
  return years;
}

function defaultAgeRange(age: number | null): [number, number] {
  if (age === null) return [AGE_MIN, Math.min(AGE_MIN + 4, AGE_MAX)];
  const min = Math.max(AGE_MIN, age - 4);
  const max = Math.min(AGE_MAX, age + 4);
  return [min, Math.max(min, max)];
}

export default function FiltersCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const { account } = useAuth();
  const { draft, status: draftStatus, message: draftMessage, updateDraft } = useFiltersDraft();

  const borderColor = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.18)' },
    'icon'
  );
  const cardBg = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.02)', dark: 'rgba(255, 255, 255, 0.04)' },
    'background'
  );
  const inputBg = useThemeColor(
    { light: 'rgba(255, 255, 255, 0.85)', dark: 'rgba(255, 255, 255, 0.08)' },
    'background'
  );
  const inputText = useThemeColor({}, 'text');
  const muted = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.6)', dark: 'rgba(255, 255, 255, 0.6)' },
    'text'
  );
  const placeholderColor = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.4)', dark: 'rgba(255, 255, 255, 0.4)' },
    'text'
  );
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  const [genderTags, setGenderTags] = useState<TagsResponse | null>(null);
  const [tagStatus, setTagStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const [relationshipMode, setRelationshipMode] = useState('');
  const [genderSelf, setGenderSelf] = useState('');
  const [genderSeeking, setGenderSeeking] = useState<string[]>([]);
  const [ageRange, setAgeRange] = useState<[number, number]>([AGE_MIN, AGE_MIN + 4]);
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [countryName, setCountryName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationScope, setLocationScope] = useState<LocationScopeDraft>('nearby');
  const [radiusUnit, setRadiusUnit] = useState<RadiusUnit>('mi');
  const [radiusValue, setRadiusValue] = useState(25);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const genderList = useMemo(() => flattenTags(genderTags), [genderTags]);
  const ageSelf = useMemo(() => {
    if (!account?.birthday) return null;
    const date = new Date(account.birthday);
    if (Number.isNaN(date.getTime())) return null;
    return calculateAge(date);
  }, [account?.birthday]);

  useEffect(() => {
    if (category !== 'gender') return;
    let mounted = true;
    setTagStatus('loading');
    fetchTags('gender')
      .then((tags) => {
        if (!mounted) return;
        setGenderTags(tags);
        setTagStatus('idle');
      })
      .catch(() => {
        if (!mounted) return;
        setGenderTags(null);
        setTagStatus('error');
      });
    return () => {
      mounted = false;
    };
  }, [category]);

  useEffect(() => {
    if (!draft) return;
    setRelationshipMode(draft.relationshipMode?.self ?? '');
    setGenderSelf(draft.gender?.self ?? '');
    setGenderSeeking(draft.gender?.seeking ?? []);
    if (draft.age?.min !== undefined && draft.age?.max !== undefined) {
      setAgeRange([draft.age.min, draft.age.max]);
    } else {
      setAgeRange(defaultAgeRange(ageSelf));
    }
    const nextLat = draft.location?.lat ?? null;
    const nextLon = draft.location?.lon ?? null;
    setLat(nextLat);
    setLon(nextLon);
    setLatInput(formatCoordinateInput(nextLat));
    setLonInput(formatCoordinateInput(nextLon));
    setCountryCode(draft.location?.countryCode?.toUpperCase() ?? '');
    const scope = draft.location?.scope;
    setLocationScope(scope === 'COUNTRY' ? 'country' : scope === 'WORLDWIDE' ? 'worldwide' : 'nearby');
    setRadiusUnit(draft.location?.distanceUnit === 'KM' ? 'km' : 'mi');
    const radiusKm = draft.location?.radiusKm;
    if (radiusKm !== undefined && radiusKm !== COUNTRY_RADIUS_KM && radiusKm !== WORLDWIDE_RADIUS_KM) {
      setRadiusValue(draft.location?.distanceUnit === 'KM'
        ? Math.round(radiusKm)
        : Math.round(radiusKm / 1.60934));
    }
  }, [ageSelf, draft]);

  const locationLabel = useMemo(() => {
    if (locationName) return locationName;
    if (lat !== null && lon !== null) return `Lat ${lat.toFixed(3)}, Lon ${lon.toFixed(3)}`;
    return 'Use current location';
  }, [lat, locationName, lon]);

  const handleUseLocation = async () => {
    setMessage(null);
    setLocating(true);
    try {
      const location = await getCurrentLocationSnapshot();
      setLat(location.latitude);
      setLon(location.longitude);
      setLatInput(formatCoordinateInput(location.latitude));
      setLonInput(formatCoordinateInput(location.longitude));
      setCountryCode(location.countryCode);
      setCountryName(location.countryName);
      setLocationName(location.locationName);
    } catch (error) {
      setMessage(getLocationErrorMessage(error));
    } finally {
      setLocating(false);
    }
  };

  const handleManualLatChange = (text: string) => {
    setLatInput(text);
    const nextLat = parseLatitudeInput(text);
    setLat(nextLat);
    if (nextLat !== null && lon !== null) {
      setLocationName(formatCoordinateLabel(nextLat, lon));
    }
  };

  const handleManualLonChange = (text: string) => {
    setLonInput(text);
    const nextLon = parseLongitudeInput(text);
    setLon(nextLon);
    if (lat !== null && nextLon !== null) {
      setLocationName(formatCoordinateLabel(lat, nextLon));
    }
  };

  const handleCountryCodeChange = (text: string) => {
    setCountryCode(normalizeCountryCodeInput(text));
    setCountryName('');
  };

  const handleSave = () => {
    const next: Filters = { ...(draft ?? {}) };
    if (category === 'relationship') {
      next.relationshipMode = { self: relationshipMode };
    }
    if (category === 'gender') {
      next.gender = {
        self: genderSelf || undefined,
        seeking: genderSeeking,
        importance: 'NOT_IMPORTANT',
      };
    }
    if (category === 'age') {
      next.age = {
        self: ageSelf ?? undefined,
        min: ageRange[0],
        max: ageRange[1],
        importance: 'DEALBREAKER',
      };
    }
    if (category === 'location') {
      if (lat === null || lon === null) {
        setMessage('Set your location before applying.');
        return;
      }
      if (locationScope === 'country' && !countryCode) {
        setMessage('Set a country code before applying country-wide search.');
        return;
      }
      const radiusKm =
        locationScope === 'worldwide'
          ? WORLDWIDE_RADIUS_KM
          : locationScope === 'country'
            ? COUNTRY_RADIUS_KM
            : radiusUnit === 'mi'
              ? radiusValue * 1.60934
              : radiusValue;
      next.location = {
        lat,
        lon,
        radiusKm,
        scope: locationScope === 'country' ? 'COUNTRY' : locationScope === 'worldwide' ? 'WORLDWIDE' : 'NEARBY',
        countryCode: countryCode || undefined,
        distanceUnit: radiusUnit === 'mi' ? 'MI' : 'KM',
      };
    }
    updateDraft(next);
    router.back();
  };

  if (!account) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle">Log in to edit filters.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText type="title">{CATEGORY_LABELS[category ?? ''] ?? 'Filters'}</ThemedText>
          <ThemedText style={[styles.mutedText, { color: muted }]}>
            Filters only decide who can enter your match pool.
          </ThemedText>
        </View>

        {draftStatus === 'loading' && (
          <View style={styles.stateRow}>
            <ActivityIndicator />
            <ThemedText>Loading filters...</ThemedText>
          </View>
        )}

        {(message || draftMessage || tagStatus === 'error') && (
          <View style={[styles.notice, { borderColor, backgroundColor: cardBg }]}>
            <ThemedText style={[styles.noticeText, { color: muted }]}>
              {message || draftMessage || 'Unable to load tag options.'}
            </ThemedText>
          </View>
        )}

        {category === 'relationship' && (
          <Section title="Relationship mode">
            <ChipRow
              options={RELATIONSHIP_MODES}
              selected={relationshipMode ? [relationshipMode] : []}
              onToggle={setRelationshipMode}
              borderColor={borderColor}
              activeBg={cardBg}
            />
            <ThemedText style={[styles.helperText, { color: muted }]}>
              Focused has a higher match floor. Exploratory keeps the pool wider.
            </ThemedText>
          </Section>
        )}

        {category === 'gender' && (
          <Section title="Gender">
            <ThemedText style={[styles.label, { color: muted }]}>Self</ThemedText>
            <ChipRow
              options={genderList}
              selected={genderSelf ? [genderSelf] : []}
              onToggle={(tag) => setGenderSelf(genderSelf === tag ? '' : tag)}
              borderColor={borderColor}
              activeBg={cardBg}
            />
            <ThemedText style={[styles.label, { color: muted }]}>Seeking</ThemedText>
            <ChipRow
              options={genderList}
              selected={genderSeeking}
              onToggle={(tag) => {
                setGenderSeeking((prev) => (
                  prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
                ));
              }}
              borderColor={borderColor}
              activeBg={cardBg}
            />
          </Section>
        )}

        {category === 'age' && (
          <Section title="Age">
            <View style={styles.ageRow}>
              <ThemedText style={[styles.label, { color: muted }]}>Your age</ThemedText>
              <View style={[styles.ageValue, { borderColor, backgroundColor: inputBg }]}>
                <ThemedText>{ageSelf !== null ? `${ageSelf}` : 'Not available'}</ThemedText>
              </View>
            </View>
            <AgeRangeSlider
              values={ageRange}
              minAge={AGE_MIN}
              maxAge={AGE_MAX}
              onValuesChange={setAgeRange}
              labelColor={muted}
              selectedColor={inputText}
              unselectedColor={borderColor}
              markerBorderColor={borderColor}
              blockStyle={styles.sliderBlock}
              headerStyle={styles.sliderHeader}
              labelStyle={styles.label}
              trackStyle={styles.sliderTrack}
              containerStyle={styles.sliderContainer}
            />
          </Section>
        )}

        {category === 'location' && (
          <Section title="Location">
            <View style={styles.optionRow}>
              {[
                { value: 'nearby', label: 'Nearby' },
                { value: 'country', label: 'My country' },
                { value: 'worldwide', label: 'Worldwide' },
              ].map((option) => (
                <OptionPill
                  key={option.value}
                  label={option.label}
                  selected={locationScope === option.value}
                  onPress={() => setLocationScope(option.value as LocationScopeDraft)}
                  borderColor={borderColor}
                  activeBg={cardBg}
                />
              ))}
            </View>
            <Pressable
              onPress={handleUseLocation}
              style={({ pressed }) => [
                styles.locationPill,
                { borderColor, backgroundColor: cardBg, opacity: locating ? 0.7 : 1 },
                pressed && !locating ? styles.pressed : null,
              ]}
            >
              <ThemedText numberOfLines={1} style={[styles.locationPillText, { color: muted }]}>
                {locating ? 'Locating...' : locationLabel}
              </ThemedText>
            </Pressable>
            {(Platform.OS === 'web' || Boolean(message)) ? (
              <View style={[styles.manualLocationBox, { borderColor, backgroundColor: cardBg }]}>
                <ThemedText style={[styles.label, { color: muted }]}>Manual location</ThemedText>
                <View style={styles.manualLocationRow}>
                  <View style={styles.manualLocationField}>
                    <ThemedText style={[styles.label, { color: muted }]}>Latitude</ThemedText>
                    <TextInput
                      value={latInput}
                      onChangeText={handleManualLatChange}
                      placeholder="40.7128"
                      placeholderTextColor={placeholderColor}
                      keyboardType="numbers-and-punctuation"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[
                        styles.input,
                        { borderColor, backgroundColor: inputBg, color: inputText },
                      ]}
                    />
                  </View>
                  <View style={styles.manualLocationField}>
                    <ThemedText style={[styles.label, { color: muted }]}>Longitude</ThemedText>
                    <TextInput
                      value={lonInput}
                      onChangeText={handleManualLonChange}
                      placeholder="-74.006"
                      placeholderTextColor={placeholderColor}
                      keyboardType="numbers-and-punctuation"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[
                        styles.input,
                        { borderColor, backgroundColor: inputBg, color: inputText },
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.manualLocationField}>
                  <ThemedText style={[styles.label, { color: muted }]}>Country code</ThemedText>
                  <TextInput
                    value={countryCode}
                    onChangeText={handleCountryCodeChange}
                    placeholder="US"
                    placeholderTextColor={placeholderColor}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={2}
                    style={[
                      styles.input,
                      { borderColor, backgroundColor: inputBg, color: inputText },
                    ]}
                  />
                </View>
              </View>
            ) : null}
            {locationScope === 'nearby' && (
              <View style={styles.sliderBlock}>
                <View style={styles.sliderHeader}>
                  <ThemedText style={[styles.label, { color: muted }]}>Radius</ThemedText>
                  <ThemedText style={[styles.label, { color: muted }]}>
                    {radiusValue} {radiusUnit}
                  </ThemedText>
                </View>
                <MultiSlider
                  values={[radiusValue]}
                  min={RADIUS_MIN}
                  max={RADIUS_MAX}
                  step={1}
                  onValuesChange={(values) => setRadiusValue(values[0])}
                  selectedStyle={{ backgroundColor: inputText }}
                  unselectedStyle={{ backgroundColor: borderColor }}
                  markerStyle={{ backgroundColor: inputText, borderColor }}
                  trackStyle={styles.sliderTrack}
                  containerStyle={styles.sliderContainer}
                />
                <View style={styles.optionRow}>
                  {[
                    { value: 'mi', label: 'Miles' },
                    { value: 'km', label: 'Kilometers' },
                  ].map((option) => (
                    <OptionPill
                      key={option.value}
                      label={option.label}
                      selected={radiusUnit === option.value}
                      onPress={() => setRadiusUnit(option.value as RadiusUnit)}
                      borderColor={borderColor}
                      activeBg={cardBg}
                    />
                  ))}
                </View>
              </View>
            )}
            {locationScope === 'country' && (
              <ThemedText style={[styles.helperText, { color: muted }]}>
                Using {countryName || countryCode || 'your country'}.
              </ThemedText>
            )}
          </Section>
        )}

        <Pressable style={[styles.saveButton, { backgroundColor: primaryBg }]} onPress={handleSave}>
          <ThemedText style={[styles.saveButtonText, { color: primaryText }]}>Apply</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="defaultSemiBold">{title}</ThemedText>
      {children}
    </View>
  );
}

function ChipRow({
  options,
  selected,
  onToggle,
  borderColor,
  activeBg,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  borderColor: string;
  activeBg: string;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => onToggle(option)}
            style={[styles.chip, { borderColor }, active && { backgroundColor: activeBg }]}
          >
            <ThemedText style={styles.chipText}>{formatTagLabel(option)}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function OptionPill({
  label,
  selected,
  onPress,
  borderColor,
  activeBg,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  borderColor: string;
  activeBg: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.optionPill, { borderColor }, selected && { backgroundColor: activeBg }]}
    >
      <ThemedText style={styles.optionPillText}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 18,
  },
  header: {
    gap: 6,
  },
  mutedText: {
    fontSize: 14,
    lineHeight: 20,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notice: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    gap: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  manualLocationBox: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  manualLocationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  manualLocationField: {
    flex: 1,
    gap: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  ageValue: {
    minWidth: 74,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  sliderBlock: {
    gap: 10,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderTrack: {
    height: 4,
  },
  sliderContainer: {
    alignSelf: 'stretch',
    height: 40,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionPill: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  optionPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  locationPill: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  locationPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.82,
  },
  saveButton: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
