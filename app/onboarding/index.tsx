import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInputChangeEventData,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import MultiSlider from '@ptomasroos/react-native-multi-slider';

import { AgeRangeSlider } from '@/components/age-range-slider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  Filters,
  Importance,
  PromptDefinition,
  TagPreference,
  TagsResponse,
  fetchPublicPromptLibrary,
  fetchTags,
  postFilters,
  postPublicPromptAnswer,
  postPublicPromptSelection,
  requestPhoneCode,
  verifyPhoneCode,
} from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

const STEPS = [
  'welcome',
  'phone',
  'verify',
  'name',
  'dob',
  'gender',
  'religion',
  'politics',
  'relationship',
  'lifestyle',
  'location',
  'prompts',
] as const;

type StepKey = (typeof STEPS)[number];

const RELATIONSHIP_OPTIONS = ['focused', 'balanced', 'exploratory'];
const ALIGNMENT_IMPORTANCE_OPTIONS: { label: string; value: Importance }[] = [
  { label: 'Not important', value: 'NOT_IMPORTANT' },
  { label: 'Nice to have', value: 'PREFERENCE' },
  { label: 'Important', value: 'DEALBREAKER' },
];
const MIN_AGE = 18;
const MAX_AGE = 99;
const CODE_LENGTH = 6;
const RADIUS_MIN = 1;
const RADIUS_MAX = 100;
const COUNTRY_RADIUS_KM = 3000;
const WORLDWIDE_RADIUS_KM = 30000;
const PROMPT_MIN_SELECTION = 1;
const PROMPT_MAX_SELECTION = 5;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type LocationPermission = Location.PermissionStatus | 'unknown';

