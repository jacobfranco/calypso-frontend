import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  ActivePrivatePrompt,
  fetchActivePrivatePrompt,
  fetchSignals,
  fetchPublicPromptFeed,
  postDebugSummonNextPrivatePrompt,
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

const PRIVATE_PROMPT_PRIVACY_NOTE =
  'Your answers stay private and are only used for matchmaking.';

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
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<PublicPromptFeedCard | null>(null);
  const [activePrivatePrompt, setActivePrivatePrompt] = useState<ActivePrivatePrompt | null>(null);
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

  const loadCard = useCallback(async () => {
    if (!account || !token) return;
    setLoading(true);
    setMessage(null);
    try {
      const [cards, privatePrompt, signals] = await Promise.all([
        fetchPublicPromptFeed(account.id, token, 1),
        fetchActivePrivatePrompt(account.id, token),
        fetchSignals(account.id, token),
      ]);
      setCard(cards.length ? cards[0] : null);
      setActivePrivatePrompt(privatePrompt);
      setSignalRecords(signals.records ?? []);
      if (!cards.length) {
        setMessage('Nothing new right now. Check back later.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, [account, token]);

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
      const turn = await postPrivatePromptChatTurn(
        account.id,
        token,
        activePrivatePrompt.assignment.instanceId,
        {
          questionPart: currentPart,
          userMessage,
          conversation: toConversationLines(messagesWithUserTurn),
        }
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
      setMessage(error instanceof Error ? error.message : 'Failed to continue private prompt chat');
    } finally {
      setPrivatePromptSubmitting(false);
    }
  }, [
    account,
    activePrivatePrompt,
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
      await postPrivatePromptAnswer(
        account.id,
        token,
        activePrivatePrompt.assignment.instanceId,
        body,
        toConversationLines(messagesForSubmit)
      );
      await refreshSignals();
      closeOverlay();
      setActivePrivatePrompt(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to submit private prompt');
    } finally {
      setPrivatePromptSubmitting(false);
    }
  }, [
    account,
    activePrivatePrompt,
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
      await postPrivatePromptSkip(account.id, token, activePrivatePrompt.assignment.instanceId);
      await refreshSignals();
      closeOverlay();
      setPrivatePromptInput('');
      setActivePrivatePrompt(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to skip private prompt');
    } finally {
      setPrivatePromptSubmitting(false);
    }
  }, [account, activePrivatePrompt, closeOverlay, refreshSignals, token]);

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
            <ThemedText type="defaultSemiBold">Private agent question ready</ThemedText>
            <ThemedText style={[styles.mutedText, { color: muted }]}>
              Private answers, matchmaking only
            </ThemedText>
          </Pressable>
        </View>
      )}

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
              <ThemedText type="subtitle">Private prompt</ThemedText>
              <Pressable onPress={closeOverlay} disabled={privatePromptSubmitting}>
                <ThemedText style={[styles.mutedText, { color: muted }]}>Close</ThemedText>
              </Pressable>
            </View>

            <ThemedText style={[styles.mutedText, { color: muted }]}>
              {PRIVATE_PROMPT_PRIVACY_NOTE}
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
  overlayActions: {
    flexDirection: 'row',
    gap: 8,
  },
});
