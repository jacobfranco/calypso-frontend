import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  getLocallyAnsweredMatchStandardQuestionIds,
  markMatchStandardQuestionsAnswered,
} from '@/lib/match-standards-progress';
import { getFacecardPhotoUrisByAccountIds } from '@/lib/facecard-photos';
import {
  ActivePrivatePrompt,
  MatchStandardAnswer,
  MatchStandardAnswerPayload,
  MatchStandardQuestion,
  fetchFacecards,
  fetchActiveMatchmakingFollowup,
  fetchActivePrivatePrompt,
  fetchMatchStandardAnswers,
  fetchMatchStandardQuestions,
  fetchPublicPromptFeed,
  Importance,
  MatchCard,
  postFacecardReaction,
  postMatchStandardAnswer,
  postMatchmakingFollowupAnswer,
  postMatchmakingFollowupChatTurn,
  postMatchmakingFollowupSkip,
  postPrivatePromptChatTurn,
  postPrivatePromptAnswer,
  postPrivatePromptSkip,
  postPublicPromptReaction,
  PublicPromptFeedCard,
} from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

type PrivatePromptChatMessage = {
  role: 'agent' | 'user';
  text: string;
};

type PromptChannel = 'private' | 'matchmaking';
type ReactionStrength = -3 | -2 | -1 | 0 | 1 | 2 | 3;
type FeedMode = 'public' | 'matchStandard';

const PUBLIC_REACTION_STRENGTH_OPTIONS: ReactionStrength[] = [-3, -2, -1, 0, 1, 2, 3];
const FEED_MODES: { label: string; value: FeedMode }[] = [
  { label: 'Prompts', value: 'public' },
  { label: 'Standards', value: 'matchStandard' },
];
const MATCH_STANDARD_IMPORTANCE_OPTIONS: { label: string; value: Importance }[] = [
  { label: 'Not important', value: 'NOT_IMPORTANT' },
  { label: 'Nice to have', value: 'PREFERENCE' },
  { label: 'Important', value: 'DEALBREAKER' },
];
const RELIGION_MATCH_STANDARD_QUESTION_ID = 'standard.religion.identity';
const KIDS_MATCH_STANDARD_QUESTION_ID = 'standard.kids.future';

type MatchStandardAnswerDraft = Omit<MatchStandardAnswerPayload, 'importance'> & {
  importance: Importance | null;
};

const PRIVATE_PROMPT_PRIVACY_NOTE =
  'Your answers stay private and are only used for matchmaking.';
const FACECARD_NOTE =
  'Facecards come from your highest-ranked candidate pool.';
const FACECARD_EXHAUSTED_STORAGE_PREFIX = 'calypso.facecards.exhaustedOn.v1:';

