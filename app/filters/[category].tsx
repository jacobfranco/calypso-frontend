import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MultiSlider from '@ptomasroos/react-native-multi-slider';

import { ThemedText } from '@/components/themed-text';
import {
  Filters,
  Importance,
  TagPreference,
  TagsResponse,
  fetchTags,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFiltersDraft } from '@/lib/filters-draft';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

const IMPORTANCE_OPTIONS: { label: string; value: Importance }[] = [
  { label: 'Not important', value: 'NOT_IMPORTANT' },
  { label: 'Preference', value: 'PREFERENCE' },
  { label: 'Dealbreaker', value: 'DEALBREAKER' },
];

const RELATIONSHIP_MODES = ['casual', 'serious'];
const AGE_MIN = 18;
const AGE_MAX = 99;

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
  const softBorder = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.08)', dark: 'rgba(255, 255, 255, 0.12)' },
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
  const placeholderColor = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.4)', dark: 'rgba(255, 255, 255, 0.4)' },
    'text'
  );
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

  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [radiusKm, setRadiusKm] = useState('');
  const [locationPermission, setLocationPermission] = useState<LocationPermission>('unknown');
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [locationName, setLocationName] = useState('');

  const [religionSelf, setReligionSelf] = useState('');
  const [religionSeeking, setReligionSeeking] = useState<string[]>([]);
  const [religionImportance, setReligionImportance] = useState<Importance>('NOT_IMPORTANT');

  const [politicsSelf, setPoliticsSelf] = useState('');
  const [politicsSeeking, setPoliticsSeeking] = useState<string[]>([]);
  const [politicsImportance, setPoliticsImportance] = useState<Importance>('NOT_IMPORTANT');

  const [lifestyleSelf, setLifestyleSelf] = useState<string[]>([]);
  const [lifestylePrefs, setLifestylePrefs] = useState<Record<string, Importance>>({});

  const [genderTags, setGenderTags] = useState<TagsResponse | null>(null);
  const [religionTags, setReligionTags] = useState<TagsResponse | null>(null);
  const [politicsTags, setPoliticsTags] = useState<TagsResponse | null>(null);
  const [lifestyleTags, setLifestyleTags] = useState<TagsResponse | null>(null);

  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<TagRole>('self');
  const [activeImportance, setActiveImportance] = useState<Importance>('NOT_IMPORTANT');

  const genderList = useMemo(() => flattenTags(genderTags), [genderTags]);
  const religionList = useMemo(() => flattenTags(religionTags), [religionTags]);
  const politicsList = useMemo(() => flattenTags(politicsTags), [politicsTags]);
  const lifestyleList = useMemo(() => flattenTags(lifestyleTags), [lifestyleTags]);

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

    setLat(filters.location?.lat !== undefined ? String(filters.location.lat) : '');
    setLon(filters.location?.lon !== undefined ? String(filters.location.lon) : '');
    setRadiusKm(filters.location?.radiusKm !== undefined ? String(filters.location.radiusKm) : '');

    setReligionSelf(filters.religion?.self ?? '');
    setReligionSeeking(filters.religion?.seeking ?? []);
    setReligionImportance(filters.religion?.importance ?? 'NOT_IMPORTANT');

    setPoliticsSelf(filters.politics?.self ?? '');
    setPoliticsSeeking(filters.politics?.seeking ?? []);
    setPoliticsImportance(filters.politics?.importance ?? 'NOT_IMPORTANT');

    setLifestyleSelf(filters.lifestyle?.self ?? []);
    const lifestyleMap: Record<string, Importance> = {};
    (filters.lifestyle?.preferences ?? []).forEach((pref) => {
      lifestyleMap[pref.tag] = pref.importance;
    });
    setLifestylePrefs(lifestyleMap);
  };

  const formatCoordinate = (value: string) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return value;
    return parsed.toFixed(3);
  };

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
    if (lat && lon) {
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
      if (!lat || !lon) {
        setLocationName('');
        return;
      }
      setGeocoding(true);
      try {
        const latitude = Number(lat);
        const longitude = Number(lon);
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
          setLocationName('');
          return;
        }
        const results = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (!mounted) return;
        const top = results[0];
        setLocationName(top ? formatPlacemark(top) : '');
      } catch {
        if (!mounted) return;
        setLocationName('');
      } finally {
        if (mounted) setGeocoding(false);
      }
    };

    runGeocode();
    return () => {
      mounted = false;
    };
  }, [lat, lon]);

  const handleUseLocation = async () => {
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
        setMessage('Location permission not granted.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLat(String(position.coords.latitude));
      setLon(String(position.coords.longitude));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to get location');
    } finally {
      setLocating(false);
    }
  };

  const buildPreferences = (prefs: Record<string, Importance>): TagPreference[] => {
    return Object.entries(prefs).map(([tag, importance]) => ({ tag, importance }));
  };

  const handleSave = async () => {
    if (!account || !category) return;
    setMessage(null);

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
        lat: lat === '' ? undefined : Number(lat),
        lon: lon === '' ? undefined : Number(lon),
        radiusKm: radiusKm === '' ? undefined : Number(radiusKm),
      },
    };

    if (religionSelf || religionSeeking.length) {
      payload.religion = {
        self: religionSelf || undefined,
        seeking: religionSeeking.length ? religionSeeking : undefined,
        importance: religionImportance,
      };
    }

    if (politicsSelf || politicsSeeking.length) {
      payload.politics = {
        self: politicsSelf || undefined,
        seeking: politicsSeeking.length ? politicsSeeking : undefined,
        importance: politicsImportance,
      };
    }

    if (lifestyleSelf.length || Object.keys(lifestylePrefs).length) {
      payload.lifestyle = {
        self: lifestyleSelf.length ? lifestyleSelf : undefined,
        preferences: Object.keys(lifestylePrefs).length
          ? buildPreferences(lifestylePrefs)
          : undefined,
      };
    }

    updateDraft(payload);
    router.back();
  };

  const openSeekingConfig = (tag: string) => {
    if (!category) return;
    setActiveRole('seeking');
    setActiveTag(tag);

    if (category === 'lifestyle') {
      const importance = lifestylePrefs[tag] ?? 'NOT_IMPORTANT';
      setActiveImportance(importance);
      return;
    }
  };

  const applyTagConfig = () => {
    if (!activeTag || !category) return;

    if (category === 'lifestyle') {
      if (activeRole === 'seeking') {
        setLifestyleSelf(lifestyleSelf.filter((t) => t !== activeTag));
        setLifestylePrefs((prev) => ({
          ...prev,
          [activeTag]: activeImportance,
        }));
      }
    }

    setActiveTag(null);
  };

  const removePreference = (tag: string) => {
    if (category === 'lifestyle') {
      setLifestylePrefs((prev) => {
        const next = { ...prev };
        delete next[tag];
        return next;
      });
      return;
    }
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
      if (activeRole === 'self') {
        setReligionSelf(religionSelf === tag ? '' : tag);
        setReligionSeeking(religionSeeking.filter((t) => t !== tag));
      } else {
        setReligionSelf(religionSelf === tag ? '' : religionSelf);
        setReligionSeeking(toggleItem(religionSeeking, tag));
      }
      return;
    }

    if (category === 'politics') {
      if (activeRole === 'self') {
        setPoliticsSelf(politicsSelf === tag ? '' : tag);
        setPoliticsSeeking(politicsSeeking.filter((t) => t !== tag));
      } else {
        setPoliticsSelf(politicsSelf === tag ? '' : politicsSelf);
        setPoliticsSeeking(toggleItem(politicsSeeking, tag));
      }
      return;
    }

    if (category === 'lifestyle') {
      if (activeRole === 'self') {
        setLifestyleSelf(toggleItem(lifestyleSelf, tag));
        setLifestylePrefs((prev) => {
          const next = { ...prev };
          delete next[tag];
          return next;
        });
      } else {
        if (lifestylePrefs[tag]) {
          openSeekingConfig(tag);
        } else {
          setLifestyleSelf(lifestyleSelf.filter((t) => t !== tag));
          setLifestylePrefs((prev) => ({
            ...prev,
            [tag]: activeImportance,
          }));
        }
      }
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
            <View style={styles.sliderBlock}>
              <View style={styles.sliderHeader}>
                <ThemedText style={[styles.label, { color: muted }]}>Age range</ThemedText>
                <ThemedText style={[styles.label, { color: muted }]}>
                  {ageRange[0]} - {ageRange[1]}
                </ThemedText>
              </View>
              <MultiSlider
                values={ageRange}
                min={AGE_MIN}
                max={AGE_MAX}
                step={1}
                onValuesChange={(values) => setAgeRange([values[0], values[1]])}
                selectedStyle={{ backgroundColor: inputText }}
                unselectedStyle={{ backgroundColor: borderColor }}
                markerStyle={{ backgroundColor: inputText, borderColor }}
                trackStyle={styles.sliderTrack}
                containerStyle={styles.sliderContainer}
              />
            </View>
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
            <View style={styles.inlineRow}>
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
              <Input
                label="Radius km"
                value={radiusKm}
                onChange={setRadiusKm}
                borderColor={borderColor}
                inputBg={inputBg}
                placeholderColor={placeholderColor}
                textColor={inputText}
                labelColor={muted}
              />
            </View>
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
          <TagSections
            selfLabel="Self"
            seekingLabel="Seeking"
            allLabel="All tags"
            selfTags={religionSelf ? [religionSelf] : []}
            seekingTags={religionSeeking}
            allTags={religionList}
            importance={religionImportance}
            importanceByTag={{}}
            activeRole={activeRole}
            onRoleChange={setActiveRole}
            onSelectTag={handleSelectTag}
            showImportance
            onImportanceChange={setReligionImportance}
            roleActiveBg={roleActiveBg}
            borderColor={borderColor}
            palette={importancePalette}
            muted={muted}
          />
        )}

        {category === 'politics' && (
          <TagSections
            selfLabel="Self"
            seekingLabel="Seeking"
            allLabel="All tags"
            selfTags={politicsSelf ? [politicsSelf] : []}
            seekingTags={politicsSeeking}
            allTags={politicsList}
            importance={politicsImportance}
            importanceByTag={{}}
            activeRole={activeRole}
            onRoleChange={setActiveRole}
            onSelectTag={handleSelectTag}
            showImportance
            onImportanceChange={setPoliticsImportance}
            roleActiveBg={roleActiveBg}
            borderColor={borderColor}
            palette={importancePalette}
            muted={muted}
          />
        )}

        {category === 'lifestyle' && (
          <TagSections
            selfLabel="Self"
            seekingLabel="Seeking"
            allLabel="All tags"
            selfTags={lifestyleSelf}
            seekingTags={Object.keys(lifestylePrefs)}
            allTags={lifestyleList}
            importance={activeImportance}
            importanceByTag={lifestylePrefs}
            activeRole={activeRole}
            onRoleChange={setActiveRole}
            onSelectTag={handleSelectTag}
            roleActiveBg={roleActiveBg}
            borderColor={borderColor}
            palette={importancePalette}
            muted={muted}
          />
        )}

        <Pressable style={[styles.saveButton, { backgroundColor: primaryBg }]} onPress={handleSave}>
          <ThemedText style={[styles.saveButtonText, { color: primaryText }]}>
            Apply
          </ThemedText>
        </Pressable>
        </ScrollView>
      </View>

      <TagConfigModal
        visible={activeTag !== null && activeRole === 'seeking'}
        tag={activeTag ?? ''}
        importance={activeImportance}
        onImportanceChange={setActiveImportance}
        onRemove={() => {
          if (!activeTag || !category) return;
          if (category === 'lifestyle') {
            removePreference(activeTag);
          }
          setActiveTag(null);
        }}
        onClose={() => setActiveTag(null)}
        onApply={applyTagConfig}
        borderColor={borderColor}
        primaryBg={primaryBg}
        primaryText={primaryText}
        muted={muted}
        overlayColor={overlayColor}
        modalBg={modalBg}
        palette={importancePalette}
      />
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
  roleActiveBg: string;
  borderColor: string;
  palette: ImportancePalette;
  muted: string;
}) {
  const formatRoleLabel = (tags: string[]) => {
    if (!tags.length) return '+';
    if (tags.length === 1) return tags[0];
    return `${tags[0]} +${tags.length - 1}`;
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
        <ImportanceRow
          value={importance}
          onChange={onImportanceChange}
          palette={palette}
          borderColor={borderColor}
        />
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

function TagConfigModal({
  visible,
  tag,
  importance,
  onImportanceChange,
  onRemove,
  onClose,
  onApply,
  borderColor,
  primaryBg,
  primaryText,
  muted,
  overlayColor,
  modalBg,
  palette,
}: {
  visible: boolean;
  tag: string;
  importance: Importance;
  onImportanceChange: (value: Importance) => void;
  onRemove: () => void;
  onClose: () => void;
  onApply: () => void;
  borderColor: string;
  primaryBg: string;
  primaryText: string;
  muted: string;
  overlayColor: string;
  modalBg: string;
  palette: ImportancePalette;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: overlayColor }]}>
        <View style={[styles.configCard, { backgroundColor: modalBg, borderColor }]}>
          <ThemedText type="defaultSemiBold">{tag}</ThemedText>
          <View style={styles.section}>
            <ThemedText style={[styles.label, { color: muted }]}>Importance</ThemedText>
            <ImportanceRow
              value={importance}
              onChange={onImportanceChange}
              palette={palette}
              borderColor={borderColor}
            />
          </View>
          <View style={styles.configActions}>
            <Pressable onPress={onRemove}>
              <ThemedText style={[styles.linkText, { color: muted }]}>Clear</ThemedText>
            </Pressable>
            <View style={styles.configRight}>
              <Pressable onPress={onClose}>
                <ThemedText style={[styles.linkText, { color: muted }]}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={[styles.primaryButtonSmall, { backgroundColor: primaryBg }]} onPress={onApply}>
                <ThemedText style={[styles.primaryButtonText, { color: primaryText }]}>Apply</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Input({
  label,
  value,
  onChange,
  borderColor,
  inputBg,
  placeholderColor,
  textColor,
  labelColor,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  borderColor: string;
  inputBg: string;
  placeholderColor: string;
  textColor: string;
  labelColor: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <ThemedText style={[styles.label, { color: labelColor }]}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={[styles.input, { borderColor, backgroundColor: inputBg, color: textColor }]}
        keyboardType="numeric"
        placeholder=""
        placeholderTextColor={placeholderColor}
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
              {option}
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
}: {
  value: Importance;
  onChange: (value: Importance) => void;
  palette: ImportancePalette;
  borderColor: string;
}) {
  return (
    <View style={styles.importanceRow}>
      {IMPORTANCE_OPTIONS.map((option) => {
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
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
    gap: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
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
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  configCard: {
    borderRadius: 16,
    padding: 16,
    gap: 16,
    borderWidth: 1,
  },
  configActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  configRight: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  primaryButtonSmall: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontWeight: '600',
  },
});
