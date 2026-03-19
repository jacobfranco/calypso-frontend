import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import { getFacecardPhotoUrisByAccountIds } from '@/lib/facecard-photos';
import {
  ActivePrivatePrompt,
  fetchFacecards,
  fetchActiveMatchmakingFollowup,
  fetchActivePrivatePrompt,
  fetchSignals,
  fetchPublicPromptFeed,
  MatchCard,
  postDebugSummonNextPrivatePrompt,
  postFacecardReaction,
  postMatchmakingFollowupAnswer,
  postMatchmakingFollowupChatTurn,
  postMatchmakingFollowupSkip,
  postPrivatePromptChatTurn,
  postPrivatePromptAnswer,
  postPrivatePromptSkip,
  postPublicPromptReaction,
  PublicPromptFeedCard,
  SignalRecord,
} from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

type PrivatePromptChatMessage = {
  role: 'agent' | 'user';
  text: string;
};

type PromptChannel = 'private' | 'matchmaking';

const PRIVATE_PROMPT_PRIVACY_NOTE =
  'Your answers stay private and are only used for matchmaking.';
const FACECARD_NOTE =
  'Facecards come from your highest-ranked candidate pool.';

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
  const withQuestions = trimmed
    .split(/(?<=\?)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (withQuestions.length > 1) return withQuestions;
  const sentences = trimmed
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length > 1) return sentences;
  return [trimmed];
}

function toConversationLines(messages: PrivatePromptChatMessage[]): string[] {
  return messages.map((message) => `${message.role}: ${message.text}`);
}

function buildPrivatePromptBody(parts: string[], answersByPart: string[][]): string {
  const sections: string[] = [];
  parts.forEach((part, idx) => {
    const answers = answersByPart[idx] ?? [];
    const merged = answers
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' ');
    if (!merged) return;
    sections.push(`Q${idx + 1}: ${part}`);
    sections.push(`A${idx + 1}: ${merged}`);
  });
  return sections.join('\n');
}

