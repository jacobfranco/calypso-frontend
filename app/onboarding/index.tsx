import React, { useEffect, useMemo, useRef, useState } from 'react';
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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  Filters,
  fetchTags,
  postFilters,
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
] as const;

type StepKey = (typeof STEPS)[number];

const RELATIONSHIP_OPTIONS = ['casual', 'serious'];
const MIN_AGE = 18;
const MAX_AGE = 99;
const CODE_LENGTH = 6;

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
  const { completePhoneSignup } = useAuth();
  const nameInputRef = useRef<TextInput>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [fallbackCode, setFallbackCode] = useState('');
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [gender, setGender] = useState('');
  const [religion, setReligion] = useState('');
  const [politics, setPolitics] = useState('');
  const [relationshipMode, setRelationshipMode] = useState('');
  const [lifestyleSelections, setLifestyleSelections] = useState<string[]>([]);
  const [radiusKm, setRadiusKm] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [locationPermission, setLocationPermission] = useState<LocationPermission>('unknown');
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [genderOptions, setGenderOptions] = useState<string[]>([]);
  const [religionOptions, setReligionOptions] = useState<string[]>([]);
  const [politicsOptions, setPoliticsOptions] = useState<string[]>([]);
  const [lifestyleOptions, setLifestyleOptions] = useState<string[]>([]);

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
        setLifestyleOptions(Object.values(lifestyleTagGroups).flat());
      } catch {
        if (!mounted) return;
        setGenderOptions([]);
        setReligionOptions([]);
        setPoliticsOptions([]);
        setLifestyleOptions([]);
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
      return lat !== null && lon !== null && Number(radiusKm) > 0;
    }
    return false;
  }, [
    age,
    code,
    gender,
    lat,
    loading,
    lon,
    name,
    phone,
    politics,
    radiusKm,
    religion,
    relationshipMode,
    step,
  ]);

  const handleBack = () => {
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
      if (!verificationToken) {
        setMessage('Please verify your phone number.');
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

        const [minAge, maxAge] = defaultAgeRange(age);
        const filtersPayload: Filters = {
          relationshipMode: { self: relationshipMode },
          gender: { self: gender },
          religion: { self: religion },
          politics: { self: politics },
          age: {
            self: age,
            min: minAge,
            max: maxAge,
            importance: 'NOT_IMPORTANT',
          },
          location: {
            lat: lat ?? undefined,
            lon: lon ?? undefined,
            radiusKm: Number(radiusKm),
          },
        };
        if (lifestyleSelections.length) {
          filtersPayload.lifestyle = { self: lifestyleSelections };
        }

        await postFilters(account.id, token, filtersPayload);
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

  const handleUseLocation = async () => {
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
        setMessage('Location permission not granted.');
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to get location');
    } finally {
      setLoading(false);
    }
  };

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
    return 'Onboarding';
  }, [step]);

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
            Sent to {phone || 'your phone'}.
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
          <ThemedText style={[styles.label, { color: muted }]}>Select your gender</ThemedText>
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
        </View>
      );
    }

    if (step === 'lifestyle') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>
            Select your boundaries (optional)
          </ThemedText>
          <View style={styles.optionRow}>
            {lifestyleOptions.map((option) => (
              <OptionPill
                key={option}
                label={option}
                selected={lifestyleSelections.includes(option)}
                onPress={() => setLifestyleSelections((prev) => toggleItem(prev, option))}
                borderColor={borderColor}
                activeBg={cardBg}
              />
            ))}
          </View>
        </View>
      );
    }

    if (step === 'location') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>Location</ThemedText>
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
          <View style={styles.radiusRow}>
            <View style={styles.radiusInput}>
              <ThemedText style={[styles.label, { color: muted }]}>Radius (km)</ThemedText>
              <TextInput
                value={radiusKm}
                onChangeText={setRadiusKm}
                keyboardType="numeric"
                placeholder="25"
                placeholderTextColor={placeholderColor}
                style={[styles.input, { borderColor, backgroundColor: inputBg, color: inputText }]}
              />
            </View>
          </View>
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
                {step === 'location' ? 'Finish' : 'Continue'}
              </ThemedText>
            </Pressable>
          </View>
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
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
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
  radiusRow: {
    gap: 8,
  },
  radiusInput: {
    flex: 1,
  },
});
