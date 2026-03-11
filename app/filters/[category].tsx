import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import { AgeRangeSlider } from '@/components/age-range-slider';
import { ThemedText } from '@/components/themed-text';
import {
  Filters,
  Importance,
  TagsResponse,
  fetchTags,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFiltersDraft } from '@/lib/filters-draft';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatTagGroupLabel, formatTagLabel } from '@/lib/tag-labels';

const IMPORTANCE_OPTIONS: { label: string; value: Importance }[] = [
  { label: 'Not important', value: 'NOT_IMPORTANT' },
  { label: 'Preference', value: 'PREFERENCE' },
  { label: 'Dealbreaker', value: 'DEALBREAKER' },
];

const ALIGNMENT_IMPORTANCE_OPTIONS: { label: string; value: Importance }[] = [
  { label: 'Not important', value: 'NOT_IMPORTANT' },
  { label: 'Nice to have', value: 'PREFERENCE' },
  { label: 'Important', value: 'DEALBREAKER' },
];

const RELATIONSHIP_MODES = ['focused', 'balanced', 'exploratory'];
const AGE_MIN = 18;
const AGE_MAX = 99;
const RADIUS_MIN = 1;
const RADIUS_MAX = 100;
const COUNTRY_RADIUS_KM = 3000;
const WORLDWIDE_RADIUS_KM = 30000;

type TagRole = 'self' | 'seeking';

type ImportancePalette = Record<Importance, { bg: string; border: string; text: string }>;

type LocationPermission = Location.PermissionStatus | 'unknown';

const CATEGORY_LABELS: Record<string, string> = {
  relationship: 'Relationship mode',
  gender: 'Gender',
  age: 'Age',
  location: 'Location',
  religion: 'Religion',
  politics: 'Politics',
  lifestyle: 'Lifestyle',
};

function flattenTags(groups: TagsResponse | null): string[] {
  if (!groups) return [];
  return Object.values(groups).flat();
}

const IMPORTANCE_RANK: Record<Importance, number> = {
  NOT_IMPORTANT: 0,
  PREFERENCE: 1,
  DEALBREAKER: 2,
};

function maxImportance(left: Importance, right: Importance): Importance {
  return IMPORTANCE_RANK[left] >= IMPORTANCE_RANK[right] ? left : right;
}

function buildLifestyleGroupImportance(
  groups: TagsResponse | null,
  prefs: Record<string, Importance>
): Record<string, Importance> {
  if (!groups) return {};
  const result: Record<string, Importance> = {};
  for (const [group, tags] of Object.entries(groups)) {
    let groupImportance: Importance = 'NOT_IMPORTANT';
    for (const tag of tags) {
      const tagImportance = prefs[tag];
      if (tagImportance) {
        groupImportance = maxImportance(groupImportance, tagImportance);
      }
    }
    result[group] = groupImportance;
  }
  return result;
}


function toggleItem(list: string[], value: string): string[] {
  if (list.includes(value)) {
    return list.filter((item) => item !== value);
  }
  return [...list, value];
}

