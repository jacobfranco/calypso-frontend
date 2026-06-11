import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';

import { flattenStyle } from '@/components/style-utils';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  MatchStandardAnswer,
  MatchStandardAnswerPayload,
  MatchStandardQuestion,
  Importance,
  fetchMatchStandardAnswers,
  fetchMatchStandardQuestions,
  postMatchStandardAnswer,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { markMatchStandardQuestionsAnswered } from '@/lib/match-standards-progress';

const MATCH_STANDARD_IMPORTANCE_OPTIONS: { label: string; value: Importance }[] = [
  { label: 'Not important', value: 'NOT_IMPORTANT' },
  { label: 'Nice to have', value: 'PREFERENCE' },
  { label: 'Important', value: 'DEALBREAKER' },
];
const RELIGION_MATCH_STANDARD_QUESTION_ID = 'standard.religion.identity';
const KIDS_MATCH_STANDARD_QUESTION_ID = 'standard.kids.future';

function emptyMatchStandardAnswer(): MatchStandardAnswerPayload {
  return {
    ownAnswerOptionIds: [],
    acceptableAnswerOptionIds: [],
    importance: 'PREFERENCE',
  };
}

function matchStandardAnswerFromStored(answer: MatchStandardAnswer): MatchStandardAnswerPayload {
  return {
    ownAnswerOptionIds: answer.ownAnswerOptionIds ?? [],
    acceptableAnswerOptionIds: answer.acceptableAnswerOptionIds ?? [],
    importance: answer.importance ?? 'PREFERENCE',
  };
}