export default function HomeScreen() {
  const { account, token } = useAuth();
  const facecardsScrollRef = useRef<ScrollView>(null);
  const feedWarmupRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedWarmupRetryCountRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<PublicPromptFeedCard | null>(null);
  const [facecards, setFacecards] = useState<MatchCard[]>([]);
  const [facecardsLoading, setFacecardsLoading] = useState(false);
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
  const [debugPromptLoading, setDebugPromptLoading] = useState(false);
  const [signalRecords, setSignalRecords] = useState<SignalRecord[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
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
  const promptBannerTitle =
    activePromptChannel === 'matchmaking'
      ? 'Matchmaking follow-up ready'
      : 'Private agent question ready';
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

  const refreshSignals = useCallback(async () => {
    if (!account || !token) return;
    setSignalsLoading(true);
    try {
      const signals = await fetchSignals(account.id, token);
      setSignalRecords(signals.records ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load signals');
    } finally {
      setSignalsLoading(false);
    }
  }, [account, token]);

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

  useEffect(() => {
    feedWarmupRetryCountRef.current = 0;
    clearFeedWarmupRetry();
    return () => {
      clearFeedWarmupRetry();
    };
  }, [account?.id, clearFeedWarmupRetry]);

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

  const loadCard = useCallback(async () => {
    if (!account || !token) return;
    setLoading(true);
    setMessage(null);
    try {
      const [cards, privatePrompt, matchmakingFollowup, signals] = await Promise.all([
        fetchPublicPromptFeed(account.id, token, 1),
        fetchActivePrivatePrompt(account.id, token),
        fetchActiveMatchmakingFollowup(account.id, token),
        fetchSignals(account.id, token),
      ]);
      const nextPrompt = pickActiveAgentPrompt(privatePrompt, matchmakingFollowup);
      setCard(cards.length ? cards[0] : null);
      setActivePrivatePrompt(nextPrompt?.prompt ?? null);
      setActivePromptChannel(nextPrompt?.channel ?? null);
      setSignalRecords(signals.records ?? []);
      if (cards.length) {
        feedWarmupRetryCountRef.current = 0;
        clearFeedWarmupRetry();
      } else if (feedWarmupRetryCountRef.current < 3) {
        feedWarmupRetryCountRef.current += 1;
        clearFeedWarmupRetry();
        feedWarmupRetryTimeoutRef.current = setTimeout(() => {
          void loadCard();
        }, 900);
      } else {
        setMessage('Nothing new right now. Check back later.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, [account, clearFeedWarmupRetry, token]);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  const handleReaction = useCallback(
    async (reaction: 'LIKE' | 'DISLIKE' | 'SKIP') => {
      if (!account || !token || !card) return;
      setLoading(true);
      try {
        await postPublicPromptReaction(account.id, token, card.answerId, { reaction });
        await loadCard();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to react');
        setLoading(false);
      }
    },
    [account, card, loadCard, token]
  );

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
    setFacecardPhotosByAccountId({});
    resetFacecardsOverlay();
  }, [account?.id, resetFacecardsOverlay]);

  const openFacecardsOverlay = useCallback(async () => {
    if (!account || !token) return;
    setMessage(null);
    let deck = sanitizeFacecardDeck(facecards);
    if (!deck.length) {
      setFacecardsLoading(true);
      try {
        deck = sanitizeFacecardDeck(await fetchFacecards(account.id, token, 20));
        setFacecards(deck);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to load facecards');
      } finally {
        setFacecardsLoading(false);
      }
    }
    if (!deck.length) {
      setMessage('No facecards ready right now.');
      return;
    }
    Keyboard.dismiss();
    void hydrateFacecardPhotos(deck);
    setFacecardDeck(deck);
    setFacecardIndex(0);
    setFacecardPhotoIndexByAccountId({});
    setFacecardsOverlayOpen(true);
    requestAnimationFrame(() => {
      facecardsScrollRef.current?.scrollTo({ x: 0, animated: false });
    });
  }, [account, facecards, hydrateFacecardPhotos, sanitizeFacecardDeck, token]);

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
          setFacecards([]);
          resetFacecardsOverlay();
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
        setFacecards([]);
        resetFacecardsOverlay();
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
    [account, facecardDeck, facecardIndex, facecardViewportWidth, resetFacecardsOverlay, token]
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
      if (turn.agentMessage?.trim()) {
        nextMessages.push({ role: 'agent', text: turn.agentMessage.trim() });
      }
      if (turn.needsMoreDetail) {
        setPrivatePromptReadyToSubmit(false);
      } else {
        if (privatePromptPartIndex < privatePromptParts.length - 1) {
          const nextPartIndex = privatePromptPartIndex + 1;
          setPrivatePromptPartIndex(nextPartIndex);
          nextMessages.push({ role: 'agent', text: privatePromptParts[nextPartIndex] });
        } else {
          setPrivatePromptReadyToSubmit(true);
          if (!privatePromptReadyToSubmit) {
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
    setPrivatePromptSubmitting(true);
    try {
      const conversation = toConversationLines(messagesForSubmit);
      if (activePromptChannel === 'matchmaking') {
        await postMatchmakingFollowupAnswer(
          account.id,
          token,
          activePrivatePrompt.assignment.instanceId,
          body,
          conversation
        );
      } else {
        await postPrivatePromptAnswer(
          account.id,
          token,
          activePrivatePrompt.assignment.instanceId,
          body,
          conversation
        );
      }
      await refreshSignals();
      closeOverlay();
      setActivePrivatePrompt(null);
      setActivePromptChannel(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : activePromptChannel === 'matchmaking'
            ? 'Failed to submit matchmaking follow-up'
            : 'Failed to submit private prompt'
      );
    } finally {
      setPrivatePromptSubmitting(false);
    }
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
    refreshSignals,
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
      await refreshSignals();
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
  }, [account, activePrivatePrompt, activePromptChannel, closeOverlay, refreshSignals, token]);

  const summonDebugPrivatePrompt = useCallback(async () => {
    if (!account || !token) return;
    setDebugPromptLoading(true);
    setMessage(null);
    try {
      Keyboard.dismiss();
      const nextPrompt = await postDebugSummonNextPrivatePrompt(account.id, token);
      setOverlayOpen(false);
      setPrivatePromptInput('');
      setActivePrivatePrompt(nextPrompt);
      setActivePromptChannel(nextPrompt ? 'private' : null);
      if (nextPrompt == null) {
        setMessage('No additional private prompt available right now.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to summon private prompt');
    } finally {
      setDebugPromptLoading(false);
    }
  }, [account, token]);

  return (
    <ThemedView style={styles.container}>
      {activePrivatePrompt && (
        <View style={styles.agentRow}>
          <Pressable
            onPress={() => setOverlayOpen(true)}
            style={({ pressed }) => [
              styles.agentButton,
              {
                borderColor: cardBorder,
                backgroundColor: cardBg,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <ThemedText type="defaultSemiBold">{promptBannerTitle}</ThemedText>
            <ThemedText style={[styles.mutedText, { color: muted }]}>
              {promptBannerNote}
            </ThemedText>
          </Pressable>
        </View>
      )}

      <View style={styles.agentRow}>
        <Pressable
          onPress={openFacecardsOverlay}
          disabled={facecardsLoading || privatePromptSubmitting}
          style={({ pressed }) => [
            styles.agentButton,
            {
              borderColor: cardBorder,
              backgroundColor: cardBg,
              opacity: pressed || facecardsLoading || privatePromptSubmitting ? 0.7 : 1,
            },
          ]}
        >
          <ThemedText type="defaultSemiBold">Facecards ready</ThemedText>
          <ThemedText style={[styles.mutedText, { color: muted }]}>
            {facecardsLoading
              ? 'Loading ranked facecards…'
              : facecards.length > 0
                ? `${facecards.length} in your queue`
                : 'Tap to check for today’s facecards'}
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.agentRow}>
        <Pressable
          onPress={summonDebugPrivatePrompt}
          disabled={debugPromptLoading || privatePromptSubmitting}
          style={({ pressed }) => [
            styles.agentButton,
            {
              borderColor: cardBorder,
              backgroundColor: cardBg,
              opacity: pressed || debugPromptLoading || privatePromptSubmitting ? 0.7 : 1,
            },
          ]}
        >
          <ThemedText type="defaultSemiBold">Temp: Summon another private prompt</ThemedText>
          <ThemedText style={[styles.mutedText, { color: muted }]}>
            Testing only
          </ThemedText>
        </Pressable>
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

      {card && (
        <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <ThemedText type="defaultSemiBold">{card.promptText}</ThemedText>
          <ThemedText style={[styles.bodyText, { color: muted }]}>{card.body}</ThemedText>
          <View style={styles.actionsRow}>
            {[
              { label: 'Dislike', value: 'DISLIKE' as const },
              { label: 'Skip', value: 'SKIP' as const },
              { label: 'Like', value: 'LIKE' as const },
            ].map((action) => (
              <Pressable
                key={action.value}
                onPress={() => handleReaction(action.value)}
                disabled={loading}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    borderColor: cardBorder,
                    backgroundColor: action.value === 'LIKE' ? primaryBg : 'transparent',
                    opacity: pressed || loading ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.actionText,
                    { color: action.value === 'LIKE' ? primaryText : muted },
                  ]}
                >
                  {action.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
        <View style={styles.debugHeaderRow}>
          <ThemedText type="defaultSemiBold">Temp: Extracted signals</ThemedText>
          <Pressable onPress={refreshSignals} disabled={signalsLoading}>
            <ThemedText style={[styles.mutedText, { color: muted }]}>
              {signalsLoading ? 'Refreshing…' : 'Refresh'}
            </ThemedText>
          </Pressable>
        </View>
        {signalRecords.length === 0 ? (
          <ThemedText style={[styles.mutedText, { color: muted }]}>No signals yet.</ThemedText>
        ) : (
          <ScrollView style={styles.signalsList} nestedScrollEnabled>
            {signalRecords
              .slice()
              .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
              .map((record, idx) => (
                <ThemedText
                  key={`${record.token}-${record.intent ?? 'none'}-${record.sourceId ?? 'none'}-${idx}`}
                  style={[styles.signalItemText, { color: muted }]}
                >
                  {`${record.token} • ${record.source ?? 'unknown'} • x${record.count ?? 1}`}
                </ThemedText>
              ))}
          </ScrollView>
        )}
      </View>

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
        onRequestClose={closeOverlay}
      >
        <KeyboardAvoidingView
          style={[styles.overlayScreen, { backgroundColor: overlayScreenBg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.overlayDismissLayer} onPress={Keyboard.dismiss} />
          <View style={[styles.overlayCard, { borderColor: cardBorder, backgroundColor: overlayCardBg }]}>
            <View style={styles.overlayHeader}>
              <ThemedText type="subtitle">{promptOverlayTitle}</ThemedText>
              <Pressable onPress={closeOverlay} disabled={privatePromptSubmitting}>
                <ThemedText style={[styles.mutedText, { color: muted }]}>Close</ThemedText>
              </Pressable>
            </View>

            <ThemedText style={[styles.mutedText, { color: muted }]}>
              {promptBannerNote}
            </ThemedText>

            <ThemedText style={[styles.mutedText, { color: muted }]}>
              Part {Math.min(privatePromptPartIndex + 1, Math.max(privatePromptParts.length, 1))} of{' '}
              {Math.max(privatePromptParts.length, 1)}
            </ThemedText>

            <ScrollView
              style={[styles.chatTimeline, { borderColor: cardBorder }]}
              contentContainerStyle={styles.chatTimelineContent}
              keyboardShouldPersistTaps="handled"
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
                styles.textInput,
                { borderColor: cardBorder, color: textColor, backgroundColor: inputBg },
              ]}
            />

            <View style={styles.overlayActions}>
              <Pressable
                disabled={privatePromptSubmitting}
                onPress={skipPrivatePrompt}
                style={({ pressed }) => [
                  styles.actionButton,
                  { borderColor: cardBorder, opacity: pressed || privatePromptSubmitting ? 0.7 : 1 },
                ]}
              >
                <ThemedText style={[styles.actionText, { color: muted }]}>Skip</ThemedText>
              </Pressable>

              <Pressable
                disabled={privatePromptSubmitting}
                onPress={shouldSubmitNow ? submitPrivatePromptAnswer : sendPrivatePromptTurn}
                style={({ pressed }) => [
                  styles.actionButton,
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
    gap: 20,
  },
  agentRow: {
    alignItems: 'flex-start',
  },
  agentButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notice: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  card: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
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
  debugHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  signalsList: {
    maxHeight: 180,
  },
  signalItemText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
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
  },
  overlayCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
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