export default function OnboardingScreen() {
  const { completePhoneSignup, loginWithToken } = useAuth();
  const nameInputRef = useRef<TextInput>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [fallbackCode, setFallbackCode] = useState('');
  const [existingAccount, setExistingAccount] = useState(false);
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [ageRange, setAgeRange] = useState<[number, number]>([MIN_AGE, MIN_AGE + 4]);
  const [gender, setGender] = useState('');
  const [genderSeeking, setGenderSeeking] = useState<string[]>([]);
  const [religion, setReligion] = useState('');
  const [religionImportance, setReligionImportance] = useState<Importance>('NOT_IMPORTANT');
  const [politics, setPolitics] = useState('');
  const [politicsImportance, setPoliticsImportance] = useState<Importance>('NOT_IMPORTANT');
  const [relationshipMode, setRelationshipMode] = useState('');
  const [lifestyleSelections, setLifestyleSelections] = useState<string[]>([]);
  const [lifestyleImportanceByGroup, setLifestyleImportanceByGroup] = useState<Record<string, Importance>>({});
  const [locationScope, setLocationScope] = useState<'nearby' | 'country' | 'worldwide'>('nearby');
  const [radiusUnit, setRadiusUnit] = useState<'mi' | 'km'>('mi');
  const [radiusValue, setRadiusValue] = useState(25);
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [countryCode, setCountryCode] = useState('');
  const [countryName, setCountryName] = useState('');
  const [locationPermission, setLocationPermission] = useState<LocationPermission>('unknown');
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [genderOptions, setGenderOptions] = useState<string[]>([]);
  const [religionOptions, setReligionOptions] = useState<string[]>([]);
  const [politicsOptions, setPoliticsOptions] = useState<string[]>([]);
  const [lifestyleTagGroups, setLifestyleTagGroups] = useState<TagsResponse | null>(null);
  const [promptLibrary, setPromptLibrary] = useState<PromptDefinition[]>([]);
  const [promptSelection, setPromptSelection] = useState<string[]>([]);
  const [promptAnswers, setPromptAnswers] = useState<Record<string, string>>({});
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptEditorPromptId, setPromptEditorPromptId] = useState<string | null>(null);
  const [promptEditorAnswer, setPromptEditorAnswer] = useState('');

  const handleNameChange = (text: string) => {
    setName(text);
  };

  const handleNameEvent = (event: NativeSyntheticEvent<TextInputChangeEventData>) => {
    setName(event.nativeEvent.text);
  };

  const resetPhoneVerification = () => {
    setCode('');
    setVerificationToken('');
    setFallbackCode('');
    setExistingAccount(false);
    setStepIndex(STEPS.indexOf('phone'));
  };

  const borderColor = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.18)' },
    'icon'
  );
  const cardBorder = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.08)', dark: 'rgba(255, 255, 255, 0.12)' },
    'icon'
  );
  const cardBg = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.02)', dark: 'rgba(255, 255, 255, 0.04)' },
    'background'
  );
  const inputBg = useThemeColor(
    { light: 'rgba(255, 255, 255, 0.9)', dark: 'rgba(255, 255, 255, 0.08)' },
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
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  useEffect(() => {
    let mounted = true;
    const loadTags = async () => {
      try {
        const [genderTags, religionTags, politicsTags, lifestyleTagGroups] = await Promise.all([
          fetchTags('gender'),
          fetchTags('religion'),
          fetchTags('politics'),
          fetchTags('lifestyle'),
        ]);
        if (!mounted) return;
        setGenderOptions(Object.values(genderTags).flat());
        setReligionOptions(Object.values(religionTags).flat());
        setPoliticsOptions(Object.values(politicsTags).flat());
        setLifestyleTagGroups(lifestyleTagGroups);
      } catch {
        if (!mounted) return;
        setGenderOptions([]);
        setReligionOptions([]);
        setPoliticsOptions([]);
        setLifestyleTagGroups(null);
      }
    };
    loadTags();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const checkPermission = async () => {
      if (step !== 'location') return;
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
  }, [step]);

  useEffect(() => {
    if (step !== 'name') return;
    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, [step]);

  const age = useMemo(() => {
    if (!birthday) return null;
    return calculateAge(birthday);
  }, [birthday]);

  useEffect(() => {
    if (age === null) return;
    setAgeRange(defaultAgeRange(age));
  }, [age]);

  useEffect(() => {
    if (step === 'prompts') return;
    setPromptEditorPromptId(null);
    setPromptEditorAnswer('');
  }, [step]);

  useEffect(() => {
    if (step !== 'prompts') return;
    let mounted = true;
    setPromptLoading(true);
    setPromptError(null);
    fetchPublicPromptLibrary()
      .then((library) => {
        if (!mounted) return;
        setPromptLibrary(library);
      })
      .catch((error) => {
        if (!mounted) return;
        setPromptError(error instanceof Error ? error.message : 'Unable to load prompts');
        setPromptLibrary([]);
      })
      .finally(() => {
        if (!mounted) return;
        setPromptLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [step]);

  const canContinue = useMemo(() => {
    if (loading) return false;
    if (step === 'welcome') return true;
    if (step === 'phone') return phone.trim().length > 0;
    if (step === 'verify') return code.trim().length >= CODE_LENGTH;
    if (step === 'name') return name.trim().length > 0;
    if (step === 'dob') return age !== null && age >= MIN_AGE;
    if (step === 'gender') return gender.length > 0;
    if (step === 'religion') return religion.length > 0;
    if (step === 'politics') return politics.length > 0;
    if (step === 'relationship') return relationshipMode.length > 0;
    if (step === 'lifestyle') return true;
    if (step === 'location') {
      if (lat === null || lon === null) return false;
      if (locationScope === 'country' && !countryCode) return false;
      if (locationScope === 'nearby') return radiusValue >= RADIUS_MIN;
      return true;
    }
    if (step === 'prompts') {
      if (promptLoading) return false;
      if (promptEditorPromptId) return false;
      const selectedCount = promptSelection.length;
      const answeredCount = promptSelection.filter((id) => {
        const text = promptAnswers[id];
        return text && text.trim().length > 0;
      }).length;
      return (
        selectedCount >= PROMPT_MIN_SELECTION
        && selectedCount <= PROMPT_MAX_SELECTION
        && answeredCount === selectedCount
      );
    }
    return false;
  }, [
    age,
    code,
    countryCode,
    gender,
    locationScope,
    lat,
    loading,
    lon,
    name,
    phone,
    politics,
    promptAnswers,
    promptEditorPromptId,
    promptLoading,
    promptSelection.length,
    radiusValue,
    religion,
    relationshipMode,
    step,
  ]);

  const buildLifestylePreferences = (): TagPreference[] => {
    if (!lifestyleTagGroups) return [];
    const selected = new Set(lifestyleSelections);
    const prefs: TagPreference[] = [];
    for (const [group, tags] of Object.entries(lifestyleTagGroups)) {
      const importance = lifestyleImportanceByGroup[group] ?? 'NOT_IMPORTANT';
      if (importance === 'NOT_IMPORTANT') continue;
      for (const tag of tags) {
        if (selected.has(tag)) {
          prefs.push({ tag, importance });
        }
      }
    }
    return prefs;
  };

  const openPromptEditor = (promptId: string) => {
    setMessage(null);
    const alreadySelected = promptSelection.includes(promptId);
    if (!alreadySelected && promptSelection.length >= PROMPT_MAX_SELECTION) {
      setMessage(`Pick no more than ${PROMPT_MAX_SELECTION} prompts.`);
      return;
    }
    if (!alreadySelected) {
      setPromptSelection((prev) => [...prev, promptId]);
    }
    setPromptEditorPromptId(promptId);
    setPromptEditorAnswer(promptAnswers[promptId] ?? '');
  };

  const closePromptEditor = () => {
    setPromptEditorPromptId(null);
    setPromptEditorAnswer('');
  };

  const savePromptAnswer = () => {
    if (!promptEditorPromptId) return;
    const trimmed = promptEditorAnswer.trim();
    if (!trimmed) {
      setMessage('Please write an answer before saving.');
      return;
    }
    setPromptAnswers((prev) => ({
      ...prev,
      [promptEditorPromptId]: trimmed,
    }));
    setMessage(null);
    closePromptEditor();
  };

  const removePromptSelection = (promptId: string) => {
    setMessage(null);
    setPromptSelection((prev) => prev.filter((item) => item !== promptId));
    setPromptAnswers((existing) => {
      const next = { ...existing };
      delete next[promptId];
      return next;
    });
    if (promptEditorPromptId === promptId) {
      closePromptEditor();
    }
  };

  const handleBack = () => {
    if (step === 'prompts' && promptEditorPromptId) {
      closePromptEditor();
      return;
    }
    setMessage(null);
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleContinue = async () => {
    setMessage(null);

    if (step === 'phone') {
      setLoading(true);
      try {
        const result = await requestPhoneCode(phone.trim());
        if (result.fallback && result.code) {
          setFallbackCode(result.code);
          const permissions = await Notifications.getPermissionsAsync();
          if (permissions.status !== 'granted') {
            const request = await Notifications.requestPermissionsAsync();
            if (request.status !== 'granted') {
              setStepIndex((prev) => prev + 1);
              return;
            }
          }
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Mock SMS',
              body: `Your verification code is ${result.code}`,
            },
            trigger: null,
          });
        } else {
          setFallbackCode('');
        }
        setExistingAccount(Boolean(result.existing));
        setStepIndex((prev) => prev + 1);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to send code');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (step === 'verify') {
      setLoading(true);
      try {
        const result = await verifyPhoneCode(phone.trim(), code.trim());
        if ('access_token' in result) {
          await loginWithToken(result.access_token);
          return;
        }
        setVerificationToken(result.verification_token);
        setStepIndex((prev) => prev + 1);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to verify code');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (step === 'location') {
      if (!birthday || age === null) {
        setMessage('Please select your birthday.');
        return;
      }
      if (age < MIN_AGE) {
        setMessage('You need to be at least 18 to sign up.');
        return;
      }
      if (lat === null || lon === null) {
        setMessage('Location is required to use the app. Please enable location services.');
        return;
      }
      if (locationScope === 'country' && !countryCode) {
        setMessage('We could not determine your country. Please try again.');
        return;
      }
      if (!verificationToken) {
        setMessage('Please verify your phone number.');
        return;
      }
      setStepIndex((prev) => prev + 1);
      return;
    }

    if (step === 'prompts') {
      if (promptEditorPromptId) {
        setMessage('Save this prompt answer before finishing.');
        return;
      }
      const selectedCount = promptSelection.length;
      const answeredCount = promptSelection.filter((id) => {
        const text = promptAnswers[id];
        return text && text.trim().length > 0;
      }).length;
      if (selectedCount < PROMPT_MIN_SELECTION) {
        setMessage(`Pick at least ${PROMPT_MIN_SELECTION} prompt to answer.`);
        return;
      }
      if (selectedCount > PROMPT_MAX_SELECTION) {
        setMessage(`Pick no more than ${PROMPT_MAX_SELECTION} prompts.`);
        return;
      }
      if (answeredCount < selectedCount) {
        setMessage('Please answer each selected prompt.');
        return;
      }
      if (!verificationToken) {
        setMessage('Please verify your phone number.');
        return;
      }
      if (!birthday || age === null) {
        setMessage('Please select your birthday.');
        return;
      }
      if (age < MIN_AGE) {
        setMessage('You need to be at least 18 to sign up.');
        return;
      }
      if (lat === null || lon === null) {
        setMessage('Location is required to use the app. Please enable location services.');
        return;
      }
      if (locationScope === 'country' && !countryCode) {
        setMessage('We could not determine your country. Please try again.');
        return;
      }
      setLoading(true);
      try {
        const { account, token } = await completePhoneSignup({
          name: name.trim(),
          phone_number: phone.trim(),
          birthday: birthday.toISOString().split('T')[0],
          verification_token: verificationToken,
        });

        const [minAge, maxAge] = ageRange;
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
        const distanceUnit =
          locationScope === 'nearby' ? (radiusUnit === 'mi' ? 'MI' : 'KM') : undefined;
        const filtersPayload: Filters = {
          relationshipMode: { self: relationshipMode },
          gender: {
            self: gender,
            seeking: genderSeeking.length ? genderSeeking : undefined,
          },
          religion: { self: religion, importance: religionImportance },
          politics: { self: politics, importance: politicsImportance },
          age: {
            self: age,
            min: minAge,
            max: maxAge,
            importance: 'NOT_IMPORTANT',
          },
        };
        filtersPayload.location = {
          lat,
          lon,
          radiusKm,
          scope,
          countryCode: countryCode || undefined,
          distanceUnit,
        };
        const lifestylePreferences = buildLifestylePreferences();
        if (lifestyleSelections.length || lifestylePreferences.length) {
          filtersPayload.lifestyle = {
            self: lifestyleSelections.length ? lifestyleSelections : undefined,
            preferences: lifestylePreferences.length ? lifestylePreferences : undefined,
          };
        }

        await postFilters(account.id, token, filtersPayload);

        const responses = promptSelection.map((promptId) => {
          const body = (promptAnswers[promptId] ?? '').trim();
          return postPublicPromptAnswer(account.id, token, promptId, { body });
        });
        await Promise.all(responses);
        await postPublicPromptSelection(account.id, token, promptSelection);
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : 'Unable to finish onboarding';
        if (messageText.toLowerCase().includes('verification')) {
          resetPhoneVerification();
          setMessage('Verification expired. Please request a new code.');
          return;
        }
        setMessage(messageText);
      } finally {
        setLoading(false);
      }
      return;
    }

    setStepIndex((prev) => prev + 1);
  };

  const handleDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) {
      setBirthday(selected);
    }
  };

  const handleUseLocation = useCallback(async () => {
    setMessage(null);
    setLoading(true);
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
      const results = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const top = results[0];
      setLocationName(top ? formatPlacemark(top) : '');
      setCountryCode(top?.isoCountryCode ? top.isoCountryCode.toUpperCase() : '');
      setCountryName(top?.country ?? '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to get location');
      setCountryCode('');
      setCountryName('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step !== 'location') return;
    if (lat !== null && lon !== null) return;
    handleUseLocation();
  }, [handleUseLocation, lat, lon, step]);

  const locationLabel = useMemo(() => {
    if (loading && step === 'location') return 'Locating…';
    if (locationName) return locationName;
    if (lat !== null && lon !== null) return `Lat ${lat.toFixed(3)} · Lon ${lon.toFixed(3)}`;
    if (locationPermission === 'denied') return 'Enable location';
    return 'Locate';
  }, [lat, loading, locationName, lon, locationPermission, step]);

  const stepTitle = useMemo(() => {
    if (step === 'welcome') return 'Welcome to Calypso';
    if (step === 'phone') return 'Your phone number';
    if (step === 'verify') return 'Verify your number';
    if (step === 'name') return 'Your name';
    if (step === 'dob') return 'Your birthday';
    if (step === 'gender') return 'Your gender';
    if (step === 'religion') return 'Your religion';
    if (step === 'politics') return 'Your politics';
    if (step === 'relationship') return 'Relationship mode';
    if (step === 'lifestyle') return 'Lifestyle boundaries';
    if (step === 'location') return 'Where are you';
    if (step === 'prompts' && promptEditorPromptId) return 'Answer prompt';
    if (step === 'prompts') return 'Pick prompts';
    return 'Onboarding';
  }, [promptEditorPromptId, step]);

  const isPromptEditorOpen =
    step === 'prompts'
    && promptEditorPromptId !== null
    && promptLibrary.some((prompt) => prompt.promptId === promptEditorPromptId);

  const renderStepContent = () => {
    if (step === 'welcome') {
      return (
        <View style={styles.section}>
          <ThemedText type="title">Welcome</ThemedText>
          <ThemedText style={[styles.mutedText, { color: muted }]}>
            Let&apos;s set up your profile in a few quick steps.
          </ThemedText>
        </View>
      );
    }

    if (step === 'phone') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>Phone number</ThemedText>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="(555) 123-4567"
            placeholderTextColor={placeholderColor}
            style={[styles.input, { borderColor, backgroundColor: inputBg, color: inputText }]}
          />
          <ThemedText style={[styles.helperText, { color: muted }]}>
            We&apos;ll text you a verification code.
          </ThemedText>
        </View>
      );
    }

    if (step === 'verify') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>Verification code</ThemedText>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            placeholder="123456"
            placeholderTextColor={placeholderColor}
            style={[styles.input, { borderColor, backgroundColor: inputBg, color: inputText }]}
            maxLength={CODE_LENGTH}
          />
          <ThemedText style={[styles.helperText, { color: muted }]}>
            {existingAccount
              ? "We'll log you in after you confirm this code."
              : `Sent to ${phone || 'your phone'}.`}
          </ThemedText>
        </View>
      );
    }

    if (step === 'name') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>First name</ThemedText>
          <TextInput
            key={`name-input-${stepIndex}`}
            ref={nameInputRef}
            value={name}
            onChangeText={handleNameChange}
            onChange={handleNameEvent}
            autoFocus
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            editable
            placeholder="First name"
            placeholderTextColor={placeholderColor}
            style={[styles.input, { borderColor, backgroundColor: inputBg, color: inputText }]}
          />
        </View>
      );
    }

    if (step === 'dob') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>Date of birth</ThemedText>
          <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <DateTimePicker
              value={birthday ?? defaultBirthday()}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
            />
          </View>
          <AgeRangeSlider
            values={ageRange}
            minAge={MIN_AGE}
            maxAge={MAX_AGE}
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
          {age !== null && age < MIN_AGE ? (
            <ThemedText style={[styles.errorText, { color: muted }]}>
              You need to be at least 18 to sign up.
            </ThemedText>
          ) : null}
        </View>
      );
    }

    if (step === 'gender') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>You are</ThemedText>
          <View style={styles.optionRow}>
            {(genderOptions.length ? genderOptions : ['Woman', 'Man', 'Non-binary']).map((option) => (
              <OptionPill
                key={option}
                label={option}
                selected={gender === option}
                onPress={() => setGender(option)}
                borderColor={borderColor}
                activeBg={cardBg}
              />
            ))}
          </View>
          <ThemedText style={[styles.label, { color: muted }]}>Seeking</ThemedText>
          <View style={styles.optionRow}>
            {(genderOptions.length ? genderOptions : ['Woman', 'Man', 'Non-binary']).map((option) => (
              <OptionPill
                key={`seeking-${option}`}
                label={option}
                selected={genderSeeking.includes(option)}
                onPress={() => setGenderSeeking((prev) => toggleItem(prev, option))}
                borderColor={borderColor}
                activeBg={cardBg}
              />
            ))}
          </View>
        </View>
      );
    }

    if (step === 'religion') {
      const options = religionOptions.length ? religionOptions : ['prefer_not_to_say'];
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>Select your religion</ThemedText>
          <View style={styles.optionRow}>
            {options.map((option) => (
              <OptionPill
                key={option}
                label={option}
                selected={religion === option}
                onPress={() => setReligion(option)}
                borderColor={borderColor}
                activeBg={cardBg}
              />
            ))}
          </View>
          <ThemedText style={[styles.label, { color: muted }]}>
            How important is religious alignment?
          </ThemedText>
          <View style={styles.optionRow}>
            {ALIGNMENT_IMPORTANCE_OPTIONS.map((option) => (
              <OptionPill
                key={option.value}
                label={option.label}
                selected={religionImportance === option.value}
                onPress={() => setReligionImportance(option.value)}
                borderColor={borderColor}
                activeBg={cardBg}
              />
            ))}
          </View>
        </View>
      );
    }

    if (step === 'politics') {
      const options = politicsOptions.length
        ? politicsOptions
        : ['apolitical', 'prefer_not_to_say'];
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>Select your politics</ThemedText>
          <View style={styles.optionRow}>
            {options.map((option) => (
              <OptionPill
                key={option}
                label={option}
                selected={politics === option}
                onPress={() => setPolitics(option)}
                borderColor={borderColor}
                activeBg={cardBg}
              />
            ))}
          </View>
          <ThemedText style={[styles.label, { color: muted }]}>
            How important is political alignment?
          </ThemedText>
          <View style={styles.optionRow}>
            {ALIGNMENT_IMPORTANCE_OPTIONS.map((option) => (
              <OptionPill
                key={option.value}
                label={option.label}
                selected={politicsImportance === option.value}
                onPress={() => setPoliticsImportance(option.value)}
                borderColor={borderColor}
                activeBg={cardBg}
              />
            ))}
          </View>
        </View>
      );
    }

    if (step === 'relationship') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>Relationship mode</ThemedText>
          <View style={styles.optionRow}>
            {RELATIONSHIP_OPTIONS.map((option) => (
              <OptionPill
                key={option}
                label={capitalize(option)}
                selected={relationshipMode === option}
                onPress={() => setRelationshipMode(option)}
                borderColor={borderColor}
                activeBg={cardBg}
              />
            ))}
          </View>
          <ThemedText style={[styles.mutedText, { color: muted }]}>
            Focused: fewer matches, higher compatibility.{'\n'}
            Balanced: moderate volume, moderate threshold.{'\n'}
            Exploratory: wider net, lower threshold.
          </ThemedText>
        </View>
      );
    }

    if (step === 'lifestyle') {
      const lifestyleGroups = lifestyleTagGroups ? Object.entries(lifestyleTagGroups) : [];
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>
            Select your lifestyle (optional)
          </ThemedText>
          {lifestyleGroups.map(([group, options]) => {
            const groupImportance = lifestyleImportanceByGroup[group] ?? 'NOT_IMPORTANT';
            return (
              <View key={group} style={styles.groupBlock}>
                <ThemedText style={[styles.groupTitle, { color: muted }]}>
                  {formatGroupLabel(group)}
                </ThemedText>
                <View style={styles.optionRow}>
                  {options.map((option) => (
                    <OptionPill
                      key={option}
                      label={option}
                      selected={lifestyleSelections.includes(option)}
                      onPress={() =>
                        setLifestyleSelections((prev) => {
                          const alreadySelected = prev.includes(option);
                          const withoutGroup = prev.filter((tag) => !options.includes(tag));
                          return alreadySelected ? withoutGroup : [...withoutGroup, option];
                        })
                      }
                      borderColor={borderColor}
                      activeBg={cardBg}
                    />
                  ))}
                </View>
                <ThemedText style={[styles.label, { color: muted }]}>
                  How important is it that your partner matches these?
                </ThemedText>
                <View style={styles.optionRow}>
                  {ALIGNMENT_IMPORTANCE_OPTIONS.map((option) => (
                    <OptionPill
                      key={option.value}
                      label={option.label}
                      selected={groupImportance === option.value}
                      onPress={() =>
                        setLifestyleImportanceByGroup((prev) => ({
                          ...prev,
                          [group]: option.value,
                        }))
                      }
                      borderColor={borderColor}
                      activeBg={cardBg}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      );
    }

    if (step === 'location') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>Location</ThemedText>
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
              { borderColor, backgroundColor: cardBg },
              pressed ? styles.locationPillPressed : null,
            ]}
          >
            <ThemedText
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.locationPillText, { color: muted }]}
            >
              {locationLabel}
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
              Using {countryName || 'your country'}.
            </ThemedText>
          )}
          {locationScope === 'worldwide' && (
            <ThemedText style={[styles.helperText, { color: muted }]}>
              Search is global, no radius needed.
            </ThemedText>
          )}
        </View>
      );
    }

    if (step === 'prompts') {
      const selectedCount = promptSelection.length;
      const answeredCount = promptSelection.filter((id) => {
        const text = promptAnswers[id];
        return text && text.trim().length > 0;
      }).length;
      const editingPrompt = promptEditorPromptId
        ? promptLibrary.find((prompt) => prompt.promptId === promptEditorPromptId) ?? null
        : null;
      if (editingPrompt) {
        return (
          <View style={styles.section}>
            <ThemedText style={[styles.label, { color: muted }]}>Answer prompt</ThemedText>
            <View style={[styles.promptCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <ThemedText type="defaultSemiBold">{editingPrompt.text}</ThemedText>
              <TextInput
                value={promptEditorAnswer}
                onChangeText={setPromptEditorAnswer}
                placeholder="Write your answer here..."
                placeholderTextColor={placeholderColor}
                style={[
                  styles.promptAnswerInput,
                  { borderColor: borderColor, backgroundColor: inputBg, color: inputText },
                ]}
                multiline
              />
            </View>
            <View style={styles.promptEditorActions}>
              <Pressable style={[styles.secondaryButton, { borderColor }]} onPress={closePromptEditor}>
                <ThemedText style={[styles.secondaryButtonText, { color: muted }]}>Back to list</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: primaryBg }]}
                onPress={savePromptAnswer}
              >
                <ThemedText style={[styles.primaryButtonText, { color: primaryText }]}>Save</ThemedText>
              </Pressable>
            </View>
          </View>
        );
      }
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>
            Pick 1 to 5 prompts to answer
          </ThemedText>
          <ThemedText style={[styles.helperText, { color: muted }]}>
            Saved {answeredCount} of {selectedCount} selected
          </ThemedText>
          {promptLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <ThemedText style={[styles.mutedText, { color: muted }]}>Loading prompts…</ThemedText>
            </View>
          )}
          {promptError && (
            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <ThemedText style={[styles.mutedText, { color: muted }]}>{promptError}</ThemedText>
            </View>
          )}
          {!promptLoading && !promptError && promptLibrary.length === 0 ? (
            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <ThemedText style={[styles.mutedText, { color: muted }]}>
                No prompts available right now.
              </ThemedText>
            </View>
          ) : null}
          {promptLibrary.map((prompt) => {
            const selected = promptSelection.includes(prompt.promptId);
            const savedAnswer = (promptAnswers[prompt.promptId] ?? '').trim();
            const answered = savedAnswer.length > 0;
            return (
              <View key={prompt.promptId} style={styles.promptItem}>
                <Pressable
                  onPress={() => openPromptEditor(prompt.promptId)}
                  style={({ pressed }) => [styles.promptPressable, pressed && styles.promptPressed]}
                >
                  <View
                    style={[
                      styles.promptCard,
                      { borderColor: cardBorder, backgroundColor: cardBg },
                      selected && { borderColor: primaryBg },
                    ]}
                  >
                    <ThemedText type="defaultSemiBold">{prompt.text}</ThemedText>
                    {answered ? (
                      <ThemedText style={[styles.mutedText, { color: muted }]} numberOfLines={3}>
                        {savedAnswer}
                      </ThemedText>
                    ) : (
                      <ThemedText style={[styles.mutedText, { color: muted }]}>
                        {selected ? 'Selected. Tap to answer.' : 'Tap to select and answer.'}
                      </ThemedText>
                    )}
                    {selected ? (
                      <ThemedText style={[styles.promptStatusText, { color: muted }]}>
                        {answered ? 'Answered' : 'Awaiting answer'}
                      </ThemedText>
                    ) : null}
                  </View>
                </Pressable>
                {selected ? (
                  <Pressable
                    onPress={() => removePromptSelection(prompt.promptId)}
                    style={[styles.promptRemoveButton, { borderColor }]}
                  >
                    <ThemedText style={[styles.promptRemoveButtonText, { color: muted }]}>
                      Remove
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      );
    }

    return null;
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <ThemedText type="defaultSemiBold">
              Step {stepIndex + 1} of {STEPS.length}
            </ThemedText>
            <ThemedText type="title">{stepTitle}</ThemedText>
          </View>

          {renderStepContent()}

          {message ? (
            <View style={styles.message}>
              <ThemedText style={[styles.mutedText, { color: muted }]}>{message}</ThemedText>
            </View>
          ) : null}

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <ThemedText style={[styles.mutedText, { color: muted }]}>Working…</ThemedText>
            </View>
          )}

          {!isPromptEditorOpen ? (
            <View style={styles.actionRow}>
              {stepIndex > 0 ? (
                <Pressable style={[styles.secondaryButton, { borderColor }]} onPress={handleBack}>
                  <ThemedText style={[styles.secondaryButtonText, { color: muted }]}>Back</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                style={[
                  styles.primaryButton,
                  { backgroundColor: primaryBg },
                  !canContinue && styles.primaryButtonDisabled,
                ]}
                onPress={handleContinue}
                disabled={!canContinue}
              >
                <ThemedText style={[styles.primaryButtonText, { color: primaryText }]}>
                  {step === 'prompts' ? 'Finish' : 'Continue'}
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
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

function calculateAge(date: Date): number {
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

function defaultBirthday(): Date {
  const today = new Date();
  return new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
}

function defaultAgeRange(age: number): [number, number] {
  const min = Math.max(MIN_AGE, age - 4);
  const max = Math.min(MAX_AGE, age + 4);
  return [min, Math.max(min, max)];
}

function formatPlacemark(placemark: Location.LocationGeocodedAddress) {
  const city = placemark.city || placemark.subregion || '';
  const region = placemark.region || '';
  const country = placemark.country || '';
  if (city && region) return `${city}, ${region}`;
  if (city) return city;
  if (region) return region;
  return country;
}

function capitalize(value: string) {
  return value.length ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function formatGroupLabel(value: string) {
  if (!value) return value;
  return value
    .split('_')
    .map((chunk) => capitalize(chunk))
    .join(' ');
}

function toggleItem(list: string[], value: string) {
  if (list.includes(value)) {
    return list.filter((item) => item !== value);
  }
  return [...list, value];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
  },
  keyboardAvoid: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 20,
  },
  header: {
    gap: 8,
  },
  section: {
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
  },
  helperText: {
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
  groupBlock: {
    gap: 8,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
  },
  promptItem: {
    gap: 8,
  },
  promptPressable: {
    borderRadius: 16,
  },
  promptPressed: {
    opacity: 0.9,
  },
  promptCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  promptAnswerInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  promptStatusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    opacity: 0.8,
  },
  promptRemoveButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  promptRemoveButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  promptEditorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  message: {
    gap: 6,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mutedText: {
    opacity: 0.7,
  },
  errorText: {
    opacity: 0.8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontWeight: '600',
  },
  locationPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
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
  sliderBlock: {
    gap: 8,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sliderContainer: {
    marginHorizontal: -6,
    marginTop: 6,
  },
  sliderTrack: {
    height: 4,
    borderRadius: 999,
  },
});
