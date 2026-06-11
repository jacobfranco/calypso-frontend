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
import MultiSlider from '@ptomasroos/react-native-multi-slider';

import { AgeRangeSlider } from '@/components/age-range-slider';
import { FacecardPhotoGrid } from '@/components/facecard-photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  Filters,
  Importance,
  MatchStandardAnswerPayload,
  MatchStandardQuestion,
  PromptDefinition,
  createPhoneAccount,
  fetchMe,
  fetchMatchStandardQuestions,
  fetchPublicPromptLibrary,
  fetchTags,
  postMatchStandardAnswer,
  postFilters,
  postPublicPromptAnswer,
  postPublicPromptSelection,
  requestPhoneCode,
  verifyPhoneCode,
} from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatTagGroupLabel, formatTagLabel } from '@/lib/tag-labels';
import {
  FACECARD_MAX_PHOTOS,
  removeFacecardPhotoUriAtIndex,
  reorderFacecardPhotoUris,
  saveFacecardPhotoUris,
  upsertFacecardPhotoUriAtIndex,
} from '@/lib/facecard-photos';
import { pickPhotoFromLibrary } from '@/lib/image-picker';
import type { AppLocationPermission } from '@/lib/location';
import {
  getCurrentLocationSnapshot,
  getLocationErrorMessage,
  getLocationPermissionStatus,
  formatCoordinateInput,
  formatCoordinateLabel,
  normalizeCountryCodeInput,
  parseLatitudeInput,
  parseLongitudeInput,
} from '@/lib/location';
import { markMatchStandardQuestionsAnswered } from '@/lib/match-standards-progress';

