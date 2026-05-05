import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  PromptDefinition,
  fetchPublicPromptLibrary,
  fetchMyPublicPromptAnswers,
  postPublicPromptAnswer,
} from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

type Status = 'idle' | 'loading' | 'saving' | 'error';

export default function PromptDetailScreen() {
  const { account, token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ promptId?: string }>();
  const promptId = params.promptId ?? '';

  const [status, setStatus] = useState<Status>('idle');
  const [prompt, setPrompt] = useState<PromptDefinition | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const border = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.2)', dark: 'rgba(255, 255, 255, 0.18)' },
    'icon'
  );
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
  const inputBg = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.03)', dark: 'rgba(255, 255, 255, 0.05)' },
    'background'
  );
  const inputText = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const placeholderColor = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.3)', dark: 'rgba(255, 255, 255, 0.35)' },
    'text'
  );
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  const isBusy = status === 'loading' || status === 'saving';

  const loadData = useCallback(async () => {
    if (!account || !token || !promptId) return;
    setStatus('loading');
    setMessage(null);
    try {
      const [promptLibrary, promptAnswers] = await Promise.all([
        fetchPublicPromptLibrary(),
        fetchMyPublicPromptAnswers(account.id, token),
      ]);
      const found = promptLibrary.find((item) => item.promptId === promptId) ?? null;
      const existing = promptAnswers.find((answer) => answer.promptId === promptId) ?? null;
      setPrompt(found);
      setAnswerText(existing?.body ?? '');
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to load prompt');
    }
  }, [account, token, promptId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const promptTitle = useMemo(() => prompt?.text ?? 'Prompt', [prompt?.text]);

  const handleSave = useCallback(async () => {
    if (!account || !token || !promptId) return;
    const trimmed = answerText.trim();
    if (!trimmed) {
      setStatus('error');
      setMessage('Add an answer before saving.');
      return;
    }
    setStatus('idle');
    setMessage(null);
    postPublicPromptAnswer(account.id, token, promptId, { body: trimmed }).catch(() => {});
    router.back();
  }, [account, token, promptId, answerText, router]);

  if (!prompt && status === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centerRow}>
          <ActivityIndicator />
          <ThemedText>Loading prompt…</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {message && (
          <View style={[styles.notice, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText style={[styles.noticeText, { color: muted }]}>{message}</ThemedText>
          </View>
        )}

        {!prompt ? (
          <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText style={[styles.mutedText, { color: muted }]}>Prompt not found.</ThemedText>
          </View>
        ) : (
          <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText type="defaultSemiBold">{prompt.text}</ThemedText>
            <TextInput
              value={answerText}
              onChangeText={setAnswerText}
              placeholder="Write your answer here..."
              placeholderTextColor={placeholderColor}
              style={[styles.input, { borderColor: border, backgroundColor: inputBg, color: inputText }]}
              multiline
            />
            <Pressable
              onPress={handleSave}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: primaryBg,
                  opacity: isBusy ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <ThemedText style={[styles.primaryButtonText, { color: primaryText }]}>Save</ThemedText>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
  },
  scroll: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  centerRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 20,
  },
  notice: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  noticeText: {
    fontSize: 13,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontWeight: '600',
  },
  mutedText: {
    fontSize: 12,
  },
});
