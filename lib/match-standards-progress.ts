import AsyncStorage from '@react-native-async-storage/async-storage';

const MATCH_STANDARD_ANSWERED_STORAGE_PREFIX = 'calypso.matchStandards.answered.v1:';

function storageKey(accountId: string | number): string {
  return `${MATCH_STANDARD_ANSWERED_STORAGE_PREFIX}${String(accountId)}`;
}

function normalizeQuestionIds(questionIds: string[]): string[] {
  const out: string[] = [];
  questionIds.forEach((questionId) => {
    const trimmed = questionId.trim();
    if (trimmed && !out.includes(trimmed)) {
      out.push(trimmed);
    }
  });
  return out;
}

export async function getLocallyAnsweredMatchStandardQuestionIds(
  accountId: string | number
): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(accountId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? normalizeQuestionIds(parsed.filter((value): value is string => typeof value === 'string'))
      : [];
  } catch {
    return [];
  }
}

export async function markMatchStandardQuestionsAnswered(
  accountId: string | number,
  questionIds: string[]
): Promise<void> {
  const nextIds = normalizeQuestionIds(questionIds);
  if (!nextIds.length) return;
  const existing = await getLocallyAnsweredMatchStandardQuestionIds(accountId);
  const merged = normalizeQuestionIds([...existing, ...nextIds]);
  await AsyncStorage.setItem(storageKey(accountId), JSON.stringify(merged));
}