function formatMatchStandardCategory(category: string): string {
  return category
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function isMatchStandardAnswerComplete(payload: MatchStandardAnswerPayload | null | undefined): boolean {
  if (!payload) return false;
  if (!payload.ownAnswerOptionIds.length) return false;
  if (payload.importance !== 'NOT_IMPORTANT' && !payload.acceptableAnswerOptionIds.length) {
    return false;
  }
  return true;
}

function optionText(question: MatchStandardQuestion, optionId: string): string {
  return question.options.find((option) => option.optionId === optionId)?.text ?? optionId;
}

function toggleOption(values: string[], optionId: string): string[] {
  if (values.includes(optionId)) {
    return values.filter((value) => value !== optionId);
  }
  return [...values, optionId];
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

export default function MatchStandardAnswersScreen() {
  const router = useRouter();
  const { account, token } = useAuth();
  const [questions, setQuestions] = useState<MatchStandardQuestion[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MatchStandardAnswerPayload>>({});
  const [loading, setLoading] = useState(false);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const borderColor = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.18)' },
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
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  const answeredQuestions = useMemo(
    () => questions.filter((question) => drafts[question.questionId]),
    [drafts, questions]
  );

  const completedCount = useMemo(
    () => Object.values(drafts).filter(isMatchStandardAnswerComplete).length,
    [drafts]
  );

  const loadMatchStandardAnswers = useCallback(async () => {
    if (!account || !token) {
      setQuestions([]);
      setDrafts({});
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const [questionBank, answerSet] = await Promise.all([
        fetchMatchStandardQuestions(),
        fetchMatchStandardAnswers(account.id, token),
      ]);
      const nextDrafts: Record<string, MatchStandardAnswerPayload> = {};
      (answerSet.answers ?? []).forEach((answer) => {
        nextDrafts[answer.questionId] = matchStandardAnswerFromStored(answer);
      });
      setQuestions(questionBank);
      setDrafts(nextDrafts);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load standards');
    } finally {
      setLoading(false);
    }
  }, [account, token]);

  useEffect(() => {
    void loadMatchStandardAnswers();
  }, [loadMatchStandardAnswers]);

  const updateOwnAnswer = useCallback((question: MatchStandardQuestion, optionId: string) => {
    setDrafts((prev) => {
      const existing = prev[question.questionId] ?? emptyMatchStandardAnswer();
      const nextOwn = nextOwnAnswerSelection(
        question.questionId,
        question.answerType === 'SINGLE_CHOICE',
        existing.ownAnswerOptionIds,
        optionId
      );
      const selfMatchOnly = question.questionId === RELIGION_MATCH_STANDARD_QUESTION_ID;
      return {
        ...prev,
        [question.questionId]: {
          ...existing,
          ownAnswerOptionIds: nextOwn,
          acceptableAnswerOptionIds: selfMatchOnly && existing.importance !== 'NOT_IMPORTANT'
            ? nextOwn
            : existing.acceptableAnswerOptionIds,
        },
      };
    });
  }, []);

  const toggleAcceptableAnswer = useCallback((question: MatchStandardQuestion, optionId: string) => {
    setDrafts((prev) => {
      const existing = prev[question.questionId] ?? emptyMatchStandardAnswer();
      return {
        ...prev,
        [question.questionId]: {
          ...existing,
          acceptableAnswerOptionIds: toggleOption(existing.acceptableAnswerOptionIds, optionId),
        },
      };
    });
  }, []);

  const setImportance = useCallback((question: MatchStandardQuestion, importance: Importance) => {
    setDrafts((prev) => {
      const existing = prev[question.questionId] ?? emptyMatchStandardAnswer();
      const selfMatchOnly = question.questionId === RELIGION_MATCH_STANDARD_QUESTION_ID;
      return {
        ...prev,
        [question.questionId]: {
          ...existing,
          importance,
          acceptableAnswerOptionIds: selfMatchOnly
            ? importance === 'NOT_IMPORTANT'
              ? []
              : existing.ownAnswerOptionIds
            : existing.acceptableAnswerOptionIds,
        },
      };
    });
  }, []);

  const saveAnswer = useCallback(
    async (question: MatchStandardQuestion) => {
      if (!account || !token) return;
      const payload = drafts[question.questionId];
      if (!isMatchStandardAnswerComplete(payload)) {
        setMessage('Pick your answer and at least one acceptable answer before saving.');
        return;
      }
      setSavingQuestionId(question.questionId);
      setMessage(null);
      try {
        const saved = await postMatchStandardAnswer(account.id, token, question.questionId, payload);
        setDrafts((prev) => ({
          ...prev,
          [question.questionId]: matchStandardAnswerFromStored(saved),
        }));
        await markMatchStandardQuestionsAnswered(account.id, [question.questionId]);
        setMessage('Standard saved.');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to save standard');
      } finally {
        setSavingQuestionId(null);
      }
    },
    [account, drafts, token]
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={flattenStyle<ViewStyle>([styles.backButton, { borderColor }])}
          >
            <ThemedText style={flattenStyle<TextStyle>([styles.backButtonText, { color: muted }])}>Back</ThemedText>
          </Pressable>
          <View style={styles.headerText}>
            <ThemedText type="title">Standards</ThemedText>
            <ThemedText style={flattenStyle<TextStyle>([styles.mutedText, { color: muted }])}>
              {`${completedCount}/${questions.length} answered`}
            </ThemedText>
          </View>
        </View>

        <View style={flattenStyle<ViewStyle>([styles.card, { borderColor: cardBorder, backgroundColor: cardBg }])}>
          <View style={styles.sectionHeader}>
            <ThemedText type="defaultSemiBold">Answered standards</ThemedText>
            <Pressable
              onPress={loadMatchStandardAnswers}
              disabled={loading || savingQuestionId != null}
              style={({ pressed }) =>
                flattenStyle<ViewStyle>([
                  styles.smallButton,
                  { borderColor: cardBorder, opacity: pressed || loading || savingQuestionId != null ? 0.65 : 1 },
                ])
              }
            >
              <ThemedText style={flattenStyle<TextStyle>([styles.smallButtonText, { color: muted }])}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </ThemedText>
            </Pressable>
          </View>

          {message ? (
            <ThemedText style={flattenStyle<TextStyle>([styles.mutedText, { color: muted }])}>{message}</ThemedText>
          ) : null}

          {loading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator />
              <ThemedText>Loading standards...</ThemedText>
            </View>
          ) : answeredQuestions.length === 0 ? (
            <ThemedText style={flattenStyle<TextStyle>([styles.mutedText, { color: muted }])}>
              No standards answered yet. New standards are still set from the feed.
            </ThemedText>
          ) : (
            answeredQuestions.map((question) => {
              const draft = drafts[question.questionId] ?? emptyMatchStandardAnswer();
              const isSaving = savingQuestionId === question.questionId;
              const isComplete = isMatchStandardAnswerComplete(draft);
              const selfMatchOnly = question.questionId === RELIGION_MATCH_STANDARD_QUESTION_ID;
              return (
                <View
                  key={question.questionId}
                  style={flattenStyle<ViewStyle>([styles.answerCard, { borderColor }])}
                >
                  <ThemedText style={flattenStyle<TextStyle>([styles.metaText, { color: muted }])}>
                    {formatMatchStandardCategory(question.category)}
                  </ThemedText>
                  <ThemedText type="defaultSemiBold">{question.text}</ThemedText>

                  <View style={styles.block}>
                    <ThemedText style={flattenStyle<TextStyle>([styles.label, { color: muted }])}>My answer</ThemedText>
                    <View style={styles.optionRow}>
                      {question.options.map((option) => {
                        const selected = draft.ownAnswerOptionIds.includes(option.optionId);
                        return (
                          <Pressable
                            key={option.optionId}
                            onPress={() => updateOwnAnswer(question, option.optionId)}
                            disabled={isSaving}
                            style={({ pressed }) =>
                              flattenStyle<ViewStyle>([
                                styles.optionChip,
                                {
                                  borderColor: selected ? primaryBg : cardBorder,
                                  backgroundColor: selected ? primaryBg : 'transparent',
                                  opacity: pressed || isSaving ? 0.72 : 1,
                                },
                              ])
                            }
                          >
                            <ThemedText
                              style={flattenStyle<TextStyle>([
                                styles.optionChipText,
                                { color: selected ? primaryText : muted },
                              ])}
                            >
                              {option.text}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {!selfMatchOnly ? (
                    <View style={styles.block}>
                      <ThemedText style={flattenStyle<TextStyle>([styles.label, { color: muted }])}>
                        Partner answers that work for me
                      </ThemedText>
                      <View style={styles.optionRow}>
                        {question.options.map((option) => {
                          const selected = draft.acceptableAnswerOptionIds.includes(option.optionId);
                          return (
                            <Pressable
                              key={`acceptable-${option.optionId}`}
                              onPress={() => toggleAcceptableAnswer(question, option.optionId)}
                              disabled={isSaving}
                              style={({ pressed }) =>
                                flattenStyle<ViewStyle>([
                                  styles.optionChip,
                                  {
                                    borderColor: selected ? primaryBg : cardBorder,
                                    backgroundColor: selected ? primaryBg : 'transparent',
                                    opacity: pressed || isSaving ? 0.72 : 1,
                                  },
                                ])
                              }
                            >
                              <ThemedText
                                style={flattenStyle<TextStyle>([
                                  styles.optionChipText,
                                  { color: selected ? primaryText : muted },
                                ])}
                              >
                                {option.text}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.block}>
                    <ThemedText style={flattenStyle<TextStyle>([styles.label, { color: muted }])}>
                      {selfMatchOnly ? 'Should my partner share this?' : 'How much this matters'}
                    </ThemedText>
                    <View style={styles.optionRow}>
                      {MATCH_STANDARD_IMPORTANCE_OPTIONS.map((option) => {
                        const selected = draft.importance === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            onPress={() => setImportance(question, option.value)}
                            disabled={isSaving}
                            style={({ pressed }) =>
                              flattenStyle<ViewStyle>([
                                styles.optionChip,
                                {
                                  borderColor: selected ? primaryBg : cardBorder,
                                  backgroundColor: selected ? primaryBg : 'transparent',
                                  opacity: pressed || isSaving ? 0.72 : 1,
                                },
                              ])
                            }
                          >
                            <ThemedText
                              style={flattenStyle<TextStyle>([
                                styles.optionChipText,
                                { color: selected ? primaryText : muted },
                              ])}
                            >
                              {option.label}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <ThemedText style={flattenStyle<TextStyle>([styles.mutedText, { color: muted }])}>
                    {`Mine: ${draft.ownAnswerOptionIds.map((id) => optionText(question, id)).join(', ') || 'n/a'}`}
                  </ThemedText>
                  <ThemedText style={flattenStyle<TextStyle>([styles.mutedText, { color: muted }])}>
                    {`Accept: ${
                      selfMatchOnly
                        ? draft.importance === 'NOT_IMPORTANT'
                          ? 'any'
                          : 'same as mine'
                        : draft.importance === 'NOT_IMPORTANT'
                        ? 'any'
                        : draft.acceptableAnswerOptionIds.map((id) => optionText(question, id)).join(', ') || 'n/a'
                    }`}
                  </ThemedText>
                  {!isComplete ? (
                    <ThemedText style={flattenStyle<TextStyle>([styles.mutedText, { color: muted }])}>
                      Pick your answer and at least one partner answer that works for you.
                    </ThemedText>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => saveAnswer(question)}
                      disabled={isSaving || !isComplete}
                      style={({ pressed }) =>
                        flattenStyle<ViewStyle>([
                          styles.saveButton,
                          {
                            backgroundColor: primaryBg,
                            borderColor: primaryBg,
                            opacity: pressed || isSaving || !isComplete ? 0.55 : 1,
                          },
                        ])
                      }
                    >
                      <ThemedText style={flattenStyle<TextStyle>([styles.saveButtonText, { color: primaryText }])}>
                        {isSaving ? 'Saving...' : 'Save'}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
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
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  smallButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  stateBlock: {
    gap: 12,
    alignItems: 'flex-start',
  },
  mutedText: {
    fontSize: 13,
    lineHeight: 18,
  },
  answerCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  metaText: {
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  block: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
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
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  saveButton: {
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    fontWeight: '600',
  },
});
