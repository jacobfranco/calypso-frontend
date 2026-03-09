import React, { useCallback, useEffect, useState } from 'react';
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
  postPrivatePromptAnswer,
  postPrivatePromptSkip,
  postPublicPromptReaction,
  PublicPromptFeedCard,
  SignalRecord,
} from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function HomeScreen() {
  const { account, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<PublicPromptFeedCard | null>(null);
  const [activePrivatePrompt, setActivePrivatePrompt] = useState<ActivePrivatePrompt | null>(null);
  const [privatePromptInput, setPrivatePromptInput] = useState('');
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

  const submitPrivatePromptAnswer = useCallback(async () => {
    if (!account || !token || !activePrivatePrompt) return;
    Keyboard.dismiss();
    const body = privatePromptInput.trim();
    if (!body) {
      setMessage('Write an answer before submitting.');
      return;
    }
    setPrivatePromptSubmitting(true);
    try {
      await postPrivatePromptAnswer(
        account.id,
        token,
        activePrivatePrompt.assignment.instanceId,
        body
      );
      await refreshSignals();
      closeOverlay();
      setPrivatePromptInput('');
      setActivePrivatePrompt(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to submit private prompt');
    } finally {
      setPrivatePromptSubmitting(false);
    }
  }, [account, activePrivatePrompt, closeOverlay, privatePromptInput, refreshSignals, token]);

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
            <ThemedText type="defaultSemiBold">Agent prompt ready</ThemedText>
            <ThemedText style={[styles.mutedText, { color: muted }]}>Private and not shared</ThemedText>
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
            <ThemedText style={[styles.bodyText, { color: muted }]}>
              {activePrivatePrompt?.prompt.text}
            </ThemedText>

            <TextInput
              multiline
              value={privatePromptInput}
              onChangeText={setPrivatePromptInput}
              placeholder="Write your answer..."
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
                onPress={submitPrivatePromptAnswer}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    borderColor: primaryBg,
                    backgroundColor: primaryBg,
                    opacity: pressed || privatePromptSubmitting ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText style={[styles.actionText, { color: primaryText }]}>Answer</ThemedText>
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
  textInput: {
    minHeight: 110,
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
