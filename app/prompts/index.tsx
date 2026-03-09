import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  PromptDefinition,
  fetchPublicPromptLibrary,
  fetchMyPublicPromptAnswers,
  fetchPublicPromptSelection,
} from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

type Status = 'idle' | 'loading' | 'error';

type PromptRowProps = {
  prompt: PromptDefinition;
  answer?: string;
  cardBorder: string;
  cardBg: string;
  muted: string;
};

function PromptRow({ prompt, answer, cardBorder, cardBg, muted }: PromptRowProps) {
  return (
    <Link
      href={{
        pathname: '/prompts/[promptId]',
        params: { promptId: prompt.promptId },
      }}
      asChild
    >
      <Pressable style={({ pressed }) => [styles.rowPressable, pressed && styles.rowPressed]}>
        <View style={[styles.rowCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <View style={styles.rowHeader}>
            <ThemedText type="defaultSemiBold">{prompt.text}</ThemedText>
            <ThemedText style={[styles.rowChevron, { color: muted }]}>›</ThemedText>
          </View>
          {answer ? (
            <ThemedText style={[styles.answerText, { color: muted }]} numberOfLines={2}>
              {answer}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

export default function PromptsScreen() {
  const { account, token } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [library, setLibrary] = useState<PromptDefinition[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState<string>('all');

  const border = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.08)', dark: 'rgba(255, 255, 255, 0.12)' },
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
  const filterBg = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.04)', dark: 'rgba(255, 255, 255, 0.06)' },
    'background'
  );
  const filterText = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const selectedFilterText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  const loadData = useCallback(async () => {
    if (!account || !token) return;
    setStatus('loading');
    setMessage(null);
    try {
      const [promptLibrary, promptAnswers, promptSelection] = await Promise.all([
        fetchPublicPromptLibrary(),
        fetchMyPublicPromptAnswers(account.id, token),
        fetchPublicPromptSelection(account.id, token),
      ]);
      const answerMap: Record<string, string> = {};
      promptAnswers.forEach((answer) => {
        if (answer.promptId) {
          answerMap[answer.promptId] = answer.body;
        }
      });
      const selectionIds = Array.isArray(promptSelection?.selectedPromptIds)
        ? promptSelection.selectedPromptIds
        : [];
      setAnswers(answerMap);
      const filtered = promptLibrary.filter((item) => item.bank === 'PUBLIC');
      if (selectionIds.length) {
        const selected = filtered.filter((item) => selectionIds.includes(item.promptId));
        const rest = filtered.filter((item) => !selectionIds.includes(item.promptId));
        setLibrary([...selected, ...rest]);
      } else {
        setLibrary(filtered);
      }
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to load prompts');
    }
  }, [account, token]);

  useEffect(() => {
    if (!account || !token) return;
    loadData();
  }, [account, token, loadData]);

  useFocusEffect(
    useCallback(() => {
      if (!account || !token) return () => {};
      loadData();
      return () => {};
    }, [account, token, loadData])
  );

  const topics = useMemo(() => {
    const set = new Set<string>();
    library.forEach((prompt) => {
      if (prompt.topic) set.add(prompt.topic);
    });
    return ['all', ...Array.from(set).sort()];
  }, [library]);

  const answeredPrompts = useMemo(
    () => library.filter((prompt) => answers[prompt.promptId]),
    [answers, library]
  );

  const availablePrompts = useMemo(
    () => library.filter((prompt) => !answers[prompt.promptId]),
    [answers, library]
  );

  const filteredAvailable = useMemo(() => {
    if (availablePrompts.length === 0) return [];
    if (topicFilter === 'all') return availablePrompts;
    return availablePrompts.filter((prompt) => prompt.topic === topicFilter);
  }, [availablePrompts, topicFilter]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText type="subtitle">
            Prompts are shown to other users, but anonymized.
          </ThemedText>
        </View>

        {status === 'loading' && (
          <View style={styles.stateRow}>
            <ActivityIndicator />
            <ThemedText>Loading prompts…</ThemedText>
          </View>
        )}

        {message && (
          <View style={[styles.notice, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText style={[styles.noticeText, { color: muted }]}>{message}</ThemedText>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <ThemedText type="defaultSemiBold">Answered prompts</ThemedText>
          <ThemedText style={[styles.mutedText, { color: muted }]}>
            {answeredPrompts.length}
          </ThemedText>
        </View>

        {answeredPrompts.length === 0 ? (
          <View style={[styles.rowCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText style={[styles.mutedText, { color: muted }]}>No answers yet.</ThemedText>
          </View>
        ) : (
          answeredPrompts.map((prompt) => (
            <PromptRow
              key={prompt.promptId}
              prompt={prompt}
              answer={answers[prompt.promptId]}
              cardBorder={cardBorder}
              cardBg={cardBg}
              muted={muted}
            />
          ))
        )}

        <View style={styles.sectionHeader}>
          <ThemedText type="defaultSemiBold">Available prompts</ThemedText>
          <ThemedText style={[styles.mutedText, { color: muted }]}>
            {availablePrompts.length}
          </ThemedText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {topics.map((topic) => {
            const selected = topic === topicFilter;
            return (
              <Pressable
                key={topic}
                onPress={() => setTopicFilter(topic)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: selected ? filterText : filterBg,
                    borderColor: selected ? filterText : border,
                  },
                ]}
              >
                <ThemedText
                  style={[styles.filterText, { color: selected ? selectedFilterText : filterText }]}
                >
                  {topic === 'all' ? 'All' : topic}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredAvailable.length === 0 ? (
          <View style={[styles.rowCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText style={[styles.mutedText, { color: muted }]}>No prompts here.</ThemedText>
          </View>
        ) : (
          filteredAvailable.map((prompt) => (
            <PromptRow
              key={prompt.promptId}
              prompt={prompt}
              cardBorder={cardBorder}
              cardBg={cardBg}
              muted={muted}
            />
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 24,
  },
  scroll: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  header: {
    gap: 6,
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
  noticeText: {
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowPressable: {
    borderRadius: 16,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  answerText: {
    fontSize: 13,
  },
  rowChevron: {
    fontSize: 18,
    lineHeight: 18,
  },
  mutedText: {
    fontSize: 13,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 4,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
});