const STEPS = [
  'welcome',
  'phone',
  'verify',
  'name',
  'dob',
  'gender',
  'relationship',
  'location',
  'matchStandard',
  'prompts',
  'photos',
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
const FACECARD_MIN_PHOTOS = 1;
const MATCH_STANDARD_MIN_ANSWERS = 4;
const RELIGION_MATCH_STANDARD_QUESTION_ID = 'standard.religion.identity';
const KIDS_MATCH_STANDARD_QUESTION_ID = 'standard.kids.future';

type MatchStandardAnswerDraft = Omit<MatchStandardAnswerPayload, 'importance'> & {
  importance: Importance | null;
};

function emptyMatchStandardAnswer(): MatchStandardAnswerDraft {
  return {
    ownAnswerOptionIds: [],
    acceptableAnswerOptionIds: [],
    importance: null,
  };
}

export default function OnboardingScreen() {
  const { loginWithToken } = useAuth();
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
  const [birthdayInput, setBirthdayInput] = useState('');
  const [ageRange, setAgeRange] = useState<[number, number]>([MIN_AGE, MIN_AGE + 4]);
  const [gender, setGender] = useState('');
  const [genderSeeking, setGenderSeeking] = useState<string[]>([]);
  const [relationshipMode, setRelationshipMode] = useState('');
  const [locationScope, setLocationScope] = useState<'nearby' | 'country' | 'worldwide'>('nearby');
  const [radiusUnit, setRadiusUnit] = useState<'mi' | 'km'>('mi');
  const [radiusValue, setRadiusValue] = useState(25);
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [countryName, setCountryName] = useState('');
  const [locationPermission, setLocationPermission] = useState<AppLocationPermission>('unknown');
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [genderOptions, setGenderOptions] = useState<string[]>([]);
  const [promptLibrary, setPromptLibrary] = useState<PromptDefinition[]>([]);
  const [promptSelection, setPromptSelection] = useState<string[]>([]);
  const [promptAnswers, setPromptAnswers] = useState<Record<string, string>>({});
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptEditorPromptId, setPromptEditorPromptId] = useState<string | null>(null);
  const [promptEditorAnswer, setPromptEditorAnswer] = useState('');
  const [matchStandardQuestions, setMatchStandardQuestions] = useState<MatchStandardQuestion[]>([]);
  const [matchStandardLoading, setMatchStandardLoading] = useState(false);
  const [matchStandardError, setMatchStandardError] = useState<string | null>(null);
  const [matchStandardAnswers, setMatchStandardAnswers] = useState<Record<string, MatchStandardAnswerDraft>>({});
  const [facecardPhotoUris, setFacecardPhotoUris] = useState<string[]>([]);
  const [photoPicking, setPhotoPicking] = useState(false);

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
        const genderTags = await fetchTags('gender');
        if (!mounted) return;
        setGenderOptions(Object.values(genderTags).flat());
      } catch {
        if (!mounted) return;
        setGenderOptions([]);
      }
    };
    loadTags();
    return () => {
      mounted = false;
    };
  }, []);

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
  const completedMatchStandardAnswerCount = useMemo(
    () => Object.values(matchStandardAnswers).filter(isMatchStandardAnswerComplete).length,
    [matchStandardAnswers]
  );

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

  useEffect(() => {
    if (step !== 'matchStandard') return;
    let mounted = true;
    setMatchStandardLoading(true);
    setMatchStandardError(null);
    fetchMatchStandardQuestions()
      .then((questions) => {
        if (!mounted) return;
        setMatchStandardQuestions(questions.filter((question) => question.tags?.includes('starter')));
      })
      .catch((error) => {
        if (!mounted) return;
        setMatchStandardError(error instanceof Error ? error.message : 'Unable to load standards');
        setMatchStandardQuestions([]);
      })
      .finally(() => {
        if (!mounted) return;
        setMatchStandardLoading(false);
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
    if (step === 'relationship') return relationshipMode.length > 0;
    if (step === 'location') {
      if (lat === null || lon === null) return false;
      if (locationScope === 'country' && !countryCode) return false;
      if (locationScope === 'nearby') return radiusValue >= RADIUS_MIN;
      return true;
    }
    if (step === 'matchStandard') {
      if (matchStandardLoading) return false;
      return completedMatchStandardAnswerCount >= MATCH_STANDARD_MIN_ANSWERS;
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
    if (step === 'photos') {
      if (photoPicking) return false;
      return facecardPhotoUris.length >= FACECARD_MIN_PHOTOS;
    }
    return false;
  }, [
    age,
    code,
    matchStandardAnswers,
    matchStandardLoading,
    completedMatchStandardAnswerCount,
    countryCode,
    facecardPhotoUris.length,
    gender,
    locationScope,
    lat,
    loading,
    lon,
    name,
    phone,
    promptAnswers,
    promptEditorPromptId,
    promptLoading,
    promptSelection.length,
    photoPicking,
    radiusValue,
    relationshipMode,
    step,
  ]);

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

  const pickFacecardPhotoAt = useCallback(async (index: number) => {
    setMessage(null);
    setPhotoPicking(true);
    try {
      const uri = await pickPhotoFromLibrary();
      if (!uri) return;
      setFacecardPhotoUris((prev) => upsertFacecardPhotoUriAtIndex(prev, uri, index));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to pick photo');
    } finally {
      setPhotoPicking(false);
    }
  }, []);

  const removeFacecardPhotoAt = useCallback((index: number) => {
    setFacecardPhotoUris((prev) => {
      if (prev.length <= FACECARD_MIN_PHOTOS) return prev;
      return removeFacecardPhotoUriAtIndex(prev, index);
    });
  }, []);

  const reorderFacecardPhotos = useCallback((fromIndex: number, toIndex: number) => {
    setFacecardPhotoUris((prev) => reorderFacecardPhotoUris(prev, fromIndex, toIndex));
  }, []);

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
        setMessage('Save this prompt answer before continuing.');
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
      setStepIndex((prev) => prev + 1);
      return;
    }

    if (step === 'photos') {
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
      if (facecardPhotoUris.length < FACECARD_MIN_PHOTOS) {
        setMessage('Please upload at least one facecard photo.');
        return;
      }
      setLoading(true);
      try {
        const tokenResponse = await createPhoneAccount({
          name: name.trim(),
          phone_number: phone.trim(),
          birthday: formatBirthdayDate(birthday),
          verification_token: verificationToken,
        });
        const token = tokenResponse.access_token;
        const account = await fetchMe(token);
        await saveFacecardPhotoUris(account.id, facecardPhotoUris);

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

        await postFilters(account.id, token, filtersPayload);

        const completedMatchStandardEntries = Object.entries(matchStandardAnswers).flatMap(([questionId, payload]) =>
          isMatchStandardAnswerComplete(payload) ? [[questionId, payload] as const] : []
        );
        const matchStandardResponses = completedMatchStandardEntries.map(([questionId, payload]) =>
          postMatchStandardAnswer(account.id, token, questionId, matchStandardPayload(payload))
        );
        await Promise.all(matchStandardResponses);
        await markMatchStandardQuestionsAnswered(
          account.id,
          completedMatchStandardEntries.map(([questionId]) => questionId)
        );

        const responses = promptSelection.map((promptId) => {
          const body = (promptAnswers[promptId] ?? '').trim();
          return postPublicPromptAnswer(account.id, token, promptId, { body });
        });
        await Promise.all(responses);
        await postPublicPromptSelection(account.id, token, promptSelection);
        await loginWithToken(token);
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
      setBirthdayInput(formatBirthdayDate(selected));
    }
  };

  const handleBirthdayInputChange = (text: string) => {
    setBirthdayInput(text);
    setBirthday(parseBirthdayInput(text));
  };

  const handleUseLocation = useCallback(async () => {
    setMessage(null);
    setLoading(true);
    try {
      const location = await getCurrentLocationSnapshot();
      setLocationPermission(location.permissionStatus);
      setLat(location.latitude);
      setLon(location.longitude);
      setLatInput(formatCoordinateInput(location.latitude));
      setLonInput(formatCoordinateInput(location.longitude));
      setLocationName(location.locationName);
      setCountryCode(location.countryCode);
      setCountryName(location.countryName);
    } catch (error) {
      setLocationPermission(getLocationPermissionStatus(error));
      setMessage(getLocationErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (step === 'welcome') return 'Welcome';
    if (step === 'phone') return 'Your phone number';
    if (step === 'verify') return 'Verify your number';
    if (step === 'name') return 'Name';
    if (step === 'dob') return 'Age';
    if (step === 'gender') return 'Gender';
    if (step === 'relationship') return 'Relationship mode';
    if (step === 'location') return 'Where are you';
    if (step === 'matchStandard') return 'Standards';
    if (step === 'prompts' && promptEditorPromptId) return 'Answer prompt';
    if (step === 'prompts') return 'Pick prompts';
    if (step === 'photos') return 'Add facecard photos';
    return 'Onboarding';
  }, [promptEditorPromptId, step]);

  const isPromptEditorOpen =
    step === 'prompts'
    && promptEditorPromptId !== null
    && promptLibrary.some((prompt) => prompt.promptId === promptEditorPromptId);

  const updateMatchStandardOwnAnswer = (
    question: MatchStandardQuestion,
    optionId: string
  ) => {
    setMatchStandardAnswers((prev) => {
      const current = prev[question.questionId] ?? emptyMatchStandardAnswer();
      const singleChoice = question.answerType === 'SINGLE_CHOICE';
      const nextOwn = nextOwnAnswerSelection(
        question.questionId,
        singleChoice,
        current.ownAnswerOptionIds,
        optionId
      );
      const selfMatchOnly = question.questionId === RELIGION_MATCH_STANDARD_QUESTION_ID;
      return {
        ...prev,
        [question.questionId]: {
          ...current,
          ownAnswerOptionIds: nextOwn,
          acceptableAnswerOptionIds: selfMatchOnly
            && current.importance !== null
            && current.importance !== 'NOT_IMPORTANT'
            ? nextOwn
            : current.acceptableAnswerOptionIds,
        },
      };
    });
  };

  const toggleMatchStandardAcceptable = (question: MatchStandardQuestion, optionId: string) => {
    setMatchStandardAnswers((prev) => {
      const current = prev[question.questionId] ?? emptyMatchStandardAnswer();
      const acceptable = current.acceptableAnswerOptionIds.includes(optionId)
        ? current.acceptableAnswerOptionIds.filter((item) => item !== optionId)
        : [...current.acceptableAnswerOptionIds, optionId];
      return {
        ...prev,
        [question.questionId]: {
          ...current,
          acceptableAnswerOptionIds: acceptable,
        },
      };
    });
  };

  const setMatchStandardImportance = (question: MatchStandardQuestion, importance: Importance) => {
    setMatchStandardAnswers((prev) => {
      const current = prev[question.questionId] ?? emptyMatchStandardAnswer();
      const selfMatchOnly = question.questionId === RELIGION_MATCH_STANDARD_QUESTION_ID;
      return {
        ...prev,
        [question.questionId]: {
          ...current,
          importance,
          acceptableAnswerOptionIds: selfMatchOnly
            ? importance === 'NOT_IMPORTANT'
              ? []
              : current.ownAnswerOptionIds
            : current.acceptableAnswerOptionIds,
        },
      };
    });
  };

  const renderStepContent = () => {
    if (step === 'welcome') {
      return (
        <View style={styles.section}>
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
          {fallbackCode ? (
            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <ThemedText style={[styles.helperText, { color: muted }]}>
                Dev code: {fallbackCode}
              </ThemedText>
            </View>
          ) : null}
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
          {Platform.OS === 'web' ? (
            <TextInput
              {...({ type: 'date' } as unknown as Partial<React.ComponentProps<typeof TextInput>>)}
              value={birthdayInput}
              onChangeText={handleBirthdayInputChange}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              style={[styles.input, { borderColor, backgroundColor: inputBg, color: inputText }]}
            />
          ) : (
            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <DateTimePicker
                value={birthday ?? defaultBirthday()}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
              />
            </View>
          )}
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
      const options = genderOptions.length ? genderOptions : ['woman', 'man', 'nonbinary'];
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>You are</ThemedText>
          <View style={styles.optionRow}>
            {options.map((option) => (
              <OptionPill
                key={option}
                label={formatTagLabel(option)}
                selected={gender === option}
                onPress={() => setGender(option)}
                borderColor={borderColor}
                activeBg={cardBg}
              />
            ))}
          </View>
          <ThemedText style={[styles.label, { color: muted }]}>Seeking</ThemedText>
          <View style={styles.optionRow}>
            {options.map((option) => (
              <OptionPill
                key={`seeking-${option}`}
                label={formatTagLabel(option)}
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

    if (step === 'relationship') {
      return (
        <View style={styles.section}>
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
            Focused: fewer matches, higher standards fit.{'\n'}
            Balanced: moderate volume, moderate threshold.{'\n'}
            Exploratory: wider net, lower threshold.
          </ThemedText>
        </View>
      );
    }

    if (step === 'location') {
      const showManualLocationFields = Platform.OS === 'web' || Boolean(message);
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
          {showManualLocationFields ? (
            <View style={[styles.groupBlock, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <ThemedText style={[styles.groupTitle, { color: muted }]}>Manual location</ThemedText>
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

    if (step === 'matchStandard') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>
            Set at least {MATCH_STANDARD_MIN_ANSWERS} starter standards
          </ThemedText>
          <ThemedText style={[styles.helperText, { color: muted }]}>
            {completedMatchStandardAnswerCount}/{MATCH_STANDARD_MIN_ANSWERS} answered
          </ThemedText>
          {matchStandardLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <ThemedText style={[styles.mutedText, { color: muted }]}>
                Loading questions…
              </ThemedText>
            </View>
          )}
          {matchStandardError ? (
            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <ThemedText style={[styles.mutedText, { color: muted }]}>
                {matchStandardError}
              </ThemedText>
            </View>
          ) : null}
          {!matchStandardLoading && !matchStandardError && matchStandardQuestions.length === 0 ? (
            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <ThemedText style={[styles.mutedText, { color: muted }]}>
                No standards are available right now.
              </ThemedText>
            </View>
          ) : null}
          {!matchStandardLoading && !matchStandardError ? (
            matchStandardQuestions.map((question) => {
              const answer = matchStandardAnswers[question.questionId] ?? emptyMatchStandardAnswer();
              const selfMatchOnly = question.questionId === RELIGION_MATCH_STANDARD_QUESTION_ID;
              return (
                <View
                  key={question.questionId}
                  style={[styles.groupBlock, { borderColor: cardBorder, backgroundColor: cardBg }]}
                >
                  <ThemedText style={[styles.groupTitle, { color: muted }]}>
                    {formatTagGroupLabel(question.category)}
                  </ThemedText>
                  <ThemedText type="defaultSemiBold">{question.text}</ThemedText>
                  <ThemedText style={[styles.label, { color: muted }]}>My answer</ThemedText>
                  <View style={styles.optionRow}>
                    {question.options.map((option) => (
                      <OptionPill
                        key={option.optionId}
                        label={option.text}
                        selected={Boolean(answer?.ownAnswerOptionIds.includes(option.optionId))}
                        onPress={() => updateMatchStandardOwnAnswer(question, option.optionId)}
                        borderColor={borderColor}
                        activeBg={primaryBg}
                        activeText={primaryText}
                      />
                    ))}
                  </View>
                  {!selfMatchOnly ? (
                    <>
                      <ThemedText style={[styles.label, { color: muted }]}>
                        Partner answers that work for me
                      </ThemedText>
                      <View style={styles.optionRow}>
                        {question.options.map((option) => (
                          <OptionPill
                            key={`acceptable-${option.optionId}`}
                            label={option.text}
                            selected={answer.acceptableAnswerOptionIds.includes(option.optionId)}
                            onPress={() => toggleMatchStandardAcceptable(question, option.optionId)}
                            borderColor={borderColor}
                            activeBg={primaryBg}
                            activeText={primaryText}
                          />
                        ))}
                      </View>
                    </>
                  ) : null}
                  <ThemedText style={[styles.label, { color: muted }]}>
                    {selfMatchOnly ? 'Should my partner share this?' : 'How much this matters'}
                  </ThemedText>
                  <View style={styles.optionRow}>
                    {ALIGNMENT_IMPORTANCE_OPTIONS.map((option) => (
                      <OptionPill
                        key={option.value}
                        label={option.label}
                        selected={answer.importance === option.value}
                        onPress={() => setMatchStandardImportance(question, option.value)}
                        borderColor={borderColor}
                        activeBg={primaryBg}
                        activeText={primaryText}
                      />
                    ))}
                  </View>
                  {!selfMatchOnly
                    && answer.importance !== null
                    && answer.importance !== 'NOT_IMPORTANT'
                    && answer.acceptableAnswerOptionIds.length === 0 ? (
                    <ThemedText style={[styles.helperText, { color: muted }]}>
                      Pick at least one partner answer that works for you.
                    </ThemedText>
                  ) : null}
                </View>
              );
            })
          ) : null}
        </View>
      );
    }

    if (step === 'prompts') {
      const selectedCount = promptSelection.length;
      const answeredCount = promptSelection.filter((id) => {
        const text = promptAnswers[id];
        return text && text.trim().length > 0;
      }).length;
      const selectedPromptIds = new Set(promptSelection);
      const answeredPrompts = promptLibrary.filter((prompt) => {
        const text = promptAnswers[prompt.promptId];
        return Boolean(text && text.trim().length > 0);
      });
      const remainingPrompts = promptLibrary
        .filter((prompt) => {
          const text = promptAnswers[prompt.promptId];
          return !text || text.trim().length === 0;
        })
        .sort((left, right) =>
          Number(selectedPromptIds.has(right.promptId)) - Number(selectedPromptIds.has(left.promptId))
        );
      const editingPrompt = promptEditorPromptId
        ? promptLibrary.find((prompt) => prompt.promptId === promptEditorPromptId) ?? null
        : null;
      const renderPromptItem = (prompt: PromptDefinition) => {
        const selected = selectedPromptIds.has(prompt.promptId);
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
      };
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
          {!promptLoading && !promptError && promptLibrary.length > 0 ? (
            <>
              <View style={styles.promptSectionHeader}>
                <ThemedText type="defaultSemiBold">Answered prompts</ThemedText>
                <ThemedText style={[styles.promptSectionCount, { color: muted }]}>
                  {answeredPrompts.length}
                </ThemedText>
              </View>
              {answeredPrompts.length === 0 ? (
                <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
                  <ThemedText style={[styles.mutedText, { color: muted }]}>No answers yet.</ThemedText>
                </View>
              ) : (
                answeredPrompts.map((prompt) => renderPromptItem(prompt))
              )}
              <View style={[styles.promptSectionDivider, { borderColor: cardBorder }]} />
              <View style={styles.promptSectionHeader}>
                <ThemedText type="defaultSemiBold">Remaining prompts</ThemedText>
                <ThemedText style={[styles.promptSectionCount, { color: muted }]}>
                  {remainingPrompts.length}
                </ThemedText>
              </View>
              {remainingPrompts.length === 0 ? (
                <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    You&apos;re done with prompts.
                  </ThemedText>
                </View>
              ) : (
                remainingPrompts.map((prompt) => renderPromptItem(prompt))
              )}
            </>
          ) : null}
        </View>
      );
    }

    if (step === 'photos') {
      return (
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: muted }]}>Facecard photos</ThemedText>
          <ThemedText style={[styles.helperText, { color: muted }]}>
            Add at least one photo. The first photo in this grid is shown first on your facecard.
          </ThemedText>
          <FacecardPhotoGrid
            photoUris={facecardPhotoUris}
            maxPhotos={FACECARD_MAX_PHOTOS}
            disabled={photoPicking}
            cardBorderColor={cardBorder}
            cardBackgroundColor={cardBg}
            mutedTextColor={muted}
            onPickPhotoAt={pickFacecardPhotoAt}
            onRemovePhotoAt={removeFacecardPhotoAt}
            onReorderPhotos={reorderFacecardPhotos}
          />
          {photoPicking && (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <ThemedText style={[styles.mutedText, { color: muted }]}>Opening photos…</ThemedText>
            </View>
          )}
          <ThemedText style={[styles.helperText, { color: muted }]}>
            {facecardPhotoUris.length}/{FACECARD_MAX_PHOTOS} photos selected
          </ThemedText>
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
                  {step === 'photos' ? 'Finish' : 'Continue'}
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
  activeText,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  borderColor: string;
  activeBg: string;
  activeText?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.optionPill,
        { borderColor },
        selected && { backgroundColor: activeBg, borderColor: activeBg },
      ]}
    >
      <ThemedText
        style={[
          styles.optionPillText,
          selected && styles.optionPillTextActive,
          selected && activeText ? { color: activeText } : null,
        ]}
      >
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

function formatBirthdayDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseBirthdayInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function defaultAgeRange(age: number): [number, number] {
  const min = Math.max(MIN_AGE, age - 4);
  const max = Math.min(MAX_AGE, age + 4);
  return [min, Math.max(min, max)];
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

function nextOwnAnswerSelection(
  questionId: string,
  singleChoice: boolean,
  current: string[],
  optionId: string
): string[] {
  if (singleChoice) return [optionId];
  if (current.includes(optionId)) {
    return current.filter((item) => item !== optionId);
  }
  if (questionId !== KIDS_MATCH_STANDARD_QUESTION_ID) {
    return [...current, optionId];
  }
  const exclusiveGroups = [
    ['has_kids', 'no_kids'],
    ['wants_kids', 'open_to_kids', 'not_sure', 'doesnt_want_kids'],
  ];
  const group = exclusiveGroups.find((items) => items.includes(optionId));
  if (!group) return [...current, optionId];
  return [...current.filter((item) => !group.includes(item)), optionId];
}

function isMatchStandardAnswerComplete(
  payload: MatchStandardAnswerDraft | null | undefined
): payload is MatchStandardAnswerDraft & { importance: Importance } {
  if (!payload) return false;
  if (!payload.ownAnswerOptionIds.length) return false;
  if (payload.importance === null) return false;
  if (payload.importance !== 'NOT_IMPORTANT' && !payload.acceptableAnswerOptionIds.length) {
    return false;
  }
  return true;
}

function matchStandardPayload(
  payload: MatchStandardAnswerDraft & { importance: Importance }
): MatchStandardAnswerPayload {
  return {
    ownAnswerOptionIds: payload.ownAnswerOptionIds,
    acceptableAnswerOptionIds: payload.acceptableAnswerOptionIds,
    importance: payload.importance,
  };
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
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  manualLocationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  manualLocationField: {
    flex: 1,
    gap: 6,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
  },
  promptItem: {
    gap: 8,
  },
  promptSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promptSectionCount: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
  },
  promptSectionDivider: {
    borderTopWidth: 1,
    marginVertical: 2,
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