function reactionStrengthLabel(strength: ReactionStrength): string {
  switch (strength) {
    case -3:
      return 'Strong pass';
    case -2:
      return 'Pass';
    case -1:
      return 'Slight pass';
    case 0:
      return 'Neutral';
    case 1:
      return 'Slight like';
    case 2:
      return 'Like';
    case 3:
      return 'Strong like';
  }
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  values.forEach((value) => {
    const trimmed = value?.trim();
    if (!trimmed || out.includes(trimmed)) return;
    out.push(trimmed);
  });
  return out;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function facecardExhaustedStorageKey(accountId: string): string {
  return `${FACECARD_EXHAUSTED_STORAGE_PREFIX}${accountId}`;
}

function formatMatchStandardCategory(category: string): string {
  return category
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function isMatchStandardAnswerComplete(
  payload: MatchStandardAnswerDraft | null
): payload is MatchStandardAnswerDraft & { importance: Importance } {
  if (!payload) return false;
  if (!payload.ownAnswerOptionIds.length) return false;
  if (payload.importance === null) return false;
  if (payload.importance !== 'NOT_IMPORTANT' && !payload.acceptableAnswerOptionIds.length) {
    return false;
  }
  return true;
}

function emptyMatchStandardAnswer(): MatchStandardAnswerDraft {
  return {
    ownAnswerOptionIds: [],
    acceptableAnswerOptionIds: [],
    importance: null,
  };
}

function matchStandardAnswerFromStored(answer: MatchStandardAnswer): MatchStandardAnswerDraft {
  return {
    ownAnswerOptionIds: answer.ownAnswerOptionIds ?? [],
    acceptableAnswerOptionIds: answer.acceptableAnswerOptionIds ?? [],
    importance: answer.importance ?? null,
  };
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

function resolveFacecardPhotoUris(
  match: MatchCard,
  storedByAccountId: Record<string, string[]>
): string[] {
  const stored = storedByAccountId[match.account.id] ?? [];
  if (stored.length > 0) {
    return uniqueNonEmptyStrings(stored);
  }
  return uniqueNonEmptyStrings([match.account.avatar_static, match.account.avatar]);
}

function mergeFacecardQueues(existing: MatchCard[], incoming: MatchCard[]): MatchCard[] {
  const seen = new Set<string>();
  const merged: MatchCard[] = [];
  [...existing, ...incoming].forEach((match) => {
    const accountId = match.account?.id?.trim();
    if (!accountId || seen.has(accountId)) return;
    seen.add(accountId);
    merged.push(match);
  });
  return merged;
}

function pickActiveAgentPrompt(
  privatePrompt: ActivePrivatePrompt | null,
  matchmakingPrompt: ActivePrivatePrompt | null
): { prompt: ActivePrivatePrompt; channel: PromptChannel } | null {
  if (!privatePrompt && !matchmakingPrompt) return null;
  if (privatePrompt && !matchmakingPrompt) {
    return { prompt: privatePrompt, channel: 'private' };
  }
  if (!privatePrompt && matchmakingPrompt) {
    return { prompt: matchmakingPrompt, channel: 'matchmaking' };
  }

  const privateScheduledAt = privatePrompt?.assignment?.scheduledAt ?? Number.MAX_SAFE_INTEGER;
  const followupScheduledAt = matchmakingPrompt?.assignment?.scheduledAt ?? Number.MAX_SAFE_INTEGER;
  if (followupScheduledAt < privateScheduledAt && matchmakingPrompt) {
    return { prompt: matchmakingPrompt, channel: 'matchmaking' };
  }
  return privatePrompt ? { prompt: privatePrompt, channel: 'private' } : null;
}

function splitPromptIntoParts(promptText: string): string[] {
  const trimmed = promptText?.trim() ?? '';
  if (!trimmed) return [];
  const withQuestions = mergeTrailingWhyFragments(
    trimmed
      .split(/(?<=\?)\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
  );
  if (withQuestions.length > 1) return withQuestions;
  const sentences = mergeTrailingWhyFragments(
    trimmed
      .split(/(?<=\.)\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
  );
  if (sentences.length > 1) return sentences;
  return withQuestions.length ? withQuestions : [trimmed];
}

function mergeTrailingWhyFragments(parts: string[]): string[] {
  if (!parts.length) return [];
  const merged: string[] = [];
  parts.forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    if (isStandaloneWhyFragment(trimmed) && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${trimmed}`.trim();
      return;
    }
    merged.push(trimmed);
  });
  return merged;
}

function isStandaloneWhyFragment(part: string): boolean {
  const normalized = part.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized.startsWith('why')) return false;
  const words = normalized
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.length <= 4;
}

function toConversationLines(messages: PrivatePromptChatMessage[]): string[] {
  return messages.map((message) => `${message.role}: ${message.text}`);
}

function buildPrivatePromptBody(parts: string[], answersByPart: string[][]): string {
  const sections: string[] = [];
  parts.forEach((_, idx) => {
    const answers = answersByPart[idx] ?? [];
    const merged = answers
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' ');
    if (!merged) return;
    sections.push(merged);
  });
  return sections.join('\n');
}

function privatePromptAnswerCanCoverRemainingParts(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return trimmed.length >= 140 || words.length >= 24;
}

function answerCanCoverRemainingPromptParts(
  promptId: string | undefined,
  partIndex: number,
  answersForCurrentPart: string[],
  latestUserMessage: string
): boolean {
  const combined = [...answersForCurrentPart, latestUserMessage]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');
  if (promptId === 'private.formative.imprints' && partIndex === 0) {
    const alreadyAnsweredThisPart = answersForCurrentPart.some((value) => value.trim().length > 0);
    return hasFormativeImprint(combined) || alreadyAnsweredThisPart;
  }
  return privatePromptAnswerCanCoverRemainingParts(latestUserMessage);
}

function hasFormativeImprint(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  return [
    'made me interested in',
    'made me curious about',
    'got me into',
    'got me interested',
    'left me with',
    'stuck with me because',
    'shaped my',
    'shaped me',
    'influenced my',
    'led me to',
    'led to',
    'sparked',
    'i still',
    'now i',
    'as an adult',
    'my taste',
    'my aesthetics',
    'my aesthetic',
    'asian culture',
    'visual culture',
    'international travel',
    'other countries',
    'lived culture',
    'ordinary culture',
    'mundane',
    'everyday',
    'aesthetics',
    'curiosity',
    'curious about',
    'drawn to',
    'it taught me',
    'they taught me',
  ].some((cue) => normalized.includes(cue));
}

export default function HomeScreen() {
  const { account, token } = useAuth();
  const facecardsScrollRef = useRef<ScrollView>(null);
  const privateChatScrollRef = useRef<ScrollView>(null);
  const feedWarmupRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedWarmupRetryCountRef = useRef(0);
  const facecardWarmupRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const facecardWarmupRetryCountRef = useRef(0);
  const facecardRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const facecardOpenPendingRef = useRef(false);
  const matchStandardAnsweredQuestionIdsRef = useRef<Set<string>>(new Set());
  const matchStandardAccountIdRef = useRef<number | string | null>(null);
  const matchStandardLoadSeqRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<PublicPromptFeedCard | null>(null);
  const [feedMode, setFeedMode] = useState<FeedMode>('public');
  const [selectedReactionStrength, setSelectedReactionStrength] = useState<ReactionStrength>(0);
  const [matchStandardQuestion, setMatchStandardQuestion] = useState<MatchStandardQuestion | null>(null);
  const [matchStandardAnswer, setMatchStandardAnswer] = useState<MatchStandardAnswerDraft | null>(null);
  const [matchStandardLoading, setMatchStandardLoading] = useState(false);
  const [matchStandardSubmitting, setMatchStandardSubmitting] = useState(false);
  const [matchStandardSkippedQuestionIds, setMatchStandardSkippedQuestionIds] = useState<string[]>([]);
  const [facecards, setFacecards] = useState<MatchCard[]>([]);
  const [, setFacecardRefetching] = useState(false);
  const [facecardsExhaustedToday, setFacecardsExhaustedToday] = useState(false);
  const [facecardsOverlayOpen, setFacecardsOverlayOpen] = useState(false);
  const [facecardReacting, setFacecardReacting] = useState(false);
  const [facecardDeck, setFacecardDeck] = useState<MatchCard[]>([]);
  const [facecardIndex, setFacecardIndex] = useState(0);
  const [facecardViewportWidth, setFacecardViewportWidth] = useState(1);
  const [facecardPhotosByAccountId, setFacecardPhotosByAccountId] = useState<Record<string, string[]>>({});
  const [facecardPhotoIndexByAccountId, setFacecardPhotoIndexByAccountId] = useState<
    Record<string, number>
  >({});
  const [activePrivatePrompt, setActivePrivatePrompt] = useState<ActivePrivatePrompt | null>(null);
  const [activePromptChannel, setActivePromptChannel] = useState<PromptChannel | null>(null);
  const [privatePromptInput, setPrivatePromptInput] = useState('');
  const [privatePromptMessages, setPrivatePromptMessages] = useState<PrivatePromptChatMessage[]>([]);
  const [privatePromptPartIndex, setPrivatePromptPartIndex] = useState(0);
  const [privatePromptAnswersByPart, setPrivatePromptAnswersByPart] = useState<string[][]>([]);
  const [privatePromptReadyToSubmit, setPrivatePromptReadyToSubmit] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [privatePromptSubmitting, setPrivatePromptSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const cardBorder = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.08)', dark: 'rgba(255, 255, 255, 0.12)' },
    'icon'
  );
  const cardBg = useThemeColor(
    { light: '#fff', dark: 'rgba(255, 255, 255, 0.04)' },
    'background'
  );
  const muted = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.6)', dark: 'rgba(255, 255, 255, 0.6)' },
    'text'
  );
  const textColor = useThemeColor({}, 'text');
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');
  const inputBg = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.02)', dark: 'rgba(255, 255, 255, 0.06)' },
    'background'
  );
  const overlayScreenBg = useThemeColor(
    { light: '#f4f4f5', dark: '#111315' },
    'background'
  );
  const overlayCardBg = useThemeColor(
    { light: '#ffffff', dark: '#1a1d21' },
    'background'
  );
  const bubbleAgentBg = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.04)', dark: 'rgba(255, 255, 255, 0.08)' },
    'background'
  );
  const bubbleUserBg = useThemeColor(
    { light: '#111', dark: '#f1f1f1' },
    'text'
  );
  const bubbleUserText = useThemeColor(
    { light: '#fff', dark: '#111' },
    'text'
  );

  const privatePromptParts = useMemo(
    () => splitPromptIntoParts(activePrivatePrompt?.prompt?.text ?? ''),
    [activePrivatePrompt?.prompt?.text]
  );
  const hasDraftPrivateInput = privatePromptInput.trim().length > 0;
  const shouldSubmitNow = privatePromptReadyToSubmit && !hasDraftPrivateInput;
  const promptOverlayTitle =
    activePromptChannel === 'matchmaking' ? 'Matchmaking follow-up' : 'Private prompt';
  const promptBannerNote =
    activePromptChannel === 'matchmaking'
      ? 'Private follow-up to refine a high-potential match'
      : PRIVATE_PROMPT_PRIVACY_NOTE;

  useEffect(() => {
    if (!activePrivatePrompt) {
      setPrivatePromptMessages([]);
      setPrivatePromptPartIndex(0);
      setPrivatePromptAnswersByPart([]);
      setPrivatePromptReadyToSubmit(false);
      setPrivatePromptInput('');
      return;
    }
    const greeting = account?.name
      ? `Hey ${account.name}, have a question for you.`
      : 'Hey, have a question for you.';
    const firstPart = privatePromptParts[0] ?? activePrivatePrompt.prompt.text;
    setPrivatePromptMessages([
      { role: 'agent', text: greeting },
      { role: 'agent', text: firstPart },
    ]);
    setPrivatePromptPartIndex(0);
    setPrivatePromptAnswersByPart((privatePromptParts.length ? privatePromptParts : [firstPart]).map(() => []));
    setPrivatePromptReadyToSubmit(false);
    setPrivatePromptInput('');
  }, [account?.name, activePrivatePrompt?.assignment?.instanceId, activePrivatePrompt?.prompt?.text, privatePromptParts]);

  const sanitizeFacecardDeck = useCallback(
    (cards: MatchCard[]): MatchCard[] => {
      const viewerId = account?.id?.trim();
      if (!viewerId) return cards;
      return cards.filter((match) => {
        const targetId = match.account?.id?.trim();
        if (!targetId) return false;
        if (!/^\d+-a$/.test(targetId)) return false;
        return targetId !== viewerId;
      });
    },
    [account?.id]
  );

  const clearFeedWarmupRetry = useCallback(() => {
    if (feedWarmupRetryTimeoutRef.current) {
      clearTimeout(feedWarmupRetryTimeoutRef.current);
      feedWarmupRetryTimeoutRef.current = null;
    }
  }, []);

  const clearFacecardWarmupRetry = useCallback(() => {
    if (facecardWarmupRetryTimeoutRef.current) {
      clearTimeout(facecardWarmupRetryTimeoutRef.current);
      facecardWarmupRetryTimeoutRef.current = null;
    }
  }, []);

  const markFacecardsExhaustedToday = useCallback(() => {
    setFacecardsExhaustedToday(true);
    setFacecards([]);
    facecardWarmupRetryCountRef.current = 0;
    clearFacecardWarmupRetry();
    const accountId = account?.id;
    if (accountId) {
      AsyncStorage.setItem(facecardExhaustedStorageKey(accountId), todayKey()).catch(() => {});
    }
  }, [account?.id, clearFacecardWarmupRetry]);

  useEffect(() => {
    feedWarmupRetryCountRef.current = 0;
    facecardWarmupRetryCountRef.current = 0;
    clearFeedWarmupRetry();
    clearFacecardWarmupRetry();
    return () => {
      clearFeedWarmupRetry();
      clearFacecardWarmupRetry();
    };
  }, [account?.id, clearFacecardWarmupRetry, clearFeedWarmupRetry]);

  useEffect(() => {
    let cancelled = false;
    setFacecardsExhaustedToday(false);
    const accountId = account?.id;
    if (!accountId) return () => {
      cancelled = true;
    };
    AsyncStorage.getItem(facecardExhaustedStorageKey(accountId))
      .then((storedDay) => {
        if (cancelled) return;
        const exhausted = storedDay === todayKey();
        setFacecardsExhaustedToday(exhausted);
        if (exhausted) {
          setFacecards([]);
          facecardWarmupRetryCountRef.current = 0;
          clearFacecardWarmupRetry();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [account?.id, clearFacecardWarmupRetry]);

  const hydrateFacecardPhotos = useCallback(async (deck: MatchCard[]) => {
    const accountIds = Array.from(
      new Set(deck.map((match) => match.account?.id?.trim()).filter(Boolean))
    ) as string[];
    if (!accountIds.length) {
      setFacecardPhotosByAccountId({});
      return;
    }

    try {
      const stored = await getFacecardPhotoUrisByAccountIds(accountIds);
      const resolved: Record<string, string[]> = {};
      deck.forEach((match) => {
        if (!match.account?.id) return;
        resolved[match.account.id] = resolveFacecardPhotoUris(match, stored);
      });
      setFacecardPhotosByAccountId(resolved);
      setFacecardPhotoIndexByAccountId((prev) => {
        const next: Record<string, number> = {};
        Object.entries(resolved).forEach(([accountId, uris]) => {
          const upper = Math.max(0, uris.length - 1);
          const current = prev[accountId] ?? 0;
          next[accountId] = clamp(current, 0, upper);
        });
        return next;
      });
    } catch {
      const fallback: Record<string, string[]> = {};
      deck.forEach((match) => {
        if (!match.account?.id) return;
        fallback[match.account.id] = resolveFacecardPhotoUris(match, {});
      });
      setFacecardPhotosByAccountId(fallback);
      setFacecardPhotoIndexByAccountId({});
    }
  }, []);

  const refreshFacecards = useCallback(
    async function refreshFacecardsImpl(replace = false) {
      if (!account || !token || facecardsExhaustedToday) return;
      if (facecardRefreshInFlightRef.current) {
        return facecardRefreshInFlightRef.current;
      }
      const refresh = (async () => {
        setFacecardRefetching(true);
        try {
          const nextFacecards = await fetchFacecards(account.id, token, 20);
          const sanitizedIncomingFacecards = sanitizeFacecardDeck(nextFacecards);
          setFacecards((prev) =>
            replace ? sanitizedIncomingFacecards : mergeFacecardQueues(prev, sanitizedIncomingFacecards)
          );
          if (sanitizedIncomingFacecards.length > 0) {
            facecardWarmupRetryCountRef.current = 0;
            clearFacecardWarmupRetry();
            return;
          }
          if (facecardWarmupRetryCountRef.current < 3) {
            facecardWarmupRetryCountRef.current += 1;
            clearFacecardWarmupRetry();
            facecardWarmupRetryTimeoutRef.current = setTimeout(() => {
              void refreshFacecardsImpl(replace);
            }, 900);
          }
        } catch {
          clearFacecardWarmupRetry();
        } finally {
          setFacecardRefetching(false);
        }
      })();
      facecardRefreshInFlightRef.current = refresh;
      return refresh.finally(() => {
        if (facecardRefreshInFlightRef.current === refresh) {
          facecardRefreshInFlightRef.current = null;
        }
      });
    },
    [account, clearFacecardWarmupRetry, facecardsExhaustedToday, sanitizeFacecardDeck, token]
  );

  const loadCard = useCallback(async () => {
    if (!account || !token) return;
    setLoading(true);
    setMessage(null);
    try {
      const [cards, privatePrompt, matchmakingFollowup] = await Promise.all([
        fetchPublicPromptFeed(account.id, token, 1),
        fetchActivePrivatePrompt(account.id, token),
        fetchActiveMatchmakingFollowup(account.id, token),
      ]);
      const nextPrompt = pickActiveAgentPrompt(privatePrompt, matchmakingFollowup);
      setCard(cards.length ? cards[0] : null);
      setActivePrivatePrompt(nextPrompt?.prompt ?? null);
      setActivePromptChannel(nextPrompt?.channel ?? null);
      if (cards.length) {
        feedWarmupRetryCountRef.current = 0;
        clearFeedWarmupRetry();
      } else if (feedWarmupRetryCountRef.current < 3) {
        feedWarmupRetryCountRef.current += 1;
        clearFeedWarmupRetry();
        feedWarmupRetryTimeoutRef.current = setTimeout(() => {
          void loadCard();
        }, 900);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, [account, clearFeedWarmupRetry, token]);

  const loadMatchStandardQuestion = useCallback(
    async (skippedQuestionIds = matchStandardSkippedQuestionIds) => {
      if (!account || !token) return;
      const loadSeq = matchStandardLoadSeqRef.current + 1;
      matchStandardLoadSeqRef.current = loadSeq;
      setMatchStandardLoading(true);
      try {
        if (matchStandardAccountIdRef.current !== account.id) {
          matchStandardAccountIdRef.current = account.id;
          matchStandardAnsweredQuestionIdsRef.current.clear();
        }
        const [questions, answerSet, localAnsweredQuestionIds] = await Promise.all([
          fetchMatchStandardQuestions(),
          fetchMatchStandardAnswers(account.id, token),
          getLocallyAnsweredMatchStandardQuestionIds(account.id),
        ]);
        if (matchStandardLoadSeqRef.current !== loadSeq) return;
        const answersByQuestionId = new Map(
          (answerSet.answers ?? []).map((answer) => [answer.questionId, answer])
        );
        localAnsweredQuestionIds.forEach((questionId) => {
          matchStandardAnsweredQuestionIdsRef.current.add(questionId);
        });
        answersByQuestionId.forEach((_, questionId) => {
          matchStandardAnsweredQuestionIdsRef.current.add(questionId);
        });
        const answeredIds = new Set(matchStandardAnsweredQuestionIdsRef.current);
        const skippedIds = new Set(skippedQuestionIds);
        let nextQuestion =
          questions.find((question) => !answeredIds.has(question.questionId) && !skippedIds.has(question.questionId))
          ?? null;
        if (!nextQuestion && skippedQuestionIds.length > 0) {
          setMatchStandardSkippedQuestionIds([]);
          nextQuestion = questions.find((question) => !answeredIds.has(question.questionId)) ?? null;
        }
        setMatchStandardQuestion(nextQuestion);
        setMatchStandardAnswer(
          nextQuestion
            ? answersByQuestionId.has(nextQuestion.questionId)
              ? matchStandardAnswerFromStored(answersByQuestionId.get(nextQuestion.questionId)!)
              : emptyMatchStandardAnswer()
            : null
        );
      } catch (error) {
        if (matchStandardLoadSeqRef.current !== loadSeq) return;
        setMatchStandardQuestion(null);
        setMessage(error instanceof Error ? error.message : 'Failed to load standard');
      } finally {
        if (matchStandardLoadSeqRef.current === loadSeq) {
          setMatchStandardLoading(false);
        }
      }
    },
    [account, matchStandardSkippedQuestionIds, token]
  );

  const scrollPrivateChatToBottom = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      privateChatScrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCard();
      void loadMatchStandardQuestion();
      facecardWarmupRetryCountRef.current = 0;
      void refreshFacecards();
      return () => {};
    }, [loadCard, loadMatchStandardQuestion, refreshFacecards])
  );

  useEffect(() => {
    setSelectedReactionStrength(0);
  }, [card?.answerId]);

  const selectFeedMode = useCallback((mode: FeedMode) => {
    setFeedMode(mode);
    if (mode === 'matchStandard') {
      void loadMatchStandardQuestion([]);
    }
  }, [loadMatchStandardQuestion]);

  useEffect(() => {
    if (!overlayOpen) return;
    scrollPrivateChatToBottom(privatePromptMessages.length > 2);
  }, [overlayOpen, privatePromptMessages, scrollPrivateChatToBottom]);

  const submitPublicReaction = useCallback(async () => {
    if (!account || !token || !card) return;
    setLoading(true);
    try {
      await postPublicPromptReaction(account.id, token, card.answerId, {
        strength: selectedReactionStrength,
      });
      setSelectedReactionStrength(0);
      await loadCard();
      facecardWarmupRetryCountRef.current = 0;
      void refreshFacecards();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to react');
      setLoading(false);
    }
  }, [account, card, loadCard, refreshFacecards, selectedReactionStrength, token]);

  const updateMatchStandardOwnAnswer = useCallback(
    (optionId: string) => {
      if (!matchStandardQuestion) return;
      setMatchStandardAnswer((current) => {
        const existing = current ?? emptyMatchStandardAnswer();
        const singleChoice = matchStandardQuestion.answerType === 'SINGLE_CHOICE';
        const nextOwn = nextOwnAnswerSelection(
          matchStandardQuestion.questionId,
          singleChoice,
          existing.ownAnswerOptionIds,
          optionId
        );
        const selfMatchOnly = matchStandardQuestion.questionId === RELIGION_MATCH_STANDARD_QUESTION_ID;
        return {
          ...existing,
          ownAnswerOptionIds: nextOwn,
          acceptableAnswerOptionIds: selfMatchOnly
            && existing.importance !== null
            && existing.importance !== 'NOT_IMPORTANT'
            ? nextOwn
            : existing.acceptableAnswerOptionIds,
        };
      });
    },
    [matchStandardQuestion]
  );

  const toggleMatchStandardAcceptable = useCallback((optionId: string) => {
    setMatchStandardAnswer((current) => {
      const existing = current ?? emptyMatchStandardAnswer();
      const acceptable = existing.acceptableAnswerOptionIds.includes(optionId)
        ? existing.acceptableAnswerOptionIds.filter((item) => item !== optionId)
        : [...existing.acceptableAnswerOptionIds, optionId];
      return {
        ...existing,
        acceptableAnswerOptionIds: acceptable,
      };
    });
  }, []);

  const setMatchStandardImportanceValue = useCallback((importance: Importance) => {
    setMatchStandardAnswer((current) => {
      const existing = current ?? emptyMatchStandardAnswer();
      const selfMatchOnly = matchStandardQuestion?.questionId === RELIGION_MATCH_STANDARD_QUESTION_ID;
      return {
        ...existing,
        importance,
        acceptableAnswerOptionIds: selfMatchOnly
          ? importance === 'NOT_IMPORTANT'
            ? []
            : existing.ownAnswerOptionIds
          : existing.acceptableAnswerOptionIds,
      };
    });
  }, [matchStandardQuestion?.questionId]);

  const skipMatchStandardQuestion = useCallback(() => {
    if (!matchStandardQuestion) return;
    const nextSkipped = [...matchStandardSkippedQuestionIds, matchStandardQuestion.questionId];
    setMatchStandardSkippedQuestionIds(nextSkipped);
    void loadMatchStandardQuestion(nextSkipped);
  }, [matchStandardQuestion, matchStandardSkippedQuestionIds, loadMatchStandardQuestion]);

  const submitMatchStandardAnswer = useCallback(async () => {
    if (!account || !token || !matchStandardQuestion || !isMatchStandardAnswerComplete(matchStandardAnswer)) {
      setMessage('Complete this standard before continuing.');
      return;
    }
    setMatchStandardSubmitting(true);
    setMessage(null);
    try {
      await postMatchStandardAnswer(
        account.id,
        token,
        matchStandardQuestion.questionId,
        matchStandardPayload(matchStandardAnswer)
      );
      matchStandardAnsweredQuestionIdsRef.current.add(matchStandardQuestion.questionId);
      await markMatchStandardQuestionsAnswered(account.id, [matchStandardQuestion.questionId]);
      await loadMatchStandardQuestion();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save standard');
    } finally {
      setMatchStandardSubmitting(false);
    }
  }, [
    account,
    matchStandardAnswer,
    matchStandardQuestion,
    loadMatchStandardQuestion,
    token,
  ]);

  const resetFacecardsOverlay = useCallback(() => {
    Keyboard.dismiss();
    setFacecardsOverlayOpen(false);
    setFacecardReacting(false);
    setFacecardDeck([]);
    setFacecardIndex(0);
    setFacecardViewportWidth(1);
    setFacecardPhotoIndexByAccountId({});
  }, []);

  const dismissFacecardsOverlay = useCallback(() => {
    setFacecards(facecardDeck.slice(facecardIndex));
    resetFacecardsOverlay();
  }, [facecardDeck, facecardIndex, resetFacecardsOverlay]);

  useEffect(() => {
    setFacecards([]);
    setFacecardRefetching(false);
    setFacecardsExhaustedToday(false);
    facecardWarmupRetryCountRef.current = 0;
    facecardOpenPendingRef.current = false;
    clearFacecardWarmupRetry();
    setFacecardPhotosByAccountId({});
    resetFacecardsOverlay();
  }, [account?.id, clearFacecardWarmupRetry, resetFacecardsOverlay]);

  const openFacecardsOverlay = useCallback(() => {
    if (!account || !token) return;
    const deck = sanitizeFacecardDeck(facecards);
    if (!deck.length) {
      if (facecardsExhaustedToday) return;
      facecardOpenPendingRef.current = true;
      facecardWarmupRetryCountRef.current = 0;
      void refreshFacecards();
      return;
    }
    facecardOpenPendingRef.current = false;
    setMessage(null);
    Keyboard.dismiss();
    void hydrateFacecardPhotos(deck);
    setFacecardDeck(deck);
    setFacecardIndex(0);
    setFacecardPhotoIndexByAccountId({});
    setFacecardsOverlayOpen(true);
    requestAnimationFrame(() => {
      facecardsScrollRef.current?.scrollTo({ x: 0, animated: false });
    });
  }, [account, facecards, facecardsExhaustedToday, hydrateFacecardPhotos, refreshFacecards, sanitizeFacecardDeck, token]);

  useEffect(() => {
    if (facecardOpenPendingRef.current && facecards.length > 0) {
      openFacecardsOverlay();
    }
  }, [facecards, openFacecardsOverlay]);

  const refetchFacecardsAfterExhaustion = useCallback(() => {
    markFacecardsExhaustedToday();
  }, [markFacecardsExhaustedToday]);

  const handleFacecardDeckScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (facecardDeck.length === 0) return;
      const width = Math.max(1, facecardViewportWidth);
      const rawIndex = Math.round(event.nativeEvent.contentOffset.x / width);
      const nextIndex = Math.max(0, Math.min(rawIndex, facecardDeck.length - 1));
      setFacecardIndex(nextIndex);
    },
    [facecardDeck.length, facecardViewportWidth]
  );

  const advanceFacecard = useCallback(
    async (reaction: 'LIKE' | 'DISLIKE' | 'SKIP') => {
      if (!facecardDeck.length || !account || !token) return;
      const current = facecardDeck[facecardIndex];
      if (!current?.account?.id) {
        const nextIndex = facecardIndex + 1;
        if (nextIndex >= facecardDeck.length) {
          resetFacecardsOverlay();
          refetchFacecardsAfterExhaustion();
        } else {
          setFacecardIndex(nextIndex);
          setFacecards(facecardDeck.slice(nextIndex));
        }
        return;
      }
      setFacecardReacting(true);
      setMessage(null);
      try {
        await postFacecardReaction(account.id, token, current.account.id, { reaction });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to react to facecard');
        setFacecardReacting(false);
        return;
      }
      const nextIndex = facecardIndex + 1;
      if (nextIndex >= facecardDeck.length) {
        resetFacecardsOverlay();
        refetchFacecardsAfterExhaustion();
        setFacecardReacting(false);
        return;
      }
      setFacecardIndex(nextIndex);
      setFacecards(facecardDeck.slice(nextIndex));
      facecardsScrollRef.current?.scrollTo({
        x: nextIndex * Math.max(1, facecardViewportWidth),
        animated: true,
      });
      setFacecardReacting(false);
    },
    [account, facecardDeck, facecardIndex, facecardViewportWidth, refetchFacecardsAfterExhaustion, resetFacecardsOverlay, token]
  );

  const rotateFacecardPhoto = useCallback(
    (accountId: string, totalPhotos: number, direction: 'previous' | 'next') => {
      if (!accountId || totalPhotos <= 1) return;
      setFacecardPhotoIndexByAccountId((prev) => {
        const current = prev[accountId] ?? 0;
        const next =
          direction === 'next'
            ? (current + 1) % totalPhotos
            : (current - 1 + totalPhotos) % totalPhotos;
        return {
          ...prev,
          [accountId]: next,
        };
      });
    },
    []
  );

  const closeOverlay = useCallback(() => {
    Keyboard.dismiss();
    setOverlayOpen(false);
  }, []);

  const sendPrivatePromptTurn = useCallback(async () => {
    if (!account || !token || !activePrivatePrompt) return;
    Keyboard.dismiss();
    const userMessage = privatePromptInput.trim();
    if (!userMessage) {
      setMessage('Write a reply before sending.');
      return;
    }
    const currentPart =
      privatePromptParts[privatePromptPartIndex] ?? activePrivatePrompt.prompt.text;
    const messagesWithUserTurn = [...privatePromptMessages, { role: 'user' as const, text: userMessage }];
    const answersWithUserTurn = privatePromptAnswersByPart.map((partAnswers, idx) =>
      idx === privatePromptPartIndex ? [...partAnswers, userMessage] : partAnswers
    );
    setPrivatePromptMessages(messagesWithUserTurn);
    setPrivatePromptAnswersByPart(answersWithUserTurn);
    setPrivatePromptInput('');
    setPrivatePromptSubmitting(true);
    try {
      const turnPayload = {
        questionPart: currentPart,
        userMessage,
        conversation: toConversationLines(messagesWithUserTurn),
      };
      const turn =
        activePromptChannel === 'matchmaking'
          ? await postMatchmakingFollowupChatTurn(
              account.id,
              token,
              activePrivatePrompt.assignment.instanceId,
              turnPayload
            )
          : await postPrivatePromptChatTurn(
              account.id,
              token,
              activePrivatePrompt.assignment.instanceId,
              turnPayload
            );
      const nextMessages = [...messagesWithUserTurn];
      const agentTurnText = turn.agentMessage?.trim() ?? '';
      const hasAgentTurnText = agentTurnText.length > 0;
      if (hasAgentTurnText) {
        nextMessages.push({ role: 'agent', text: agentTurnText });
      }
      if (turn.needsMoreDetail) {
        setPrivatePromptReadyToSubmit(false);
      } else {
        const shouldAdvancePart =
          privatePromptPartIndex < privatePromptParts.length - 1 &&
          !answerCanCoverRemainingPromptParts(
            activePrivatePrompt.prompt.promptId,
            privatePromptPartIndex,
            privatePromptAnswersByPart[privatePromptPartIndex] ?? [],
            userMessage
          );
        if (shouldAdvancePart) {
          setPrivatePromptReadyToSubmit(false);
          const nextPartIndex = privatePromptPartIndex + 1;
          setPrivatePromptPartIndex(nextPartIndex);
          nextMessages.push({ role: 'agent', text: privatePromptParts[nextPartIndex] });
        } else {
          setPrivatePromptReadyToSubmit(true);
          if (!privatePromptReadyToSubmit && !hasAgentTurnText) {
            nextMessages.push({
              role: 'agent',
              text: "Thanks, that's helpful. You can add more detail, or tap Submit when you're ready.",
            });
          }
        }
      }
      setPrivatePromptMessages(nextMessages);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : activePromptChannel === 'matchmaking'
            ? 'Failed to continue matchmaking follow-up'
            : 'Failed to continue private prompt chat'
      );
    } finally {
      setPrivatePromptSubmitting(false);
    }
  }, [
    account,
    activePrivatePrompt,
    activePromptChannel,
    privatePromptAnswersByPart,
    privatePromptInput,
    privatePromptMessages,
    privatePromptPartIndex,
    privatePromptParts,
    privatePromptReadyToSubmit,
    token,
  ]);

  const submitPrivatePromptAnswer = useCallback(async () => {
    if (!account || !token || !activePrivatePrompt) return;
    Keyboard.dismiss();
    const partsForBody =
      privatePromptParts.length > 0 ? privatePromptParts : [activePrivatePrompt.prompt.text];
    const trailingInput = privatePromptInput.trim();
    const answersForSubmit = privatePromptAnswersByPart.map((partAnswers) => [...partAnswers]);
    const messagesForSubmit = [...privatePromptMessages];
    if (trailingInput) {
      const targetPart = Math.max(0, Math.min(privatePromptPartIndex, answersForSubmit.length - 1));
      if (!answersForSubmit[targetPart]) {
        answersForSubmit[targetPart] = [];
      }
      answersForSubmit[targetPart].push(trailingInput);
      messagesForSubmit.push({ role: 'user', text: trailingInput });
    }
    const body = buildPrivatePromptBody(partsForBody, answersForSubmit).trim();
    if (!body) {
      setMessage('Add at least one answer before submitting.');
      return;
    }
    const conversation = toConversationLines(messagesForSubmit);
    if (activePromptChannel === 'matchmaking') {
      postMatchmakingFollowupAnswer(
        account.id,
        token,
        activePrivatePrompt.assignment.instanceId,
        body,
        conversation
      ).catch(() => {});
    } else {
      postPrivatePromptAnswer(
        account.id,
        token,
        activePrivatePrompt.assignment.instanceId,
        body,
        conversation
      ).catch(() => {});
    }
    closeOverlay();
    setActivePrivatePrompt(null);
    setActivePromptChannel(null);
    facecardWarmupRetryCountRef.current = 0;
    void refreshFacecards();
  }, [
    account,
    activePrivatePrompt,
    activePromptChannel,
    closeOverlay,
    privatePromptAnswersByPart,
    privatePromptInput,
    privatePromptMessages,
    privatePromptPartIndex,
    privatePromptParts,
    refreshFacecards,
    token,
  ]);

  const skipPrivatePrompt = useCallback(async () => {
    if (!account || !token || !activePrivatePrompt) return;
    Keyboard.dismiss();
    setPrivatePromptSubmitting(true);
    try {
      if (activePromptChannel === 'matchmaking') {
        await postMatchmakingFollowupSkip(account.id, token, activePrivatePrompt.assignment.instanceId);
      } else {
        await postPrivatePromptSkip(account.id, token, activePrivatePrompt.assignment.instanceId);
      }
      closeOverlay();
      setPrivatePromptInput('');
      setActivePrivatePrompt(null);
      setActivePromptChannel(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : activePromptChannel === 'matchmaking'
            ? 'Failed to skip matchmaking follow-up'
            : 'Failed to skip private prompt'
      );
    } finally {
      setPrivatePromptSubmitting(false);
    }
  }, [account, activePrivatePrompt, activePromptChannel, closeOverlay, token]);

  const promptPrivatePromptExit = useCallback(() => {
    if (privatePromptSubmitting) return;
    Keyboard.dismiss();
    if (Platform.OS === 'web') {
      closeOverlay();
      return;
    }
    Alert.alert(
      'Private prompt',
      'Skip this question, or come back later?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Come back later',
          onPress: closeOverlay,
        },
        {
          text: 'Skip question',
          style: 'destructive',
          onPress: () => {
            void skipPrivatePrompt();
          },
        },
      ]
    );
  }, [closeOverlay, privatePromptSubmitting, skipPrivatePrompt]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.quickActionsRow}>
        {activePrivatePrompt ? (
          <Pressable
            onPress={() => setOverlayOpen(true)}
            disabled={privatePromptSubmitting}
            style={({ pressed }) => [
              styles.quickActionButton,
              {
                borderColor: cardBorder,
                backgroundColor: cardBg,
                opacity: pressed || privatePromptSubmitting ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="chatbox" size={18} color={muted} />
            <ThemedText style={[styles.quickActionText, { color: muted }]}>
              {activePromptChannel === 'matchmaking' ? 'Follow-up' : 'Private agent'}
            </ThemedText>
          </Pressable>
        ) : null}

        {facecards.length > 0 ? (
          <Pressable
            onPress={openFacecardsOverlay}
            disabled={privatePromptSubmitting}
            style={({ pressed }) => [
              styles.quickActionButton,
              {
                borderColor: cardBorder,
                backgroundColor: cardBg,
                opacity: pressed || privatePromptSubmitting ? 0.7 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons name="star-face" size={18} color={muted} />
            <ThemedText style={[styles.quickActionText, { color: muted }]}>
              {`Facecards ${facecards.length}`}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.feedModeRow}>
        {FEED_MODES.map((mode) => {
          const selected = feedMode === mode.value;
          return (
            <Pressable
              key={mode.value}
              onPress={() => selectFeedMode(mode.value)}
              style={({ pressed }) => [
                styles.feedModeChip,
                {
                  borderColor: selected ? primaryBg : cardBorder,
                  backgroundColor: selected ? primaryBg : cardBg,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <ThemedText
                style={[styles.feedModeChipText, { color: selected ? primaryText : muted }]}
              >
                {mode.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {loading && (
        <View style={styles.stateRow}>
          <ActivityIndicator />
          <ThemedText>Loading feed…</ThemedText>
        </View>
      )}

      {message && (
        <View style={[styles.notice, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <ThemedText style={[styles.mutedText, { color: muted }]}>{message}</ThemedText>
        </View>
      )}

      {feedMode === 'public' && card ? (
        <View pointerEvents="box-none" style={styles.feedCenterLayer}>
          <View style={[styles.card, styles.feedCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText type="defaultSemiBold">{card.promptText}</ThemedText>
            <ThemedText style={[styles.bodyText, { color: muted }]}>{card.body}</ThemedText>
            <View style={styles.reactionPicker}>
              <View style={styles.reactionScaleRow}>
                {PUBLIC_REACTION_STRENGTH_OPTIONS.map((strength) => {
                  const isSelected = selectedReactionStrength === strength;
                  const magnitude = Math.abs(strength);
                  const dotSize = strength === 0 ? 14 : 14 + magnitude * 4;
                  const activeColor =
                    strength > 0 ? '#1d8f52' : strength < 0 ? '#d97706' : primaryBg;
                  const inactiveBorder =
                    strength > 0 ? 'rgba(29, 143, 82, 0.5)' : strength < 0 ? 'rgba(217, 119, 6, 0.5)' : cardBorder;
                  return (
                    <Pressable
                      key={`reaction-${strength}`}
                      onPress={() => setSelectedReactionStrength(strength)}
                      disabled={loading}
                      style={({ pressed }) => [
                        styles.reactionDotTap,
                        { opacity: pressed || loading ? 0.72 : 1 },
                      ]}
                    >
                      <View
                        style={[
                          styles.reactionDot,
                          {
                            width: dotSize,
                            height: dotSize,
                            borderColor: isSelected ? activeColor : inactiveBorder,
                            backgroundColor: isSelected ? activeColor : 'transparent',
                          },
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.reactionLegendRow}>
                <ThemedText style={[styles.mutedText, { color: muted }]}>Strong pass</ThemedText>
                <ThemedText style={[styles.mutedText, { color: muted }]}>Strong like</ThemedText>
              </View>
              <ThemedText style={[styles.mutedText, { color: muted }]}>
                {`Selected: ${reactionStrengthLabel(selectedReactionStrength)}`}
              </ThemedText>
              <Pressable
                onPress={submitPublicReaction}
                disabled={loading}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    borderColor: primaryBg,
                    backgroundColor: primaryBg,
                    opacity: pressed || loading ? 0.55 : 1,
                  },
                ]}
              >
                <ThemedText style={[styles.actionText, { color: primaryText }]}>Next</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {feedMode === 'public' && !card && !loading ? (
        <View pointerEvents="box-none" style={styles.feedCenterLayer}>
          <View style={[styles.card, styles.feedCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText type="defaultSemiBold">No public prompts right now</ThemedText>
            <ThemedText style={[styles.bodyText, { color: muted }]}>
              Switch to Standards, answer a private prompt, or check facecards when they are available.
            </ThemedText>
          </View>
        </View>
      ) : null}

      {feedMode === 'matchStandard' ? (
        <View pointerEvents="box-none" style={styles.feedCenterLayer}>
          <View style={[styles.card, styles.feedCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            {matchStandardLoading ? (
              <View style={styles.stateRowCompact}>
                <ActivityIndicator />
                <ThemedText style={[styles.mutedText, { color: muted }]}>
                  Loading question…
                </ThemedText>
              </View>
            ) : matchStandardQuestion ? (
              (() => {
                const selfMatchOnly =
                  matchStandardQuestion.questionId === RELIGION_MATCH_STANDARD_QUESTION_ID;
                return (
              <>
                <ThemedText style={[styles.mutedText, { color: muted }]}>
                  {formatMatchStandardCategory(matchStandardQuestion.category)}
                </ThemedText>
                <ThemedText type="defaultSemiBold">{matchStandardQuestion.text}</ThemedText>

                <View style={styles.matchStandardBlock}>
                  <ThemedText style={[styles.matchStandardLabel, { color: muted }]}>
                    My answer
                  </ThemedText>
                  <View style={styles.optionRow}>
                    {matchStandardQuestion.options.map((option) => (
                      <Pressable
                        key={option.optionId}
                        onPress={() => updateMatchStandardOwnAnswer(option.optionId)}
                        disabled={matchStandardSubmitting}
                        style={({ pressed }) => [
                          styles.optionChip,
                          {
                            borderColor: matchStandardAnswer?.ownAnswerOptionIds.includes(option.optionId)
                              ? primaryBg
                              : cardBorder,
                            backgroundColor: matchStandardAnswer?.ownAnswerOptionIds.includes(option.optionId)
                              ? primaryBg
                              : 'transparent',
                            opacity: pressed || matchStandardSubmitting ? 0.72 : 1,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.optionChipText,
                            {
                              color: matchStandardAnswer?.ownAnswerOptionIds.includes(option.optionId)
                                ? primaryText
                                : muted,
                            },
                          ]}
                        >
                          {option.text}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {!selfMatchOnly ? (
                  <View style={styles.matchStandardBlock}>
                    <ThemedText style={[styles.matchStandardLabel, { color: muted }]}>
                      Partner answers that work for me
                    </ThemedText>
                    <View style={styles.optionRow}>
                      {matchStandardQuestion.options.map((option) => {
                        const isAccepted = Boolean(
                          matchStandardAnswer?.acceptableAnswerOptionIds.includes(option.optionId)
                        );
                        return (
                          <Pressable
                            key={`acceptable-${option.optionId}`}
                            onPress={() => toggleMatchStandardAcceptable(option.optionId)}
                            disabled={matchStandardSubmitting}
                            style={({ pressed }) => [
                              styles.optionChip,
                              {
                                borderColor: isAccepted ? primaryBg : cardBorder,
                                backgroundColor: isAccepted ? primaryBg : 'transparent',
                                opacity: pressed || matchStandardSubmitting ? 0.72 : 1,
                              },
                            ]}
                          >
                            <ThemedText
                              style={[
                                styles.optionChipText,
                                { color: isAccepted ? primaryText : muted },
                              ]}
                            >
                              {option.text}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                <View style={styles.matchStandardBlock}>
                  <ThemedText style={[styles.matchStandardLabel, { color: muted }]}>
                    {selfMatchOnly ? 'Should my partner share this?' : 'How much this matters'}
                  </ThemedText>
                  <View style={styles.optionRow}>
                    {MATCH_STANDARD_IMPORTANCE_OPTIONS.map((option) => {
                      const selectedImportance = matchStandardAnswer?.importance ?? null;
                      const isSelected = selectedImportance === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => setMatchStandardImportanceValue(option.value)}
                          disabled={matchStandardSubmitting}
                          style={({ pressed }) => [
                            styles.optionChip,
                            {
                              borderColor: isSelected ? primaryBg : cardBorder,
                              backgroundColor: isSelected ? primaryBg : 'transparent',
                              opacity: pressed || matchStandardSubmitting ? 0.72 : 1,
                            },
                          ]}
                        >
                          <ThemedText
                            style={[
                              styles.optionChipText,
                              { color: isSelected ? primaryText : muted },
                            ]}
                          >
                            {option.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {!selfMatchOnly
                    && matchStandardAnswer?.importance !== null
                    && matchStandardAnswer?.importance !== 'NOT_IMPORTANT'
                    && (matchStandardAnswer?.acceptableAnswerOptionIds.length ?? 0) === 0 ? (
                    <ThemedText style={[styles.mutedText, { color: muted }]}>
                      Pick at least one partner answer that works for you.
                    </ThemedText>
                  ) : null}
                </View>

                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={skipMatchStandardQuestion}
                    disabled={matchStandardSubmitting}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        borderColor: cardBorder,
                        backgroundColor: 'transparent',
                        opacity: pressed || matchStandardSubmitting ? 0.55 : 1,
                      },
                    ]}
                  >
                    <ThemedText style={[styles.actionText, { color: muted }]}>Skip</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={submitMatchStandardAnswer}
                    disabled={matchStandardSubmitting || !isMatchStandardAnswerComplete(matchStandardAnswer)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        borderColor: primaryBg,
                        backgroundColor: primaryBg,
                        opacity:
                          pressed || matchStandardSubmitting || !isMatchStandardAnswerComplete(matchStandardAnswer)
                            ? 0.55
                            : 1,
                      },
                    ]}
                  >
                    <ThemedText style={[styles.actionText, { color: primaryText }]}>
                      {matchStandardSubmitting ? 'Saving…' : 'Next'}
                    </ThemedText>
                  </Pressable>
                </View>
              </>
                );
              })()
            ) : (
              <>
                <ThemedText type="defaultSemiBold">You&apos;re caught up</ThemedText>
                <ThemedText style={[styles.bodyText, { color: muted }]}>
                  New standards can be added without changing your public profile.
                </ThemedText>
              </>
            )}
          </View>
        </View>
      ) : null}

      <Modal
        transparent={false}
        animationType="slide"
        visible={facecardsOverlayOpen && facecardDeck.length > 0}
        onRequestClose={dismissFacecardsOverlay}
      >
        <KeyboardAvoidingView
          style={[styles.overlayScreen, { backgroundColor: overlayScreenBg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.overlayCard, { borderColor: cardBorder, backgroundColor: overlayCardBg }]}>
            <View style={styles.overlayHeader}>
              <ThemedText type="subtitle">Facecards</ThemedText>
              <Pressable onPress={dismissFacecardsOverlay}>
                <ThemedText style={[styles.mutedText, { color: muted }]}>Close</ThemedText>
              </Pressable>
            </View>

            <ThemedText style={[styles.mutedText, { color: muted }]}>{FACECARD_NOTE}</ThemedText>

            <ThemedText style={[styles.mutedText, { color: muted }]}>
              {facecardDeck.length > 0 ? facecardIndex + 1 : 0} of {facecardDeck.length}
            </ThemedText>

            <View
              style={[styles.facecardsViewport, { borderColor: cardBorder }]}
              onLayout={(event) => {
                const width = Math.floor(event.nativeEvent.layout.width);
                if (width <= 0) return;
                setFacecardViewportWidth(width);
                requestAnimationFrame(() => {
                  facecardsScrollRef.current?.scrollTo({ x: facecardIndex * width, animated: false });
                });
              }}
            >
              <ScrollView
                ref={facecardsScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleFacecardDeckScroll}
                contentContainerStyle={styles.facecardsScrollContent}
              >
                {facecardDeck.map((match) => {
                  const photoUris =
                    facecardPhotosByAccountId[match.account.id]?.length
                      ? facecardPhotosByAccountId[match.account.id]
                      : uniqueNonEmptyStrings([match.account.avatar_static, match.account.avatar]);
                  const photoCount = photoUris.length;
                  const clampedPhotoIndex =
                    photoCount > 0
                      ? clamp(facecardPhotoIndexByAccountId[match.account.id] ?? 0, 0, photoCount - 1)
                      : 0;
                  const imageUri = photoCount > 0 ? photoUris[clampedPhotoIndex] : null;
                  return (
                    <View
                      key={`${match.account.id}-${match.computedAt}`}
                      style={[styles.facecardSlide, { width: Math.max(1, facecardViewportWidth) }]}
                    >
                      <View
                        style={[
                          styles.facecardSlideCard,
                          { borderColor: cardBorder, backgroundColor: cardBg },
                        ]}
                      >
                        <View style={styles.facecardImageFrame}>
                          {imageUri ? (
                            <Image source={{ uri: imageUri }} style={styles.facecardImage} />
                          ) : (
                            <View style={[styles.facecardImage, styles.facecardImagePlaceholder]}>
                              <ThemedText style={[styles.mutedText, { color: muted }]}>
                                No photo yet
                              </ThemedText>
                            </View>
                          )}
                          {photoCount > 1 ? (
                            <>
                              <Pressable
                                style={styles.facecardImageTapLeft}
                                onPress={() =>
                                  rotateFacecardPhoto(match.account.id, photoCount, 'previous')
                                }
                              />
                              <Pressable
                                style={styles.facecardImageTapRight}
                                onPress={() =>
                                  rotateFacecardPhoto(match.account.id, photoCount, 'next')
                                }
                              />
                              <View style={[styles.facecardImagePager, { borderColor: cardBorder }]}>
                                <ThemedText style={[styles.facecardImagePagerText, { color: muted }]}>
                                  {clampedPhotoIndex + 1}/{photoCount}
                                </ThemedText>
                              </View>
                            </>
                          ) : null}
                        </View>
                        <View style={styles.facecardMeta}>
                          <ThemedText type="defaultSemiBold">{match.account.name}</ThemedText>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.overlayActions}>
              <Pressable
                disabled={facecardReacting}
                onPress={() => advanceFacecard('DISLIKE')}
                style={({ pressed }) => [
                  styles.actionButton,
                  { borderColor: cardBorder, opacity: pressed || facecardReacting ? 0.7 : 1 },
                ]}
              >
                <ThemedText style={[styles.actionText, { color: muted }]}>
                  {facecardReacting ? 'Saving...' : 'Pass'}
                </ThemedText>
              </Pressable>

              <Pressable
                disabled={facecardReacting}
                onPress={() => advanceFacecard('LIKE')}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    borderColor: primaryBg,
                    backgroundColor: primaryBg,
                    opacity: pressed || facecardReacting ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText style={[styles.actionText, { color: primaryText }]}>Like</ThemedText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent={false}
        animationType="fade"
        visible={overlayOpen && !!activePrivatePrompt}
        onRequestClose={promptPrivatePromptExit}
      >
        <KeyboardAvoidingView
          style={[styles.privateOverlayScreen, { backgroundColor: overlayScreenBg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.overlayDismissLayer} onPress={Keyboard.dismiss} />
          <View
            style={[styles.privateOverlayCard, { borderColor: cardBorder, backgroundColor: overlayCardBg }]}
          >
            <View style={styles.privateOverlayHeader}>
              <View style={styles.privateOverlayHeaderLeft}>
                <Pressable
                  onPress={promptPrivatePromptExit}
                  disabled={privatePromptSubmitting}
                  style={({ pressed }) => [
                    styles.privateOverlayCloseButton,
                    {
                      borderColor: cardBorder,
                      opacity: pressed || privatePromptSubmitting ? 0.72 : 1,
                    },
                  ]}
                >
                  <Ionicons name="close" size={20} color={muted} />
                </Pressable>
                <View style={styles.privateOverlayHeaderTextWrap}>
                  <ThemedText type="subtitle" numberOfLines={1}>
                    {promptOverlayTitle}
                  </ThemedText>
                  <ThemedText style={[styles.mutedText, { color: muted }]} numberOfLines={1}>
                    Part {Math.min(privatePromptPartIndex + 1, Math.max(privatePromptParts.length, 1))} of{' '}
                    {Math.max(privatePromptParts.length, 1)}
                  </ThemedText>
                </View>
              </View>

              <Pressable
                disabled={privatePromptSubmitting}
                onPress={shouldSubmitNow ? submitPrivatePromptAnswer : sendPrivatePromptTurn}
                style={({ pressed }) => [
                  styles.privateOverlayPrimaryAction,
                  {
                    borderColor: primaryBg,
                    backgroundColor: primaryBg,
                    opacity: pressed || privatePromptSubmitting ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText style={[styles.actionText, { color: primaryText }]}>
                  {shouldSubmitNow ? 'Submit' : 'Send'}
                </ThemedText>
              </Pressable>
            </View>

            <ThemedText style={[styles.mutedText, { color: muted }]}>
              {promptBannerNote}
            </ThemedText>

            <ScrollView
              ref={privateChatScrollRef}
              style={[styles.privateChatTimeline, { borderColor: cardBorder }]}
              contentContainerStyle={styles.chatTimelineContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => {
                if (!overlayOpen) return;
                privateChatScrollRef.current?.scrollToEnd({ animated: true });
              }}
            >
              {privatePromptMessages.map((message, idx) => {
                const isUser = message.role === 'user';
                return (
                  <View
                    key={`${message.role}-${idx}-${message.text}`}
                    style={[
                      styles.chatBubble,
                      isUser ? styles.chatBubbleUser : styles.chatBubbleAgent,
                      {
                        backgroundColor: isUser ? bubbleUserBg : bubbleAgentBg,
                        borderColor: isUser ? bubbleUserBg : cardBorder,
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.chatBubbleText,
                        { color: isUser ? bubbleUserText : textColor },
                      ]}
                    >
                      {message.text}
                    </ThemedText>
                  </View>
                );
              })}
            </ScrollView>

            <TextInput
              multiline
              value={privatePromptInput}
              onChangeText={setPrivatePromptInput}
              placeholder={privatePromptReadyToSubmit ? 'Anything else before submit?' : 'Write your reply...'}
              placeholderTextColor={muted}
              editable={!privatePromptSubmitting}
              style={[
                styles.privateTextInput,
                { borderColor: cardBorder, color: textColor, backgroundColor: inputBg },
              ]}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 56,
    position: 'relative',
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 42,
    zIndex: 2,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  feedModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    zIndex: 2,
  },
  feedModeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  feedModeChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    zIndex: 2,
  },
  stateRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notice: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    zIndex: 2,
  },
  feedCenterLayer: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 20,
    justifyContent: 'center',
  },
  card: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  feedCard: {
    width: '100%',
    alignSelf: 'center',
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 22,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  matchStandardBlock: {
    gap: 8,
  },
  matchStandardLabel: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.72,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  optionChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reactionPicker: {
    marginTop: 8,
    gap: 10,
  },
  reactionScaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  reactionDotTap: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionDot: {
    borderWidth: 1.5,
    borderRadius: 999,
  },
  reactionLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mutedText: {
    fontSize: 13,
  },
  overlayScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  overlayDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  overlayCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  privateOverlayScreen: {
    flex: 1,
  },
  privateOverlayCard: {
    flex: 1,
    zIndex: 1,
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 20,
    paddingBottom: 16,
    gap: 12,
  },
  privateOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  privateOverlayHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  privateOverlayHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  privateOverlayCloseButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateOverlayPrimaryAction: {
    minWidth: 88,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  overlayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatTimeline: {
    maxHeight: 280,
    borderWidth: 1,
    borderRadius: 12,
  },
  chatTimelineContent: {
    padding: 10,
    gap: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  privateChatTimeline: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderRadius: 12,
  },
  chatBubble: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: '90%',
  },
  chatBubbleAgent: {
    alignSelf: 'flex-start',
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
  },
  chatBubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  textInput: {
    minHeight: 90,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  privateTextInput: {
    minHeight: 130,
    maxHeight: 210,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  facecardsViewport: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 360,
    overflow: 'hidden',
  },
  facecardsScrollContent: {
    alignItems: 'stretch',
  },
  facecardSlide: {
    padding: 10,
  },
  facecardSlideCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    gap: 10,
  },
  facecardImageFrame: {
    position: 'relative',
  },
  facecardImage: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  facecardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  facecardImageTapLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '45%',
  },
  facecardImageTapRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '45%',
  },
  facecardImagePager: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  facecardImagePagerText: {
    fontSize: 11,
    fontWeight: '600',
  },
  facecardMeta: {
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  overlayActions: {
    flexDirection: 'row',
    gap: 8,
  },
});