export default function FiltersCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const { account, token } = useAuth();
  const { draft, status: draftStatus, message: draftMessage, updateDraft } = useFiltersDraft();
  const theme = useColorScheme() ?? 'light';
  const router = useRouter();

  const borderColor = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.18)' },
    'icon'
  );
  const cardBg = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.02)', dark: 'rgba(255, 255, 255, 0.04)' },
    'background'
  );
  const roleActiveBg = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.06)', dark: 'rgba(255, 255, 255, 0.08)' },
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
  const overlayColor = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.35)', dark: 'rgba(0, 0, 0, 0.7)' },
    'background'
  );
  const modalBg = useThemeColor({ light: '#fff', dark: '#1c1f24' }, 'background');
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  const importancePalette: ImportancePalette = useMemo(() => {
    if (theme === 'dark') {
      return {
        NOT_IMPORTANT: {
          bg: 'rgba(255, 255, 255, 0.08)',
          border: 'rgba(255, 255, 255, 0.24)',
          text: 'rgba(255, 255, 255, 0.85)',
        },
        PREFERENCE: {
          bg: 'rgba(86, 153, 255, 0.28)',
          border: 'rgba(86, 153, 255, 0.6)',
          text: '#cfe0ff',
        },
        DEALBREAKER: {
          bg: 'rgba(148, 98, 255, 0.3)',
          border: 'rgba(148, 98, 255, 0.6)',
          text: '#e5d3ff',
        },
      };
    }

    return {
      NOT_IMPORTANT: {
        bg: 'rgba(0, 0, 0, 0.06)',
        border: 'rgba(0, 0, 0, 0.2)',
        text: 'rgba(0, 0, 0, 0.8)',
      },
      PREFERENCE: {
        bg: 'rgba(86, 153, 255, 0.18)',
        border: 'rgba(86, 153, 255, 0.5)',
        text: '#0f2a5c',
      },
      DEALBREAKER: {
        bg: 'rgba(148, 98, 255, 0.18)',
        border: 'rgba(148, 98, 255, 0.5)',
        text: '#2d0f5c',
      },
    };
  }, [theme]);

  const [tagStatus, setTagStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const [relationshipMode, setRelationshipMode] = useState<string>('');

  const [genderSelf, setGenderSelf] = useState<string>('');
  const [genderSeeking, setGenderSeeking] = useState<string[]>([]);
  const [genderImportance, setGenderImportance] = useState<Importance>('NOT_IMPORTANT');

  const ageSelf = useMemo(() => {
    if (!account?.birthday) return null;
    const birthDate = new Date(account.birthday);
    if (Number.isNaN(birthDate.getTime())) return null;
    return calculateAge(birthDate);
  }, [account?.birthday]);
  const [ageRange, setAgeRange] = useState<[number, number]>([AGE_MIN, AGE_MIN + 4]);
  const [ageImportance, setAgeImportance] = useState<Importance>('NOT_IMPORTANT');

  const [locationScope, setLocationScope] = useState<'nearby' | 'country' | 'worldwide'>('nearby');
  const [radiusUnit, setRadiusUnit] = useState<'mi' | 'km'>('mi');
  const [radiusValue, setRadiusValue] = useState(25);
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [countryCode, setCountryCode] = useState('');
  const [countryName, setCountryName] = useState('');
  const [locationPermission, setLocationPermission] = useState<LocationPermission>('unknown');
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [locationName, setLocationName] = useState('');
  const autoLocateRef = useRef(false);

  const [religionSelf, setReligionSelf] = useState('');
  const [religionImportance, setReligionImportance] = useState<Importance>('NOT_IMPORTANT');

  const [politicsSelf, setPoliticsSelf] = useState('');
  const [politicsImportance, setPoliticsImportance] = useState<Importance>('NOT_IMPORTANT');

  const [lifestyleSelf, setLifestyleSelf] = useState<string[]>([]);
  const [lifestylePrefs, setLifestylePrefs] = useState<Record<string, Importance>>({});
  const [lifestyleGroupImportance, setLifestyleGroupImportance] = useState<Record<string, Importance>>({});
  const lifestyleGroupHydrated = useRef(false);

  const [genderTags, setGenderTags] = useState<TagsResponse | null>(null);
  const [religionTags, setReligionTags] = useState<TagsResponse | null>(null);
  const [politicsTags, setPoliticsTags] = useState<TagsResponse | null>(null);
  const [lifestyleTags, setLifestyleTags] = useState<TagsResponse | null>(null);

  const [activeRole, setActiveRole] = useState<TagRole>('self');

  const genderList = useMemo(() => flattenTags(genderTags), [genderTags]);
  const religionList = useMemo(() => flattenTags(religionTags), [religionTags]);
  const politicsList = useMemo(() => flattenTags(politicsTags), [politicsTags]);

  useEffect(() => {
    let mounted = true;

    const loadTags = async () => {
      if (!category) return;
      setTagStatus('loading');
      try {
        if (['gender', 'religion', 'politics', 'lifestyle'].includes(category)) {
          const requests = [] as Promise<TagsResponse>[];
          if (category === 'gender') requests.push(fetchTags('gender'));
          if (category === 'religion') requests.push(fetchTags('religion'));
          if (category === 'politics') requests.push(fetchTags('politics'));
          if (category === 'lifestyle') requests.push(fetchTags('lifestyle'));
          const [result] = await Promise.all(requests);
          if (!mounted) return;
          if (category === 'gender') setGenderTags(result);
          if (category === 'religion') setReligionTags(result);
          if (category === 'politics') setPoliticsTags(result);
          if (category === 'lifestyle') setLifestyleTags(result);
        } else {
          setTagStatus('idle');
          return;
        }
        setTagStatus('idle');
      } catch (error) {
        if (!mounted) return;
        setMessage(error instanceof Error ? error.message : 'Failed to load tag options');
        setTagStatus('error');
      }
    };

    loadTags();
    return () => {
      mounted = false;
    };
  }, [category]);

  useEffect(() => {
    if (!draft) return;
    hydrate(draft);
  }, [draft, ageSelf]);

  useEffect(() => {
    setMessage(null);
  }, [category]);

  useEffect(() => {
    if (category !== 'lifestyle') {
      lifestyleGroupHydrated.current = false;
      return;
    }
    if (!lifestyleTags) return;
    if (lifestyleGroupHydrated.current) return;
    setLifestyleGroupImportance(buildLifestyleGroupImportance(lifestyleTags, lifestylePrefs));
    lifestyleGroupHydrated.current = true;
  }, [category, lifestyleTags, lifestylePrefs]);

  useEffect(() => {
    let mounted = true;

    const checkPermission = async () => {
      if (category !== 'location') return;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!mounted) return;
        setLocationPermission(status);
      } catch {
        if (!mounted) return;
        setLocationPermission('unknown');
      }
    };

    checkPermission();
    return () => {
      mounted = false;
    };
  }, [category]);

  const hydrate = (filters: Filters) => {
    setRelationshipMode(filters.relationshipMode?.self ?? '');
    setGenderSelf(filters.gender?.self ?? '');
    setGenderSeeking(filters.gender?.seeking ?? []);
    setGenderImportance(filters.gender?.importance ?? 'NOT_IMPORTANT');

    if (filters.age?.min !== undefined && filters.age?.max !== undefined) {
      setAgeRange([filters.age.min, filters.age.max]);
    } else {
      setAgeRange(defaultAgeRange(ageSelf));
    }
    setAgeImportance(filters.age?.importance ?? 'NOT_IMPORTANT');

    const radiusKmValue = filters.location?.radiusKm;
    const scope = filters.location?.scope;
    setLat(filters.location?.lat ?? null);
    setLon(filters.location?.lon ?? null);
    setCountryCode(filters.location?.countryCode?.toUpperCase() ?? '');
    if (scope === 'WORLDWIDE') {
      setLocationScope('worldwide');
    } else if (scope === 'COUNTRY') {
      setLocationScope('country');
    } else if (scope === 'NEARBY') {
      setLocationScope('nearby');
    } else if (radiusKmValue === WORLDWIDE_RADIUS_KM) {
      setLocationScope('worldwide');
    } else if (radiusKmValue === COUNTRY_RADIUS_KM) {
      setLocationScope('country');
    } else {
      setLocationScope('nearby');
      if (radiusKmValue !== undefined) {
        const unit = filters.location?.distanceUnit === 'MI' ? 'mi' : 'km';
        const value = unit === 'mi' ? radiusKmValue / 1.60934 : radiusKmValue;
        setRadiusUnit(unit);
        setRadiusValue(Math.round(value));
      } else {
        setRadiusValue(25);
        setRadiusUnit('mi');
      }
    }

    setReligionSelf(filters.religion?.self ?? '');
    setReligionImportance(filters.religion?.importance ?? 'NOT_IMPORTANT');

    setPoliticsSelf(filters.politics?.self ?? '');
    setPoliticsImportance(filters.politics?.importance ?? 'NOT_IMPORTANT');

    const lifestyleSelfTags = filters.lifestyle?.self ?? [];
    setLifestyleSelf(lifestyleSelfTags);
    const lifestyleMap: Record<string, Importance> = {};
    (filters.lifestyle?.preferences ?? []).forEach((pref) => {
      if (lifestyleSelfTags.includes(pref.tag)) {
        lifestyleMap[pref.tag] = pref.importance;
      }
    });
    setLifestylePrefs(lifestyleMap);
    lifestyleGroupHydrated.current = false;
  };

  const formatCoordinate = (value: number) => value.toFixed(3);

  const formatPlacemark = (placemark: Location.LocationGeocodedAddress) => {
    const city = placemark.city || placemark.subregion || '';
    const region = placemark.region || '';
    const country = placemark.country || '';
    if (city && region) return `${city}, ${region}`;
    if (city) return city;
    if (region) return region;
    return country;
  };

  const locationLabel = useMemo(() => {
    if (locating) return 'Locating…';
    if (geocoding) return 'Finding location…';
    if (locationName) return locationName;
    if (lat !== null && lon !== null) {
      return `Lat ${formatCoordinate(lat)} · Lon ${formatCoordinate(lon)}`;
    }
    if (locationPermission === 'denied') {
      return 'Enable location';
    }
    return 'Locate';
  }, [geocoding, lat, locating, locationName, lon, locationPermission]);

  useEffect(() => {
    let mounted = true;

    const runGeocode = async () => {
      if (lat === null || lon === null) {
        setLocationName('');
        setCountryCode('');
        setCountryName('');
        return;
      }
      setGeocoding(true);
      try {
        const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (!mounted) return;
        const top = results[0];
        setLocationName(top ? formatPlacemark(top) : '');
        setCountryCode(top?.isoCountryCode ? top.isoCountryCode.toUpperCase() : '');
        setCountryName(top?.country ?? '');
      } catch {
        if (!mounted) return;
        setLocationName('');
        setCountryCode('');
        setCountryName('');
      } finally {
        if (mounted) setGeocoding(false);
      }
    };

    runGeocode();
    return () => {
      mounted = false;
    };
  }, [lat, lon]);

  const handleUseLocation = useCallback(async () => {
    if (locating) return;
    setMessage(null);
    setLocating(true);
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const request = await Location.requestForegroundPermissionsAsync();
        status = request.status;
      }
      setLocationPermission(status);
      if (status !== 'granted') {
        setMessage('Location is required to use the app. Please enable location services.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLat(position.coords.latitude);
      setLon(position.coords.longitude);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to get location');
    } finally {
      setLocating(false);
    }
  }, [locating]);

  useEffect(() => {
    if (category !== 'location') return;
    if (autoLocateRef.current) return;
    autoLocateRef.current = true;
    handleUseLocation();
  }, [category, handleUseLocation]);

  const handleSave = async () => {
    if (!account || !category) return;
    setMessage(null);

    if (category === 'location') {
      if (lat === null || lon === null) {
        setMessage('Location is required to use the app. Please enable location services.');
        return;
      }
      if (locationScope === 'country' && !countryCode) {
        setMessage('We could not determine your country. Please try again.');
        return;
      }
      if (locationScope === 'nearby' && radiusValue < RADIUS_MIN) {
        setMessage('Please choose a valid nearby radius.');
        return;
      }
    }

    const radiusKm =
      locationScope === 'nearby'
        ? radiusUnit === 'mi'
          ? radiusValue * 1.60934
          : radiusValue
        : locationScope === 'country'
          ? COUNTRY_RADIUS_KM
          : WORLDWIDE_RADIUS_KM;
    const scope =
      locationScope === 'nearby'
        ? 'NEARBY'
        : locationScope === 'country'
          ? 'COUNTRY'
          : 'WORLDWIDE';
    const distanceUnit = locationScope === 'nearby' ? (radiusUnit === 'mi' ? 'MI' : 'KM') : undefined;

    const payload: Filters = {
      relationshipMode: relationshipMode ? { self: relationshipMode } : undefined,
      gender: {
        self: genderSelf || undefined,
        seeking: genderSeeking.length ? genderSeeking : undefined,
        importance: genderImportance,
      },
      age: {
        self: ageSelf ?? undefined,
        min: ageRange[0],
        max: ageRange[1],
        importance: ageImportance,
      },
      location: {
        lat: lat ?? undefined,
        lon: lon ?? undefined,
        radiusKm,
        scope,
        countryCode: countryCode || undefined,
        distanceUnit,
      },
    };

    if (religionSelf) {
      payload.religion = {
        self: religionSelf || undefined,
        importance: religionImportance,
      };
    }

    if (politicsSelf) {
      payload.politics = {
        self: politicsSelf || undefined,
        importance: politicsImportance,
      };
    }

    if (lifestyleSelf.length || Object.keys(lifestylePrefs).length) {
      const lifestyleSelfSet = new Set(lifestyleSelf);
      const lifestylePreferences = Object.entries(lifestylePrefs)
        .filter(([tag]) => lifestyleSelfSet.has(tag))
        .map(([tag, importance]) => ({ tag, importance }));
      payload.lifestyle = {
        self: lifestyleSelf.length ? lifestyleSelf : undefined,
        preferences: lifestylePreferences.length ? lifestylePreferences : undefined,
      };
    }

    updateDraft(payload);
    router.back();
  };

  const setLifestyleGroupImportanceValue = (group: string, importance: Importance) => {
    setLifestyleGroupImportance((prev) => ({ ...prev, [group]: importance }));
    if (!lifestyleTags) return;
    const groupTags = lifestyleTags[group] ?? [];
    if (!groupTags.length) return;
    setLifestylePrefs((prev) => {
      const next = { ...prev };
      for (const tag of groupTags) {
        if (!lifestyleSelf.includes(tag)) {
          delete next[tag];
          continue;
        }
        if (importance === 'NOT_IMPORTANT') {
          delete next[tag];
          continue;
        }
        next[tag] = importance;
      }
      return next;
    });
  };

  const toggleLifestyleSelfTag = (group: string, groupTags: string[], tag: string) => {
    const groupImportance = lifestyleGroupImportance[group] ?? 'NOT_IMPORTANT';
    const groupTagSet = new Set(groupTags);
    const isSelected = lifestyleSelf.includes(tag);
    const nextSelf = isSelected
      ? lifestyleSelf.filter((t) => !groupTagSet.has(t))
      : [...lifestyleSelf.filter((t) => !groupTagSet.has(t)), tag];

    setLifestyleSelf(nextSelf);
    setLifestylePrefs((prev) => {
      const next = { ...prev };
      for (const t of groupTags) {
        if (nextSelf.includes(t) && groupImportance !== 'NOT_IMPORTANT') {
          next[t] = groupImportance;
        } else {
          delete next[t];
        }
      }
      return next;
    });
  };

  const handleSelectTag = (tag: string) => {
    if (!category) return;

    if (category === 'gender') {
      if (activeRole === 'self') {
        setGenderSelf(genderSelf === tag ? '' : tag);
        setGenderSeeking(genderSeeking.filter((t) => t !== tag));
      } else {
        setGenderSelf(genderSelf === tag ? '' : genderSelf);
        setGenderSeeking(toggleItem(genderSeeking, tag));
      }
      return;
    }

    if (category === 'religion') {
      setReligionSelf(religionSelf === tag ? '' : tag);
      return;
    }

    if (category === 'politics') {
      setPoliticsSelf(politicsSelf === tag ? '' : tag);
      return;
    }
  };

  const title = CATEGORY_LABELS[category ?? ''] ?? 'Filters';

  if (!account || !token) {
    return (
      <View style={[styles.modalOverlay, { backgroundColor: overlayColor }]}>
        <View style={[styles.modalCard, { backgroundColor: modalBg, borderColor }]}>
          <View style={styles.modalHeader}>
            <ThemedText type="defaultSemiBold">{title}</ThemedText>
            <Pressable onPress={() => router.back()}>
              <ThemedText style={[styles.linkText, { color: muted }]}>Close</ThemedText>
            </Pressable>
          </View>
          <ThemedText type="subtitle">Log in to edit your filters.</ThemedText>
        </View>
      </View>
    );
  }

  if (draftStatus === 'loading' && !draft) {
    return (
      <View style={[styles.modalOverlay, { backgroundColor: overlayColor }]}>
        <View style={[styles.modalCard, { backgroundColor: modalBg, borderColor }]}>
          <View style={styles.stateBlock}>
            <ActivityIndicator />
            <ThemedText>Loading…</ThemedText>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.modalOverlay, { backgroundColor: overlayColor }]}>
      <View style={[styles.modalCard, { backgroundColor: modalBg, borderColor }]}>
        <View style={styles.modalHeader}>
          <ThemedText type="defaultSemiBold">{title}</ThemedText>
          <Pressable onPress={() => router.back()}>
            <ThemedText style={[styles.linkText, { color: muted }]}>Close</ThemedText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
        {(tagStatus === 'loading' || draftStatus === 'loading') && (
          <View style={styles.stateBlock}>
            <ActivityIndicator />
            <ThemedText>Loading…</ThemedText>
          </View>
        )}

        {message && (
          <View style={styles.stateBlock}>
            <ThemedText style={[styles.muted, { color: muted }]}>{message}</ThemedText>
          </View>
        )}

        {!message && draftMessage && (
          <View style={styles.stateBlock}>
            <ThemedText style={[styles.muted, { color: muted }]}>{draftMessage}</ThemedText>
          </View>
        )}

        {category === 'relationship' && (
          <Section title="Relationship mode">
            <ChipRow
              options={RELATIONSHIP_MODES}
              selected={relationshipMode ? [relationshipMode] : []}
              onToggle={(value) => setRelationshipMode(value)}
              borderColor={borderColor}
              palette={importancePalette}
            />
            <ThemedText style={[styles.helperText, { color: muted }]}>
              Focused: fewer matches, higher compatibility.{"\n"}
              Balanced: moderate volume, moderate threshold.{"\n"}
              Exploratory: wider net, lower threshold.
            </ThemedText>
          </Section>
        )}

        {category === 'age' && (
          <Section title="Age">
            <View style={styles.ageRow}>
              <ThemedText style={[styles.label, { color: muted }]}>Your age</ThemedText>
              <View style={[styles.ageValue, { borderColor, backgroundColor: inputBg }]}>
                <ThemedText>
                  {ageSelf !== null ? `${ageSelf}` : 'Not available'}
                </ThemedText>
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
            <ImportanceRow
              value={ageImportance}
              onChange={setAgeImportance}
              palette={importancePalette}
              borderColor={borderColor}
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
                  onPress={() => setLocationScope(option.value as typeof locationScope)}
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
                pressed && !locating ? styles.locationPillPressed : null,
              ]}
            >
              <ThemedText
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.locationPillText, { color: muted }]}
              >
                {locating ? 'Locating…' : locationLabel}
              </ThemedText>
            </Pressable>
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
                      onPress={() => setRadiusUnit(option.value as typeof radiusUnit)}
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
            {locationScope === 'worldwide' && (
              <ThemedText style={[styles.helperText, { color: muted }]}>
                Search is global, no radius needed.
              </ThemedText>
            )}
          </Section>
        )}

        {category === 'gender' && (
          <TagSections
            selfLabel="Self"
            seekingLabel="Seeking"
            allLabel="All tags"
            selfTags={genderSelf ? [genderSelf] : []}
            seekingTags={genderSeeking}
            allTags={genderList}
            importance={genderImportance}
            importanceByTag={{}}
            activeRole={activeRole}
            onRoleChange={setActiveRole}
            onSelectTag={handleSelectTag}
            showImportance
            onImportanceChange={setGenderImportance}
            roleActiveBg={roleActiveBg}
            borderColor={borderColor}
            palette={importancePalette}
            muted={muted}
          />
        )}

        {category === 'religion' && (
          <Section title="Religion">
            <ThemedText style={[styles.label, { color: muted }]}>Your religion</ThemedText>
            <ChipRow
              options={religionList}
              selected={religionSelf ? [religionSelf] : []}
              onToggle={(tag) => setReligionSelf(religionSelf === tag ? '' : tag)}
              palette={importancePalette}
              borderColor={borderColor}
            />
            <ThemedText style={[styles.label, { color: muted }]}>
              How important is religious alignment?
            </ThemedText>
            <ImportanceRow
              value={religionImportance}
              onChange={setReligionImportance}
              palette={importancePalette}
              borderColor={borderColor}
              options={ALIGNMENT_IMPORTANCE_OPTIONS}
            />
          </Section>
        )}

        {category === 'politics' && (
          <Section title="Politics">
            <ThemedText style={[styles.label, { color: muted }]}>Your politics</ThemedText>
            <ChipRow
              options={politicsList}
              selected={politicsSelf ? [politicsSelf] : []}
              onToggle={(tag) => setPoliticsSelf(politicsSelf === tag ? '' : tag)}
              palette={importancePalette}
              borderColor={borderColor}
            />
            <ThemedText style={[styles.label, { color: muted }]}>
              How important is political alignment?
            </ThemedText>
            <ImportanceRow
              value={politicsImportance}
              onChange={setPoliticsImportance}
              palette={importancePalette}
              borderColor={borderColor}
              options={ALIGNMENT_IMPORTANCE_OPTIONS}
            />
          </Section>
        )}

        {category === 'lifestyle' && (
          <View style={styles.section}>
            {(lifestyleTags ? Object.entries(lifestyleTags) : []).map(([group, tags]) => {
              const groupImportance = lifestyleGroupImportance[group] ?? 'NOT_IMPORTANT';
              const groupSelfTags = lifestyleSelf.filter((tag) => tags.includes(tag));

              return (
                <View
                  key={group}
                  style={[
                    styles.groupSection,
                    { borderColor, backgroundColor: cardBg },
                  ]}
                >
                  <ThemedText type="defaultSemiBold">{formatTagGroupLabel(group)}</ThemedText>
                  <ThemedText style={[styles.label, { color: muted }]}>Your lifestyle</ThemedText>
                  <ChipRow
                    options={tags}
                    selected={groupSelfTags}
                    onToggle={(tag) => toggleLifestyleSelfTag(group, tags, tag)}
                    palette={importancePalette}
                    borderColor={borderColor}
                  />
                  <ThemedText style={[styles.label, { color: muted }]}>
                    How important is it that your partner matches your selections?
                  </ThemedText>
                  <ImportanceRow
                    value={groupImportance}
                    onChange={(value) => setLifestyleGroupImportanceValue(group, value)}
                    palette={importancePalette}
                    borderColor={borderColor}
                  />
                </View>
              );
            })}
          </View>
        )}

        <Pressable style={[styles.saveButton, { backgroundColor: primaryBg }]} onPress={handleSave}>
          <ThemedText style={[styles.saveButtonText, { color: primaryText }]}>
            Apply
          </ThemedText>
        </Pressable>
        </ScrollView>
      </View>

    </View>
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
      style={[
        styles.optionPill,
        { borderColor },
        selected && { backgroundColor: activeBg },
      ]}
    >
      <ThemedText style={[styles.optionPillText, selected && styles.optionPillTextActive]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function TagSections({
  selfLabel,
  seekingLabel,
  allLabel,
  selfTags,
  seekingTags,
  allTags,
  importance,
  importanceByTag,
  activeRole,
  onRoleChange,
  onSelectTag,
  showImportance = false,
  onImportanceChange,
  importanceLabel,
  importanceOptions,
  roleActiveBg,
  borderColor,
  palette,
  muted,
}: {
  selfLabel: string;
  seekingLabel: string;
  allLabel: string;
  selfTags: string[];
  seekingTags: string[];
  allTags: string[];
  importance: Importance;
  importanceByTag: Record<string, Importance>;
  activeRole: TagRole;
  onRoleChange: (role: TagRole) => void;
  onSelectTag: (tag: string) => void;
  showImportance?: boolean;
  onImportanceChange?: (value: Importance) => void;
  importanceLabel?: string;
  importanceOptions?: { label: string; value: Importance }[];
  roleActiveBg: string;
  borderColor: string;
  palette: ImportancePalette;
  muted: string;
}) {
  const formatRoleLabel = (tags: string[]) => {
    if (!tags.length) return '+';
    const firstTag = formatTagLabel(tags[0]);
    if (tags.length === 1) return firstTag;
    return `${firstTag} +${tags.length - 1}`;
  };

  return (
    <View style={styles.section}>
      <View style={styles.roleRowLabels}>
        <ThemedText style={[styles.roleLabel, { color: muted }]}>{selfLabel}</ThemedText>
        <ThemedText style={[styles.roleLabel, { color: muted }]}>{seekingLabel}</ThemedText>
      </View>
      <View style={styles.roleRow}>
        <Pressable
          style={[
            styles.rolePill,
            { borderColor },
            activeRole === 'self' && { backgroundColor: roleActiveBg },
          ]}
          onPress={() => onRoleChange('self')}
        >
          <ThemedText style={[styles.rolePillText, activeRole === 'self' && styles.rolePillTextActive]}>
            {formatRoleLabel(selfTags)}
          </ThemedText>
        </Pressable>
        <Pressable
          style={[
            styles.rolePill,
            { borderColor },
            activeRole === 'seeking' && { backgroundColor: roleActiveBg },
          ]}
          onPress={() => onRoleChange('seeking')}
        >
          <ThemedText style={[styles.rolePillText, activeRole === 'seeking' && styles.rolePillTextActive]}>
            {formatRoleLabel(seekingTags)}
          </ThemedText>
        </Pressable>
      </View>
      {showImportance && activeRole === 'seeking' && onImportanceChange ? (
        <View style={styles.section}>
          {importanceLabel ? (
            <ThemedText style={[styles.label, { color: muted }]}>{importanceLabel}</ThemedText>
          ) : null}
          <ImportanceRow
            value={importance}
            onChange={onImportanceChange}
            palette={palette}
            borderColor={borderColor}
            options={importanceOptions}
          />
        </View>
      ) : null}
      <ThemedText style={[styles.label, { color: muted }]}>{allLabel}</ThemedText>
      <ChipRow
        options={allTags}
        selected={activeRole === 'self' ? selfTags : seekingTags}
        onToggle={onSelectTag}
        palette={palette}
        borderColor={borderColor}
        importance={importance}
        importanceByTag={importanceByTag}
      />
    </View>
  );
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
  if (age === null) {
    return [AGE_MIN, Math.min(AGE_MIN + 4, AGE_MAX)];
  }
  const min = Math.max(AGE_MIN, age - 4);
  const max = Math.min(AGE_MAX, age + 4);
  return [min, Math.max(min, max)];
}

function ChipRow({
  options,
  selected,
  onToggle,
  palette,
  borderColor,
  importance = 'NOT_IMPORTANT',
  importanceByTag,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  palette: ImportancePalette;
  borderColor: string;
  importance?: Importance;
  importanceByTag?: Record<string, Importance>;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = selected.includes(option);
        const chipImportance = importanceByTag?.[option] ?? importance;
        const importanceStyle = palette[chipImportance];
        return (
          <Pressable
            key={option}
            style={[
              styles.chip,
              { borderColor },
              active && { backgroundColor: importanceStyle.bg, borderColor: importanceStyle.border },
            ]}
            onPress={() => onToggle(option)}
          >
            <ThemedText
              style={[
                styles.chipText,
                active && { color: importanceStyle.text },
              ]}
            >
              {formatTagLabel(option)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function ImportanceRow({
  value,
  onChange,
  palette,
  borderColor,
  options = IMPORTANCE_OPTIONS,
}: {
  value: Importance;
  onChange: (value: Importance) => void;
  palette: ImportancePalette;
  borderColor: string;
  options?: { label: string; value: Importance }[];
}) {
  return (
    <View style={styles.importanceRow}>
      {options.map((option) => {
        const active = option.value === value;
        const importanceStyle = palette[option.value];
        return (
          <Pressable
            key={option.value}
            style={[
              styles.chip,
              { borderColor },
              active && { backgroundColor: importanceStyle.bg, borderColor: importanceStyle.border },
            ]}
            onPress={() => onChange(option.value)}
          >
            <ThemedText
              style={[
                styles.chipText,
                active && { color: importanceStyle.text },
              ]}
            >
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  content: {
    gap: 16,
    paddingBottom: 8,
  },
  stateBlock: {
    gap: 8,
  },
  section: {
    gap: 12,
  },
  label: {
    opacity: 0.7,
  },
  helperText: {
    fontSize: 12,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleRowLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roleLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.6,
  },
  rolePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    alignItems: 'center',
  },
  rolePillText: {
    opacity: 0.7,
    fontWeight: '600',
    fontSize: 12,
  },
  rolePillTextActive: {
    opacity: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    opacity: 0.8,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  optionPillText: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
  },
  optionPillTextActive: {
    opacity: 1,
  },
  locationPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  locationPillText: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
  },
  locationPillPressed: {
    transform: [{ scale: 0.98 }],
  },
  importanceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ageRow: {
    gap: 6,
  },
  ageValue: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  sliderBlock: {
    gap: 10,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderContainer: {
    height: 32,
  },
  sliderTrack: {
    height: 4,
    borderRadius: 999,
  },
  groupSection: {
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontWeight: '600',
  },
  muted: {
    opacity: 0.6,
  },
  linkText: {
    opacity: 0.7,
  },
});
