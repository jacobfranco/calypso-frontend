import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  AdminAiDecisionEvent,
  AdminAiDecisionsResponse,
  AdminPairDirectionalScore,
  AdminPairScoreResponse,
  AdminPairSnapshot,
  AdminPairTopCandidate,
  AdminRerankEvent,
  AdminRerankEventsResponse,
  fetchAdminAiDecisions,
  fetchAdminLlmTelemetry,
  fetchAdminPairScore,
  fetchAdminRerankEvents,
  fetchAdminSilhouette,
  fetchSignals,
  LlmTelemetryResponse,
  MatchScorerDebug,
  postDebugSummonNextPrivatePrompt,
  SignalRecord,
  SilhouetteConcept,
  SilhouetteEvidence,
  SilhouetteMode,
  SilhouetteResponse,
} from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

function fmtSigned(value: number): string {
  const clamped = clampSigned(value);
  const abs = Math.abs(clamped).toFixed(2);
  return clamped >= 0 ? `+${abs}` : `-${abs}`;
}

function fmtDelta(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return 'n/a';
  const rounded = (value as number).toFixed(2);
  return (value as number) >= 0 ? `+${rounded}` : rounded;
}

function fmtNumber(value: number | null | undefined, digits = 2): string {
  if (!Number.isFinite(value)) return 'n/a';
  return (value as number).toFixed(digits);
}

function fmtCount(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value as number));
}

function fmtAdminTime(value: number | null | undefined): string {
  if (!Number.isFinite(value) || (value as number) <= 0) return 'n/a';
  return new Date(value as number).toLocaleTimeString();
}

function compactAdminValue(value: unknown, maxLength = 260): string {
  if (value == null) return 'n/a';
  if (typeof value === 'string') return compactAdminText(value, maxLength);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const body = value.slice(0, 8).map((item) => compactAdminValue(item, 80)).join(', ');
    return value.length > 8 ? `[${body}, ...]` : `[${body}]`;
  }
  try {
    return compactAdminText(JSON.stringify(value), maxLength);
  } catch {
    return compactAdminText(String(value), maxLength);
  }
}

function compactAggregateRows(rows: { surface?: string; action?: string; count: number }[] | undefined, key: 'surface' | 'action'): string {
  const values = (rows ?? [])
    .slice(0, 5)
    .map((row) => `${row[key] ?? 'unknown'}=${row.count}`)
    .join(' ');
  return values || 'none';
}

function fmtPercent(value: number | null | undefined, digits = 0): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `${((value as number) * 100).toFixed(digits)}%`;
}

function fmtLatency(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `${Math.round(value as number)} ms`;
}

function fmtBool(value: boolean | null | undefined): string {
  if (value == null) return 'n/a';
  return value ? 'Yes' : 'No';
}

function formatDetailLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function topAggregateLabel<T extends { count: number }>(
  rows: T[] | undefined,
  labelFor: (row: T) => string | undefined
): string {
  const top = (rows ?? []).slice().sort((a, b) => b.count - a.count)[0];
  return top ? `${labelFor(top) ?? 'unknown'} (${top.count})` : 'n/a';
}

type AdminDetailRow = {
  label: string;
  value: string;
};

type LlmPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

const LLM_PRICING_BY_MODEL: Record<string, LlmPricing> = {
  'gpt-5.5': { inputPerMillion: 5.0, outputPerMillion: 30.0 },
  'gpt-5.4-mini': { inputPerMillion: 0.75, outputPerMillion: 4.5 },
  'gpt-5.4-nano': { inputPerMillion: 0.2, outputPerMillion: 1.25 },
  'gpt-5.4': { inputPerMillion: 2.5, outputPerMillion: 15.0 },
  'gpt-5-mini': { inputPerMillion: 0.25, outputPerMillion: 2.0 },
  'gpt-5-nano': { inputPerMillion: 0.05, outputPerMillion: 0.4 },
  'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4.1-nano': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gpt-4.1': { inputPerMillion: 2.0, outputPerMillion: 8.0 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'o4-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
};

function DetailRows({
  rows,
  mutedColor,
}: {
  rows: AdminDetailRow[];
  mutedColor: string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.detailGrid}>
      {rows.map((row, idx) => (
        <View key={`${row.label}-${idx}`} style={styles.detailRow}>
          <ThemedText style={[styles.detailLabel, { color: mutedColor }]}>{row.label}</ThemedText>
          <ThemedText style={styles.detailValue}>{row.value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function detailRowsFromRecord(details: Record<string, unknown> | undefined, limit = 24): AdminDetailRow[] {
  return Object.entries(details ?? {})
    .slice(0, limit)
    .map(([key, value]) => ({
      label: formatDetailLabel(key),
      value: compactAdminValue(value, 420),
    }));
}

function aiDecisionPreview(event: AdminAiDecisionEvent): string {
  const details = Object.entries(event.details ?? {})
    .slice(0, 3)
    .map(([key, value]) => `${formatDetailLabel(key)} ${compactAdminValue(value, 56)}`)
    .join(' | ');
  return details || 'No details';
}

function stringsFromAdminValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : compactAdminValue(item, 80)))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function accountTrace(accountId?: number): string {
  return accountId == null ? 'unknown user' : `user ${accountId}`;
}

function targetTrace(targetAccountId?: number): string {
  return targetAccountId == null ? '' : ` -> target ${targetAccountId}`;
}

function adminValue(details: Record<string, unknown> | undefined, key: string): unknown {
  return details == null ? undefined : details[key];
}

function stringAdminValue(details: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = adminValue(details, key);
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function llmPricingForModel(model?: string): LlmPricing | null {
  const normalized = (model ?? '').trim().toLowerCase();
  if (!normalized) return null;
  const exact = LLM_PRICING_BY_MODEL[normalized];
  if (exact) return exact;
  const key = Object.keys(LLM_PRICING_BY_MODEL)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => normalized.startsWith(candidate));
  return key ? LLM_PRICING_BY_MODEL[key] : null;
}

function estimateLlmCostDollars(model: string | undefined, inputTokens: number | undefined, outputTokens: number | undefined): number | null {
  const pricing = llmPricingForModel(model);
  if (!pricing) return null;
  const input = Math.max(0, Number.isFinite(inputTokens) ? (inputTokens as number) : 0);
  const output = Math.max(0, Number.isFinite(outputTokens) ? (outputTokens as number) : 0);
  return (input * pricing.inputPerMillion + output * pricing.outputPerMillion) / 1_000_000;
}

function fmtMoney(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return 'cost n/a';
  const amount = value as number;
  if (amount > 0 && amount < 0.000001) return '<$0.000001';
  if (amount < 0.01) return `$${amount.toFixed(6)}`;
  return `$${amount.toFixed(4)}`;
}

function llmEventCost(event: LlmTelemetryResponse['events'][number]): number | null {
  return estimateLlmCostDollars(event.model, event.inputTokens, event.outputTokens);
}

function llmEventNarrative(event: LlmTelemetryResponse['events'][number]): string {
  const cost = llmEventCost(event);
  const operation = event.operation || event.stage;
  const subject = `${accountTrace(event.accountId)}${targetTrace(event.targetAccountId)}`;
  const source = [event.promptId ? `prompt ${event.promptId}` : null, event.sourceId ? `source ${event.sourceId}` : null]
    .filter(Boolean)
    .join(', ');
  const context = source ? ` for ${source}` : '';
  const candidateContext = event.candidateCount ? ` across ${event.candidateCount} candidates` : '';
  return `${operation}/${event.surface} ran for ${subject}${context}${candidateContext} -> ${fmtMoney(
    cost
  )}, ${fmtCount(event.inputTokens)} in / ${fmtCount(event.outputTokens)} out tokens, ${fmtLatency(
    event.latencyMs
  )}, ${event.success ? 'success' : `failed (${event.error ?? 'unknown error'})`}.`;
}

function expensiveLlmEvents(events: LlmTelemetryResponse['events'] | undefined): LlmTelemetryResponse['events'] {
  return (events ?? [])
    .slice()
    .sort((a, b) => (llmEventCost(b) ?? -1) - (llmEventCost(a) ?? -1));
}

function llmRecentCost(events: LlmTelemetryResponse['events'] | undefined): number {
  return (events ?? []).reduce((sum, event) => sum + (llmEventCost(event) ?? 0), 0);
}

function aiDecisionNarrative(event: AdminAiDecisionEvent): string {
  const details = event.details ?? {};
  const subject = `${accountTrace(event.accountId)}${targetTrace(event.targetAccountId)}`;
  if (event.surface === 'signal_extraction') {
    const tokens = stringsFromAdminValue(details.tokens);
    const negativeTokens = stringsFromAdminValue(details.negativeTokens);
    const promptId = stringAdminValue(details, 'promptId');
    const sourceId = stringAdminValue(details, 'sourceId');
    const source = promptId || sourceId ? ` from ${promptId ? `prompt ${promptId}` : ''}${promptId && sourceId ? ', ' : ''}${sourceId ? `source ${sourceId}` : ''}` : '';
    const output = tokens.length ? tokens.join(', ') : 'none';
    const negative = negativeTokens.length ? ` Negative: ${negativeTokens.join(', ')}.` : '';
    return `${event.action === 'signals_extracted' ? 'Signals extracted' : 'No signals extracted'} for ${subject}${source} -> ${output}.${negative}`;
  }
  if (event.surface === 'rerank') {
    const name = stringAdminValue(details, 'candidateName') ?? stringAdminValue(details, 'candidateId') ?? 'candidate';
    const before = compactAdminValue(adminValue(details, 'scoreBefore'), 40);
    const after = compactAdminValue(adminValue(details, 'scoreAfter'), 40);
    const use = stringAdminValue(details, 'recommendedUse') ?? stringAdminValue(details, 'skipReason') ?? event.action;
    const why = stringsFromAdminValue(adminValue(details, 'whyItWorks')).slice(0, 2).join('; ');
    const reason = why ? ` Why: ${why}.` : '';
    return `Reranker ${event.action} for ${subject} on ${name} -> score ${before} to ${after}, use=${use}.${reason}`;
  }
  if (event.surface === 'matchmaking_followup') {
    const selected = compactAdminValue(adminValue(details, 'selected'), 180);
    const eligible = compactAdminValue(adminValue(details, 'eligibleQuestions'), 40);
    return `Follow-up question budget ran for ${subject} -> ${event.action}; eligible=${eligible}; selected=${selected}.`;
  }
  if (event.surface === 'private_prompt_chat' || event.surface === 'matchmaking_followup_chat') {
    const source = stringAdminValue(details, 'sourceId');
    const strategy = stringAdminValue(details, 'strategy');
    const missing = compactAdminValue(adminValue(details, 'missing'), 180);
    return `Prompt sufficiency checked for ${subject}${source ? ` on ${source}` : ''} -> ${event.action}; strategy=${strategy ?? 'n/a'}; missing=${missing}.`;
  }
  if (event.surface === 'silhouette_patch') {
    const source = stringAdminValue(details, 'sourceId') ?? stringAdminValue(details, 'promptId');
    const dropped = compactAdminValue(adminValue(details, 'droppedOps'), 40);
    const accepted = compactAdminValue(adminValue(details, 'acceptedOps'), 40);
    return `Silhouette patch ${event.action} for ${subject}${source ? ` from ${source}` : ''} -> accepted=${accepted}, dropped=${dropped}.`;
  }
  return `${formatDetailLabel(event.surface)} / ${formatDetailLabel(event.stage)} ${event.action} for ${subject}. ${aiDecisionPreview(event)}.`;
}

const SCORE_WEIGHT_FILTER_FIT = 0.22;
const SCORE_WEIGHT_VIEWER_NEEDS = 0.15;
const SCORE_WEIGHT_TARGET_NEEDS = 0.14;
const SCORE_WEIGHT_SELF_OVERLAP = 0.07;
const SCORE_WEIGHT_MATCH_STANDARD = 0.17;
const SCORE_WEIGHT_VIEWER_REACTION = 0.16;
const SCORE_WEIGHT_TARGET_REACTION = 0.07;
const SCORE_WEIGHT_NOVELTY = 0.02;

type ScoreComponent = {
  label: string;
  value: number | null;
  points: number | null;
  note?: string;
};

function finiteNumber(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? (value as number) : null;
}

function weightedPoints(value: number | null | undefined, weight: number): number | null {
  const finite = finiteNumber(value);
  return finite == null ? null : finite * weight * 100.0;
}

function sumFinite(values: Array<number | null>): number {
  return values.reduce<number>((sum, value) => (value == null ? sum : sum + value), 0);
}

function componentLine(component: ScoreComponent): string {
  const raw = component.value == null ? 'n/a' : fmtNumber(component.value, 3);
  const points = component.points == null ? 'n/a' : fmtDelta(component.points);
  return `${points} pts (${raw})${component.note ? ` ${component.note}` : ''}`;
}

function deterministicScoreComponents(debug: MatchScorerDebug | undefined): ScoreComponent[] {
  if (!debug) return [];
  const viewerNeeds = weightedPoints(debug.viewerNeedsMetByTarget, SCORE_WEIGHT_VIEWER_NEEDS);
  const targetNeeds = weightedPoints(debug.targetNeedsMetByViewer, SCORE_WEIGHT_TARGET_NEEDS);
  const sharedSelf = weightedPoints(debug.sharedSelfOverlap, SCORE_WEIGHT_SELF_OVERLAP);
  const signalPoints = sumFinite([viewerNeeds, targetNeeds, sharedSelf]);
  const signalHasValue = [viewerNeeds, targetNeeds, sharedSelf].some((value) => value != null);
  const reactionViewer = weightedPoints(debug.viewerReactionScore, SCORE_WEIGHT_VIEWER_REACTION);
  const reactionTarget = weightedPoints(debug.targetReactionScore, SCORE_WEIGHT_TARGET_REACTION);
  const reactionPoints = sumFinite([reactionViewer, reactionTarget]);
  const reactionHasValue = [reactionViewer, reactionTarget].some((value) => value != null);
  const resonance = finiteNumber(debug.resonanceDelta);
  return [
    {
      label: 'Filters',
      value: finiteNumber(debug.filterPreferenceFit),
      points: weightedPoints(debug.filterPreferenceFit, SCORE_WEIGHT_FILTER_FIT),
    },
    {
      label: 'Signals',
      value: finiteNumber(debug.signalAlignment),
      points: signalHasValue ? signalPoints : null,
    },
    {
      label: 'Standards',
      value: finiteNumber(debug.matchStandardScore),
      points: weightedPoints(debug.matchStandardScore, SCORE_WEIGHT_MATCH_STANDARD),
      note: `shared ${fmtCount(debug.matchStandardSharedCount)}`,
    },
    {
      label: 'Reactions',
      value: finiteNumber(debug.viewerReactionScore),
      points: reactionHasValue ? reactionPoints : null,
    },
    {
      label: 'Novelty',
      value: finiteNumber(debug.noveltyScore),
      points: weightedPoints(debug.noveltyScore, SCORE_WEIGHT_NOVELTY),
    },
    {
      label: 'Resonance',
      value: finiteNumber(debug.resonanceAlignment),
      points: resonance == null ? null : resonance * 100.0,
    },
  ];
}

function hasTier3Debug(debug: MatchScorerDebug | undefined): boolean {
  return Boolean(debug && (
    Number.isFinite(debug.tier3Compatibility) ||
    Number.isFinite(debug.scoreBeforeTier3) ||
    Number.isFinite(debug.scoreAfterTier3)
  ));
}

function rerankRowsFromDebug(debug: MatchScorerDebug | undefined): AdminDetailRow[] {
  if (!hasTier3Debug(debug)) return [];
  return [
    {
      label: 'Rerank',
      value: `${fmtNumber(debug?.scoreBeforeTier3, 2)} -> ${fmtNumber(debug?.scoreAfterTier3, 2)} (${fmtDelta(
        finiteNumber(debug?.scoreAfterTier3) != null && finiteNumber(debug?.scoreBeforeTier3) != null
          ? (debug?.scoreAfterTier3 as number) - (debug?.scoreBeforeTier3 as number)
          : null
      )})`,
    },
    {
      label: 'Tier 3 fit',
      value: `${fmtNumber(debug?.tier3Compatibility, 3)} compat, ${fmtNumber(debug?.tier3Confidence, 3)} confidence`,
    },
    ...(debug?.tier3RecommendedUse ? [{ label: 'Use', value: debug.tier3RecommendedUse }] : []),
    ...(debug?.tier3Reason ? [{ label: 'Why', value: compactAdminText(debug.tier3Reason, 260) }] : []),
  ];
}

function rerankRowsFromAudit(event: AdminRerankEvent | undefined): AdminDetailRow[] {
  if (!event || event.eventType === 'skipped') return [];
  return [
    {
      label: 'Latest rerank',
      value: `${fmtNumber(event.scoreBefore, 2)} -> ${fmtNumber(event.scoreAfter, 2)} (${fmtDelta(event.netChange)})`,
    },
    {
      label: 'Tier 3 fit',
      value: `${fmtNumber(event.tier3Compatibility, 3)} compat, ${fmtNumber(event.tier3Confidence, 3)} confidence`,
    },
    ...(event.recommendedUse ? [{ label: 'Use', value: event.recommendedUse }] : []),
    ...(event.fitSummaryInternal ? [{ label: 'Why', value: compactAdminText(event.fitSummaryInternal, 260) }] : []),
  ];
}

function ScoreComposition({
  debug,
  currentScore,
  rerankEvent,
  mutedColor,
}: {
  debug?: MatchScorerDebug;
  currentScore?: number;
  rerankEvent?: AdminRerankEvent;
  mutedColor: string;
}) {
  const components = deterministicScoreComponents(debug);
  const deterministicRows: AdminDetailRow[] = components.map((component) => ({
    label: component.label,
    value: componentLine(component),
  }));
  const debugRerankRows = rerankRowsFromDebug(debug);
  const auditRerankRows = debugRerankRows.length ? [] : rerankRowsFromAudit(rerankEvent);
  return (
    <View style={styles.scoreBreakdown}>
      <DetailRows
        mutedColor={mutedColor}
        rows={[
          { label: 'Current score', value: fmtNumber(currentScore, 2) },
          ...deterministicRows,
          ...debugRerankRows,
          ...auditRerankRows,
        ]}
      />
      {!debug ? (
        <ThemedText style={[styles.signalItemText, { color: mutedColor }]}>No scorer debug attached.</ThemedText>
      ) : null}
      {!hasTier3Debug(debug) && rerankEvent ? (
        <ThemedText style={[styles.signalItemText, { color: mutedColor }]}>
          Rerank values are from latest audit, not the current score row.
        </ThemedText>
      ) : null}
    </View>
  );
}

function CandidateScoreCard({
  candidate,
  rerankEvent,
  mutedColor,
}: {
  candidate: AdminPairTopCandidate;
  rerankEvent?: AdminRerankEvent;
  mutedColor: string;
}) {
  const debug = candidate.scorerDebug;
  return (
    <View style={styles.signalItem}>
      <View style={styles.itemHeaderRow}>
        <View style={styles.itemHeaderText}>
          <ThemedText style={styles.signalItemToken}>{candidate.account.name ?? candidate.account.id}</ThemedText>
          <ThemedText style={[styles.signalItemText, { color: mutedColor }]}>{candidate.account.id}</ThemedText>
        </View>
        <ThemedText style={styles.scoreBadge}>{fmtNumber(candidate.score, 2)}</ThemedText>
      </View>
      <ScoreComposition
        debug={debug}
        currentScore={candidate.score}
        rerankEvent={rerankEvent}
        mutedColor={mutedColor}
      />
    </View>
  );
}

function DirectionalScoreCard({
  title,
  score,
  rerankEvent,
  mutedColor,
}: {
  title: string;
  score: AdminPairDirectionalScore;
  rerankEvent?: AdminRerankEvent;
  mutedColor: string;
}) {
  return (
    <View style={styles.signalItem}>
      <View style={styles.itemHeaderRow}>
        <View style={styles.itemHeaderText}>
          <ThemedText style={styles.signalItemToken}>{title}</ThemedText>
          <ThemedText style={[styles.signalItemText, { color: mutedColor }]}>
            {score.account ? `${score.account.name ?? score.account.id} (${score.account.id})` : 'No score found'}
          </ThemedText>
        </View>
        <ThemedText style={styles.scoreBadge}>{fmtNumber(score.score, 2)}</ThemedText>
      </View>
      <ScoreComposition
        debug={score.scorerDebug}
        currentScore={score.score}
        rerankEvent={rerankEvent}
        mutedColor={mutedColor}
      />
    </View>
  );
}

function PairPipelineCard({
  pair,
  mutedColor,
}: {
  pair: AdminPairSnapshot;
  mutedColor: string;
}) {
  const staging = pair.staging;
  if (!staging) return null;
  return (
    <View style={styles.signalItem}>
      <ThemedText style={styles.signalItemToken}>Match pipeline</ThemedText>
      <DetailRows
        mutedColor={mutedColor}
        rows={[
          { label: 'Status', value: staging.status ?? 'n/a' },
          { label: 'Visible', value: fmtBool(staging.visibleMatch) },
          { label: 'Effective score', value: fmtNumber(staging.effectiveScore, 2) },
          { label: 'Score at rerank', value: fmtNumber(staging.scoreAtRerank, 2) },
          { label: 'Rerank fit', value: `${fmtNumber(staging.rerankCompatibility, 3)} / ${fmtNumber(staging.rerankConfidence, 3)}` },
          { label: 'Entered', value: fmtAdminTime(staging.enteredAt) },
          { label: 'Updated', value: fmtAdminTime(staging.updatedAt) },
          ...(staging.rerankReason
            ? [{ label: 'Rerank reason', value: compactAdminText(staging.rerankReason, 360) }]
            : []),
        ]}
      />
    </View>
  );
}

function PairSnapshotCard({
  pair,
  rerankEvent,
  mutedColor,
}: {
  pair: AdminPairSnapshot;
  rerankEvent?: AdminRerankEvent;
  mutedColor: string;
}) {
  return (
    <View style={styles.signalItem}>
      <View style={styles.itemHeaderRow}>
        <View style={styles.itemHeaderText}>
          <ThemedText style={styles.signalItemToken}>{`Pair target ${pair.targetAccountId}`}</ThemedText>
          <ThemedText style={[styles.signalItemText, { color: mutedColor }]}>
            {`viewer=${pair.viewerMode} target=${pair.targetMode} source=${pair.scoreSource ?? 'n/a'}`}
          </ThemedText>
        </View>
      </View>
      <DetailRows
        mutedColor={mutedColor}
        rows={[
          { label: 'Mutual score', value: fmtNumber(pair.mutualMinScore, 2) },
          { label: 'Match / auto', value: `${fmtBool(pair.bothMeetMatchThreshold)} / ${fmtBool(pair.bothMeetAutoPassThreshold)}` },
          { label: 'Facecard likes', value: `${fmtBool(pair.viewerLikedTargetFacecard)} / ${fmtBool(pair.targetLikedViewerFacecard)}` },
          { label: 'Prompt likes', value: `${fmtBool(pair.viewerPromptLikeSeen)} / ${fmtBool(pair.targetPromptLikeSeen)}` },
        ]}
      />
      <DirectionalScoreCard
        title="Viewer -> target"
        score={pair.viewerToTarget}
        rerankEvent={rerankEvent}
        mutedColor={mutedColor}
      />
      <DirectionalScoreCard
        title="Target -> viewer"
        score={pair.targetToViewer}
        mutedColor={mutedColor}
      />
      <PairPipelineCard pair={pair} mutedColor={mutedColor} />
    </View>
  );
}

type SignalIntentGroup = 'seeking' | 'self' | 'both' | 'meta' | 'other';

const SIGNAL_GROUP_ORDER: { key: SignalIntentGroup; label: string }[] = [
  { key: 'seeking', label: 'Seeking' },
  { key: 'self', label: 'Self' },
  { key: 'both', label: 'Both' },
  { key: 'meta', label: 'Meta' },
  { key: 'other', label: 'Other' },
];

type AdminSectionId =
  | 'signals'
  | 'silhouette'
  | 'llmTelemetry'
  | 'aiDecisions'
  | 'signalConcepts'
  | 'pairScore'
  | 'rerankAudit';

const DEFAULT_EXPANDED_ADMIN_SECTIONS: Record<AdminSectionId, boolean> = {
  signals: false,
  silhouette: false,
  llmTelemetry: false,
  aiDecisions: false,
  signalConcepts: false,
  pairScore: false,
  rerankAudit: false,
};

function signalIntentGroup(intent?: string): SignalIntentGroup {
  const normalized = intent?.trim().toLowerCase();
  if (normalized === 'seeking') return 'seeking';
  if (normalized === 'self') return 'self';
  if (normalized === 'both') return 'both';
  if (normalized === 'meta') return 'meta';
  return 'other';
}

function compactAdminText(value: string, maxLength = 180): string {
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function normalizeAdminKey(value?: string): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizedEvidenceSource(source?: string): string {
  return (source ?? 'fallback').trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function normalizeEvidenceText(value?: string): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function evidenceAlreadyCovered(value: string, linkedText: string): boolean {
  const normalized = normalizeEvidenceText(value);
  if (!normalized || !linkedText) return false;
  if (normalized.length < 3) return false;
  if (linkedText.includes(normalized)) return true;
  const tokens = normalized
    .split(' ')
    .filter((token) => token.length > 2 && !['and', 'the', 'of', 'with', 'for'].includes(token));
  if (tokens.length === 0 || tokens.length > 10) return false;
  const covered = tokens.filter((token) => linkedText.includes(token)).length;
  return covered / tokens.length >= 0.75;
}

function isLikelyFormativeReferenceSeed(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  if (/\b(made|makes|felt|feel|feels|wanted|want|wants|showed|opened|sparked|gave|left|drew|taught|revealed|indicates?)\b/.test(normalized)) {
    return false;
  }
  const meaningful = normalized
    .split(' ')
    .filter((word) => word && word !== 'and' && word !== 'the' && word !== 'of').length;
  return meaningful <= 4 && value.length <= 56;
}

function evidenceValueFromSummary(value: string): { source: string; text: string } {
  const idx = value.indexOf(':');
  if (idx <= 0) {
    return { source: 'evidence', text: value.trim() };
  }
  return {
    source: normalizedEvidenceSource(value.slice(0, idx)),
    text: value.slice(idx + 1).trim(),
  };
}

function evidenceSourceAndValue(evidence: SilhouetteEvidence): { source: string; text: string } {
  return {
    source: normalizedEvidenceSource(evidence.source),
    text: evidence.value.trim(),
  };
}

type ModeConceptSection = {
  key: string;
  group: string;
  concept: SilhouetteConcept;
  evidence: SilhouetteEvidence[];
};

function conceptSections(mode: SilhouetteMode): ModeConceptSection[] {
  const evidence = mode.evidence ?? [];
  const groups: { group: string; concepts?: SilhouetteConcept[] }[] = [
    { group: 'self', concepts: mode.selfExpression },
    { group: 'seeking', concepts: mode.seekingExpression },
    { group: 'spark', concepts: mode.sparkTriggers },
    { group: 'comps', concepts: mode.realWorldComps },
    { group: 'sustain', concepts: mode.sustainabilityNeeds },
    { group: 'aesthetic', concepts: mode.aestheticField },
  ];

  return groups.flatMap(({ group, concepts }) =>
    (concepts ?? []).slice(0, 10).map((concept, idx) => {
      const conceptId = normalizeAdminKey(concept.id || concept.label);
      const evidenceIds = new Set((concept.evidenceIds ?? []).map(normalizeAdminKey).filter(Boolean));
      const linked = evidence
        .filter((item) => {
          const itemId = normalizeAdminKey(item.id);
          const derived = new Set((item.derivedConceptIds ?? []).map(normalizeAdminKey).filter(Boolean));
          return (
            (itemId && evidenceIds.has(itemId)) ||
            (conceptId && derived.has(conceptId))
          );
        })
        .sort((a, b) => {
          const aScore = (a.strength ?? 0) * (a.confidence ?? 0) * (a.sourceWeight ?? 0);
          const bScore = (b.strength ?? 0) * (b.confidence ?? 0) * (b.sourceWeight ?? 0);
          if (bScore !== aScore) return bScore - aScore;
          return (b.createdAt ?? 0) - (a.createdAt ?? 0);
        })
        .slice(0, 4);
      return {
        key: `${group}-${conceptId || concept.label}-${idx}`,
        group,
        concept,
        evidence: linked,
      };
    })
  );
}

function linkedEvidenceIds(sections: ModeConceptSection[]): Set<string> {
  const out = new Set<string>();
  sections.forEach((section) => {
    section.evidence.forEach((evidence) => {
      const id = normalizeAdminKey(evidence.id);
      if (id) out.add(id);
    });
  });
  return out;
}

function conceptEvidenceLine(evidence: SilhouetteEvidence): string {
  const source = normalizedEvidenceSource(evidence.source);
  const prefix = source === 'formative_imprint' ? 'example' : source;
  return `${prefix}: ${compactAdminText(evidence.value)}`;
}

function unlinkedModeEvidenceLines(mode: SilhouetteMode, usedEvidenceIds: Set<string>): string[] {
  const seeds: string[] = [];
  const evidence: string[] = [];
  const linkedText = normalizeEvidenceText(
    (mode.evidence ?? [])
      .filter((item) => usedEvidenceIds.has(normalizeAdminKey(item.id)))
      .map((item) => item.value)
      .join(' ')
  );
  const rawEvidence = (mode.evidence ?? []).filter((item) => !usedEvidenceIds.has(normalizeAdminKey(item.id)));
  const rows = rawEvidence.length
    ? rawEvidence.map(evidenceSourceAndValue)
    : (mode.evidenceSummary ?? []).map(evidenceValueFromSummary);

  rows.forEach(({ source, text }) => {
    const value = compactAdminText(text);
    if (!value) return;
    if (evidenceAlreadyCovered(value, linkedText)) return;
    if (source === 'formative_imprint') {
      if (isLikelyFormativeReferenceSeed(value)) {
        if (seeds.length < 5 && !seeds.includes(value)) seeds.push(value);
      }
    } else if (evidence.length < 6) {
      evidence.push(`${source}: ${value}`);
    }
  });

  const out: string[] = [];
  if (seeds.length) {
    out.push(`unassigned examples: ${seeds.join(', ')}`);
  }
  evidence.forEach((value) => out.push(`evidence: ${value}`));
  return out.slice(0, 8);
}

function AdminSection({
  title,
  summary,
  expanded,
  onToggle,
  headerAction,
  borderColor,
  backgroundColor,
  mutedColor,
  children,
}: {
  title: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  headerAction?: React.ReactNode;
  borderColor: string;
  backgroundColor: string;
  mutedColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.card, { borderColor, backgroundColor }]}>
      <View style={styles.collapsibleHeader}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={({ pressed }) => [
            styles.collapsibleToggle,
            { opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <View style={styles.collapsibleTitleBlock}>
            <ThemedText type="defaultSemiBold">{title}</ThemedText>
            {summary ? (
              <ThemedText numberOfLines={2} style={[styles.mutedText, { color: mutedColor }]}>
                {summary}
              </ThemedText>
            ) : null}
          </View>
          <View style={[styles.expandPill, { borderColor }]}>
            <MaterialIcons
              name={expanded ? 'expand-less' : 'expand-more'}
              size={18}
              color={mutedColor}
            />
            <ThemedText style={[styles.expandPillText, { color: mutedColor }]}>
              {expanded ? 'Collapse' : 'Expand'}
            </ThemedText>
          </View>
        </Pressable>
        {headerAction ? <View style={styles.headerAction}>{headerAction}</View> : null}
      </View>
      {expanded ? children : null}
    </View>
  );
}

export default function AdminScreen() {
  const router = useRouter();
  const { account, token } = useAuth();
  const [debugPromptLoading, setDebugPromptLoading] = useState(false);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [silhouetteLoading, setSilhouetteLoading] = useState(false);
  const [llmTelemetryLoading, setLlmTelemetryLoading] = useState(false);
  const [signalRecords, setSignalRecords] = useState<SignalRecord[]>([]);
  const [silhouette, setSilhouette] = useState<SilhouetteResponse | null>(null);
  const [llmTelemetry, setLlmTelemetry] = useState<LlmTelemetryResponse | null>(null);
  const [aiDecisionsLoading, setAiDecisionsLoading] = useState(false);
  const [aiDecisions, setAiDecisions] = useState<AdminAiDecisionsResponse | null>(null);
  const [pairScoreLoading, setPairScoreLoading] = useState(false);
  const [pairScore, setPairScore] = useState<AdminPairScoreResponse | null>(null);
  const [rerankEventsLoading, setRerankEventsLoading] = useState(false);
  const [rerankEvents, setRerankEvents] = useState<AdminRerankEventsResponse | null>(null);
  const [pairTargetInput, setPairTargetInput] = useState('');
  const [pairTargetId, setPairTargetId] = useState<string | null>(null);
  const [pairAutoRefresh, setPairAutoRefresh] = useState(true);
  const [expandedTelemetryRows, setExpandedTelemetryRows] = useState<Record<string, boolean>>({});
  const [expandedAiDecisionRows, setExpandedAiDecisionRows] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<AdminSectionId, boolean>>(
    DEFAULT_EXPANDED_ADMIN_SECTIONS
  );
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
  const inputBg = useThemeColor(
    { light: 'rgba(15, 23, 42, 0.04)', dark: 'rgba(255, 255, 255, 0.05)' },
    'background'
  );

  const sortedSignals = useMemo(
    () => signalRecords.slice().sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0)),
    [signalRecords]
  );
  const groupedSignals = useMemo(() => {
    const groups: Record<SignalIntentGroup, SignalRecord[]> = {
      seeking: [],
      self: [],
      both: [],
      meta: [],
      other: [],
    };
    sortedSignals.forEach((record) => {
      groups[signalIntentGroup(record.intent)].push(record);
    });
    return groups;
  }, [sortedSignals]);

  const signalsSummary = useMemo(() => {
    if (signalsLoading) return 'Loading signals...';
    if (sortedSignals.length === 0) return 'No signals yet.';
    const groups = SIGNAL_GROUP_ORDER
      .map(({ key, label }) => {
        const count = groupedSignals[key].length;
        return count > 0 ? `${label.toLowerCase()}=${count}` : null;
      })
      .filter(Boolean)
      .join(' ');
    return `${sortedSignals.length} total ${groups}`;
  }, [groupedSignals, signalsLoading, sortedSignals.length]);

  const silhouetteSummary = useMemo(() => {
    if (silhouetteLoading) return 'Loading silhouette...';
    if (!silhouette) return 'No silhouette loaded.';
    return `maturity=${silhouette.maturity ?? 'empty'} modes=${(silhouette.modes ?? []).length} version=${
      silhouette.version ?? 1
    }`;
  }, [silhouette, silhouetteLoading]);

  const llmTelemetrySummary = useMemo(() => {
    if (llmTelemetryLoading) return 'Loading telemetry...';
    if (!llmTelemetry) return 'No telemetry loaded.';
    return `calls=${llmTelemetry.totals?.calls ?? 0} fail=${llmTelemetry.totals?.failures ?? 0} tokens=${
      llmTelemetry.totals?.totalTokens ?? 0
    } events=${(llmTelemetry.events ?? []).length}`;
  }, [llmTelemetry, llmTelemetryLoading]);

  const aiDecisionsSummary = useMemo(() => {
    if (aiDecisionsLoading && !aiDecisions) return 'Loading AI decisions...';
    if (!aiDecisions) return 'No AI decisions loaded.';
    return `decisions=${aiDecisions.totals?.decisions ?? 0} events=${(aiDecisions.events ?? []).length} actions: ${compactAggregateRows(
      aiDecisions.byAction,
      'action'
    )}`;
  }, [aiDecisions, aiDecisionsLoading]);

  const pairScoreSummary = useMemo(() => {
    if (pairScoreLoading && !pairScore) return 'Loading pair-score snapshot...';
    const target = pairTargetId ? `target=${pairTargetId}` : 'target=none';
    const candidates = pairScore ? `candidates=${(pairScore.topCandidates ?? []).length}` : 'No snapshot loaded.';
    return `${target} auto-refresh=${pairAutoRefresh ? 'on' : 'off'} ${candidates}`;
  }, [pairAutoRefresh, pairScore, pairScoreLoading, pairTargetId]);

  const rerankSummary = useMemo(() => {
    if (rerankEventsLoading && !rerankEvents) return 'Loading rerank audit...';
    const count = (rerankEvents?.events ?? []).length;
    return count === 0 ? 'No rerank events recorded yet.' : `${count} recent events`;
  }, [rerankEvents, rerankEventsLoading]);

  const latestRerankByCandidateId = useMemo(() => {
    const out: Record<string, AdminRerankEvent> = {};
    (rerankEvents?.events ?? []).forEach((event) => {
      const candidateId = event.candidateId?.trim();
      if (!candidateId) return;
      const existing = out[candidateId];
      if (!existing || (event.createdAt ?? 0) > (existing.createdAt ?? 0)) {
        out[candidateId] = event;
      }
    });
    return out;
  }, [rerankEvents]);

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

  const refreshSilhouette = useCallback(async () => {
    if (!account || !token) return;
    setSilhouetteLoading(true);
    try {
      const next = await fetchAdminSilhouette(account.id, token);
      setSilhouette(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load silhouette');
    } finally {
      setSilhouetteLoading(false);
    }
  }, [account, token]);

  const refreshLlmTelemetry = useCallback(async () => {
    if (!account || !token) return;
    setLlmTelemetryLoading(true);
    try {
      const next = await fetchAdminLlmTelemetry(account.id, token, 120);
      setLlmTelemetry(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load LLM telemetry');
    } finally {
      setLlmTelemetryLoading(false);
    }
  }, [account, token]);

  const refreshAiDecisions = useCallback(async () => {
    if (!account || !token) return;
    setAiDecisionsLoading(true);
    try {
      const next = await fetchAdminAiDecisions(account.id, token, 120);
      setAiDecisions(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load AI decisions');
    } finally {
      setAiDecisionsLoading(false);
    }
  }, [account, token]);

  const refreshPairScore = useCallback(
    async (targetOverride?: string | null) => {
      if (!account || !token) return;
      setPairScoreLoading(true);
      try {
        const target = targetOverride !== undefined ? targetOverride : pairTargetId;
        const next = await fetchAdminPairScore(account.id, token, target, 12);
        setPairScore(next);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to load pair score snapshot');
      } finally {
        setPairScoreLoading(false);
      }
    },
    [account, pairTargetId, token]
  );

  const refreshRerankEvents = useCallback(async () => {
    if (!account || !token) return;
    setRerankEventsLoading(true);
    try {
      const next = await fetchAdminRerankEvents(account.id, token, 50);
      setRerankEvents(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load rerank audit');
    } finally {
      setRerankEventsLoading(false);
    }
  }, [account, token]);

  useEffect(() => {
    if (!account || !token) {
      setSignalRecords([]);
      setSilhouette(null);
      setLlmTelemetry(null);
      setAiDecisions(null);
      setPairScore(null);
      setRerankEvents(null);
      return;
    }
    void refreshSignals();
    void refreshSilhouette();
    void refreshLlmTelemetry();
    void refreshAiDecisions();
    void refreshPairScore(pairTargetId);
    void refreshRerankEvents();
  }, [account, pairTargetId, refreshAiDecisions, refreshLlmTelemetry, refreshPairScore, refreshRerankEvents, refreshSignals, refreshSilhouette, token]);

  useEffect(() => {
    if (!account || !token || !pairAutoRefresh) {
      return;
    }
    const timer = setInterval(() => {
      void refreshPairScore();
      void refreshAiDecisions();
      void refreshRerankEvents();
    }, 4000);
    return () => clearInterval(timer);
  }, [account, pairAutoRefresh, refreshAiDecisions, refreshPairScore, refreshRerankEvents, token]);

  const summonDebugPrivatePrompt = useCallback(async () => {
    if (!account || !token) return;
    setDebugPromptLoading(true);
    setMessage(null);
    try {
      const nextPrompt = await postDebugSummonNextPrivatePrompt(account.id, token);
      if (nextPrompt == null) {
        setMessage('No additional private prompt available right now.');
      } else {
        setMessage('Summoned another private prompt. Open Home to answer it.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to summon private prompt');
    } finally {
      setDebugPromptLoading(false);
    }
  }, [account, token]);

  const applyPairTarget = useCallback(() => {
    const trimmed = pairTargetInput.trim();
    const nextTarget = trimmed.length === 0 ? null : trimmed;
    setPairTargetId(nextTarget);
    void refreshPairScore(nextTarget);
  }, [pairTargetInput, refreshPairScore]);

  const clearPairTarget = useCallback(() => {
    setPairTargetInput('');
    setPairTargetId(null);
    void refreshPairScore(null);
  }, [refreshPairScore]);

  const toggleTelemetryRow = useCallback((key: string) => {
    setExpandedTelemetryRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const toggleAiDecisionRow = useCallback((key: string) => {
    setExpandedAiDecisionRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const toggleAdminSection = useCallback((section: AdminSectionId) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { borderColor: borderColor }]}
          >
            <ThemedText style={[styles.backButtonText, { color: muted }]}>Back</ThemedText>
          </Pressable>
          <ThemedText type="title">Admin</ThemedText>
        </View>

        {message ? (
          <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText style={[styles.mutedText, { color: muted }]}>{message}</ThemedText>
          </View>
        ) : null}

        {!account || !token ? (
          <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText style={[styles.mutedText, { color: muted }]}>Log in to use admin tools.</ThemedText>
          </View>
        ) : (
          <>
            <Pressable
              onPress={summonDebugPrivatePrompt}
              disabled={debugPromptLoading || signalsLoading}
              style={({ pressed }) => [
                styles.card,
                {
                  borderColor: cardBorder,
                  backgroundColor: cardBg,
                  opacity: pressed || debugPromptLoading || signalsLoading ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText type="defaultSemiBold">New private prompt</ThemedText>
              <ThemedText style={[styles.mutedText, { color: muted }]}>
                {debugPromptLoading ? 'Summoning...' : 'Testing only'}
              </ThemedText>
            </Pressable>

            <AdminSection
              title="Signals"
              summary={signalsSummary}
              expanded={expandedSections.signals}
              onToggle={() => toggleAdminSection('signals')}
              borderColor={cardBorder}
              backgroundColor={cardBg}
              mutedColor={muted}
              headerAction={
                <Pressable
                  onPress={refreshSignals}
                  disabled={signalsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {signalsLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              }
            >
              {signalsLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <ThemedText>Loading signals...</ThemedText>
                </View>
              ) : sortedSignals.length === 0 ? (
                <ThemedText style={[styles.mutedText, { color: muted }]}>No signals yet.</ThemedText>
              ) : (
                SIGNAL_GROUP_ORDER.map(({ key, label }) => {
                  const records = groupedSignals[key];
                  if (!records.length) return null;
                  return (
                    <View key={`group-${key}`} style={styles.signalGroup}>
                      <ThemedText style={styles.signalGroupTitle}>{`${label} (${records.length})`}</ThemedText>
                      {records.map((record, idx) => (
                        <View
                          key={`${record.token}-${record.intent ?? 'none'}-${record.sourceId ?? 'none'}-${idx}`}
                          style={styles.signalItem}
                        >
                          <ThemedText style={styles.signalItemToken}>
                            {record.canonicalToken ?? record.token}
                          </ThemedText>
                          <ThemedText style={[styles.signalItemText, { color: muted }]}>
                            {`intent=${(record.intent ?? 'self').toLowerCase()} valence=${fmtSigned(record.valence ?? 1)}`}
                          </ThemedText>
                          {record.category ? (
                            <ThemedText style={[styles.signalItemText, { color: muted }]}>
                              {`category=${record.category}`}
                            </ThemedText>
                          ) : null}
                          <ThemedText style={[styles.signalItemText, { color: muted }]}>
                            {`${record.source ?? 'unknown'} | x${record.count ?? 1}`}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  );
                })
              )}
            </AdminSection>

            <AdminSection
              title="Silhouette"
              summary={silhouetteSummary}
              expanded={expandedSections.silhouette}
              onToggle={() => toggleAdminSection('silhouette')}
              borderColor={cardBorder}
              backgroundColor={cardBg}
              mutedColor={muted}
              headerAction={
                <Pressable
                  onPress={refreshSilhouette}
                  disabled={silhouetteLoading || signalsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {silhouetteLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              }
            >
              {silhouetteLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <ThemedText>Loading silhouette...</ThemedText>
                </View>
              ) : !silhouette ? (
                <ThemedText style={[styles.mutedText, { color: muted }]}>No silhouette loaded.</ThemedText>
              ) : (
                <>
                  <ThemedText style={[styles.signalItemText, { color: muted }]}>
                    {`maturity=${silhouette.maturity ?? 'empty'} version=${silhouette.version ?? 1} updatedAt=${
                      silhouette.updatedAt ?? 0
                    }`}
                  </ThemedText>
                  {silhouette.summaryCache?.silhouette ? (
                    <View style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>silhouette</ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {silhouette.summaryCache.silhouette}
                      </ThemedText>
                    </View>
                  ) : null}
                  {(silhouette.modes ?? []).slice(0, 5).map((mode, idx) => {
                    const sections = conceptSections(mode);
                    const evidenceLines = unlinkedModeEvidenceLines(mode, linkedEvidenceIds(sections));
                    return (
                      <View key={`mode-${mode.id ?? idx}`} style={styles.signalItem}>
                        <ThemedText style={styles.signalItemToken}>
                          {`${mode.label ?? mode.id ?? 'mode'}`}
                          <ThemedText style={[styles.signalItemText, { color: muted }]}>
                            {` (${mode.status ?? 'emerging'})`}
                          </ThemedText>
                        </ThemedText>
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`weight=${(mode.weight ?? 0).toFixed(2)} confidence=${(mode.confidence ?? 0).toFixed(2)}`}
                        </ThemedText>
                        {sections.map((section) => (
                          <View key={section.key} style={styles.conceptBlock}>
                            <ThemedText style={styles.conceptHeading}>
                              {`${section.group}: ${section.concept.label}`}
                            </ThemedText>
                            <ThemedText style={[styles.signalItemText, { color: muted }]}>
                              {`${section.concept.role ?? 'context'} c=${(section.concept.confidence ?? 0).toFixed(
                                2
                              )} s=${(section.concept.strength ?? 0).toFixed(2)}`}
                            </ThemedText>
                            {section.evidence.map((evidence) => (
                              <ThemedText
                                key={evidence.id ?? evidence.value}
                                style={[styles.conceptExample, { color: muted }]}
                              >
                                {conceptEvidenceLine(evidence)}
                              </ThemedText>
                            ))}
                          </View>
                        ))}
                        {(mode.antiPatterns ?? []).slice(0, 6).map((anti) => (
                          <ThemedText key={anti.id ?? anti.label} style={[styles.signalItemText, { color: muted }]}>
                            {`anti: ${anti.label} (${anti.severity ?? 'low'} c=${(anti.confidence ?? 0).toFixed(2)})`}
                          </ThemedText>
                        ))}
                        {(mode.tensions ?? []).slice(0, 4).map((tension) => (
                          <ThemedText key={tension.id ?? `${tension.a}-${tension.b}`} style={[styles.signalItemText, { color: muted }]}>
                            {`tension: ${tension.a} / ${tension.b} (${tension.status ?? 'productive_tension'})`}
                          </ThemedText>
                        ))}
                        {evidenceLines.map((line, evidenceIdx) => (
                          <ThemedText key={`${line}-${evidenceIdx}`} style={[styles.signalItemText, { color: muted }]}>
                            {line}
                          </ThemedText>
                        ))}
                        {(mode.openQuestions ?? []).slice(0, 5).map((question) => (
                          <ThemedText key={question} style={[styles.signalItemText, { color: muted }]}>
                            {`question: ${question}`}
                          </ThemedText>
                        ))}
                      </View>
                    );
                  })}
                  {(silhouette.modes ?? []).length === 0 ? (
                    <View style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>modes</ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        none
                      </ThemedText>
                    </View>
                  ) : null}
                </>
              )}
            </AdminSection>

            <AdminSection
              title="LLM telemetry"
              summary={llmTelemetrySummary}
              expanded={expandedSections.llmTelemetry}
              onToggle={() => toggleAdminSection('llmTelemetry')}
              borderColor={cardBorder}
              backgroundColor={cardBg}
              mutedColor={muted}
              headerAction={
                <Pressable
                  onPress={refreshLlmTelemetry}
                  disabled={llmTelemetryLoading || signalsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {llmTelemetryLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              }
            >
              {llmTelemetryLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <ThemedText>Loading telemetry...</ThemedText>
                </View>
              ) : !llmTelemetry ? (
                <ThemedText style={[styles.mutedText, { color: muted }]}>No telemetry loaded.</ThemedText>
              ) : (
                <>
                  <View style={styles.signalItem}>
                    <ThemedText style={styles.signalItemToken}>LLM spend and health</ThemedText>
                    <ThemedText style={[styles.narrativeText, { color: muted }]}>
                      {`Aggregate: ${fmtCount(llmTelemetry.totals?.calls)} calls, ${fmtCount(
                        llmTelemetry.totals?.successes
                      )} success, ${fmtCount(llmTelemetry.totals?.failures)} failed, ${fmtCount(
                        llmTelemetry.totals?.inputTokens
                      )} input tokens, ${fmtCount(llmTelemetry.totals?.outputTokens)} output tokens, avg latency ${fmtLatency(
                        llmTelemetry.totals?.avgLatencyMs
                      )}.`}
                    </ThemedText>
                    <ThemedText style={[styles.narrativeText, { color: muted }]}>
                      {`Recent-event estimated spend: ${fmtMoney(llmRecentCost(llmTelemetry.events))} across ${
                        (llmTelemetry.events ?? []).length
                      } recent events. Cost uses per-event model names; aggregate stage rows do not include model, so they stay token-only.`}
                    </ThemedText>
                  </View>
                  {(llmTelemetry.byStage ?? []).slice(0, 8).map((row) => (
                    <View key={`${row.stageKey}`} style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>{`${row.stage}/${row.surface}`}</ThemedText>
                      <ThemedText style={[styles.narrativeText, { color: muted }]}>
                        {`${fmtCount(row.calls)} calls, ${fmtCount(row.failures)} failures, ${fmtCount(
                          row.inputTokens
                        )} in / ${fmtCount(row.outputTokens)} out tokens, ${fmtLatency(row.avgLatencyMs)} avg latency.`}
                      </ThemedText>
                    </View>
                  ))}
                  {(llmTelemetry.byContext ?? []).slice(0, 8).map((row) => (
                    <View key={`${row.contextKey}`} style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>
                        {`${row.operation || row.stage}/${row.surface} acct=${row.accountId ?? 'n/a'}`}
                      </ThemedText>
                      <ThemedText style={[styles.narrativeText, { color: muted }]}>
                        {`Operation trace: ${fmtCount(row.calls)} calls for user ${row.accountId ?? 'n/a'}, ${fmtCount(
                          row.failures
                        )} failures, ${fmtCount(row.totalTokens)} tokens, ${fmtCount(
                          row.promptChars
                        )} prompt chars, ${fmtCount(row.candidateCount)} candidates.`}
                      </ThemedText>
                    </View>
                  ))}
                  {expensiveLlmEvents(llmTelemetry.events).slice(0, 24).map((event, idx) => {
                    const key = `${event.createdAt}-${event.stage}-${event.surface}-${idx}`;
                    const expanded = expandedTelemetryRows[key] === true;
                    const cost = llmEventCost(event);
                    return (
                      <Pressable key={key} onPress={() => toggleTelemetryRow(key)} style={styles.signalItem}>
                        <ThemedText style={styles.signalItemToken}>
                          {`${fmtMoney(cost)} | ${event.operation || event.stage}/${event.surface}`}
                        </ThemedText>
                        <ThemedText style={[styles.narrativeText, { color: muted }]}>
                          {llmEventNarrative(event)}
                        </ThemedText>
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`model=${event.model} ${new Date(event.createdAt).toLocaleTimeString()}`}
                        </ThemedText>
                        {expanded ? (
                          <>
                            <DetailRows
                              mutedColor={muted}
                              rows={[
                                { label: 'Estimated cost', value: fmtMoney(cost) },
                                { label: 'Tokens', value: `${fmtCount(event.inputTokens)} in / ${fmtCount(event.outputTokens)} out` },
                                { label: 'Latency', value: fmtLatency(event.latencyMs) },
                                { label: 'Stage', value: event.stage },
                                { label: 'Surface', value: event.surface },
                                { label: 'Operation', value: event.operation ?? 'n/a' },
                                { label: 'Prompt', value: event.promptId ?? 'n/a' },
                                { label: 'Source', value: event.sourceId ?? 'n/a' },
                                { label: 'Candidates', value: fmtCount(event.candidateCount) },
                                { label: 'Prompt chars', value: fmtCount(event.promptChars) },
                                { label: 'Max output', value: fmtCount(event.maxOutputTokens) },
                                { label: 'Model', value: event.model },
                                ...(event.error ? [{ label: 'Error', value: event.error }] : []),
                              ]}
                            />
                          </>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </>
              )}
            </AdminSection>

            <AdminSection
              title="AI decisions"
              summary={aiDecisionsSummary}
              expanded={expandedSections.aiDecisions}
              onToggle={() => toggleAdminSection('aiDecisions')}
              borderColor={cardBorder}
              backgroundColor={cardBg}
              mutedColor={muted}
              headerAction={
                <Pressable
                  onPress={refreshAiDecisions}
                  disabled={aiDecisionsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {aiDecisionsLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              }
            >
              {aiDecisionsLoading && !aiDecisions ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <ThemedText>Loading AI decisions...</ThemedText>
                </View>
              ) : !aiDecisions ? (
                <ThemedText style={[styles.mutedText, { color: muted }]}>No AI decisions loaded.</ThemedText>
              ) : (
                <>
                  <View style={styles.signalItem}>
                    <ThemedText style={styles.signalItemToken}>Decision summary</ThemedText>
                    <ThemedText style={[styles.narrativeText, { color: muted }]}>
                      {`${fmtCount(aiDecisions.totals?.decisions)} decisions recorded. Top surface: ${topAggregateLabel(
                        aiDecisions.bySurface,
                        (row) => row.surface
                      )}. Top action: ${topAggregateLabel(aiDecisions.byAction, (row) => row.action)}. Generated ${fmtAdminTime(
                        aiDecisions.generatedAt
                      )}.`}
                    </ThemedText>
                  </View>
                  {(aiDecisions.byDecision ?? []).slice(0, 6).map((row) => (
                    <View key={row.decisionKey ?? `${row.surface}-${row.stage}-${row.action}`} style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>
                        {`${row.action ?? 'action'} / ${row.surface ?? 'surface'}`}
                      </ThemedText>
                      <ThemedText style={[styles.narrativeText, { color: muted }]}>
                        {`${fmtCount(row.count)} events at stage ${row.stage ?? 'unknown'} on ${
                          row.surface ?? 'unknown'
                        }.`}
                      </ThemedText>
                    </View>
                  ))}
                  {(aiDecisions.events ?? []).slice(0, 20).map((event, idx) => {
                    const key = `${event.createdAt}-${event.surface}-${event.stage}-${event.action}-${idx}`;
                    const expanded = expandedAiDecisionRows[key] === true;
                    const accountLabel = event.accountId == null ? 'acct=n/a' : `acct=${event.accountId}`;
                    const targetLabel = event.targetAccountId == null ? '' : ` target=${event.targetAccountId}`;
                    return (
                      <Pressable key={key} onPress={() => toggleAiDecisionRow(key)} style={styles.signalItem}>
                        <ThemedText style={styles.signalItemToken}>
                          {`${event.action} / ${event.surface}`}
                        </ThemedText>
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`stage=${event.stage} ${accountLabel}${targetLabel} ${new Date(
                            event.createdAt
                          ).toLocaleTimeString()}`}
                        </ThemedText>
                        <ThemedText style={[styles.narrativeText, { color: muted }]}>
                          {aiDecisionNarrative(event)}
                        </ThemedText>
                        {expanded ? (
                          <>
                            <DetailRows
                              mutedColor={muted}
                              rows={[
                                { label: 'Action', value: event.action },
                                { label: 'Surface', value: event.surface },
                                { label: 'Stage', value: event.stage },
                                { label: 'Account', value: accountLabel.replace('acct=', '') },
                                { label: 'Target', value: targetLabel.replace(' target=', '') || 'n/a' },
                                ...(detailRowsFromRecord(event.details).length === 0
                                  ? [{ label: 'Details', value: 'none' }]
                                  : detailRowsFromRecord(event.details)),
                              ]}
                            />
                          </>
                        ) : null}
                      </Pressable>
                    );
                  })}
                  {(aiDecisions.events ?? []).length === 0 ? (
                    <ThemedText style={[styles.signalItemText, { color: muted }]}>
                      No recent decisions recorded.
                    </ThemedText>
                  ) : null}
                </>
              )}
            </AdminSection>

            <AdminSection
              title="Signal Registry + Drift Queue"
              summary="Registry, candidates, promote/reject tooling."
              expanded={expandedSections.signalConcepts}
              onToggle={() => toggleAdminSection('signalConcepts')}
              borderColor={cardBorder}
              backgroundColor={cardBg}
              mutedColor={muted}
            >
              <Pressable
                onPress={() => router.push('/admin-signal-concepts')}
                style={({ pressed }) => [
                  styles.sectionActionButton,
                  {
                    borderColor: cardBorder,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <ThemedText style={styles.sectionActionText}>Open full-screen tooling</ThemedText>
                <MaterialIcons name="chevron-right" size={18} color={muted} />
              </Pressable>
            </AdminSection>

            <AdminSection
              title="Pair scores"
              summary={pairScoreSummary}
              expanded={expandedSections.pairScore}
              onToggle={() => toggleAdminSection('pairScore')}
              borderColor={cardBorder}
              backgroundColor={cardBg}
              mutedColor={muted}
              headerAction={
                <Pressable
                  onPress={() => void refreshPairScore()}
                  disabled={pairScoreLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {pairScoreLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              }
            >
              <ThemedText style={[styles.signalItemText, { color: muted }]}>
                {`Auto-refresh=${pairAutoRefresh ? 'on' : 'off'} (4s) ${
                  pairTargetId ? `target=${pairTargetId}` : 'target=none'
                }`}
              </ThemedText>

              <View style={styles.inputRow}>
                <TextInput
                  value={pairTargetInput}
                  onChangeText={setPairTargetInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Target account id (e.g. 123-a)"
                  placeholderTextColor={muted}
                  style={[
                    styles.targetInput,
                    {
                      borderColor: cardBorder,
                      color: muted,
                      backgroundColor: inputBg,
                    },
                  ]}
                />
                <Pressable
                  onPress={applyPairTarget}
                  style={({ pressed }) => [styles.smallButton, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <ThemedText style={styles.signalItemText}>Apply</ThemedText>
                </Pressable>
                <Pressable
                  onPress={clearPairTarget}
                  style={({ pressed }) => [styles.smallButton, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <ThemedText style={styles.signalItemText}>Clear</ThemedText>
                </Pressable>
              </View>

              <Pressable
                onPress={() => setPairAutoRefresh((prev) => !prev)}
                style={({ pressed }) => [styles.smallButton, { opacity: pressed ? 0.7 : 1 }]}
              >
                <ThemedText style={styles.signalItemText}>
                  {pairAutoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
                </ThemedText>
              </Pressable>

              {pairScoreLoading && !pairScore ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <ThemedText>Loading pair-score snapshot...</ThemedText>
                </View>
              ) : !pairScore ? (
                <ThemedText style={[styles.mutedText, { color: muted }]}>No pair-score snapshot loaded.</ThemedText>
              ) : (
                <>
                  <View style={styles.signalItem}>
                    <ThemedText style={styles.signalItemToken}>Viewer snapshot</ThemedText>
                    <ThemedText style={[styles.narrativeText, { color: muted }]}>
                      {`Viewer ${pairScore.viewerId} is in ${pairScore.viewerMode} mode. Match threshold=${fmtNumber(
                        pairScore.viewerThresholds.match,
                        2
                      )}; auto-pass threshold=${fmtNumber(pairScore.viewerThresholds.autoPass, 2)}. Generated ${fmtAdminTime(
                        pairScore.generatedAt
                      )} with ${(pairScore.topCandidates ?? []).length} ranked candidates.`}
                    </ThemedText>
                    <ThemedText style={[styles.signalItemText, { color: muted }]}>
                      {`Heap raw=${pairScore.heap?.rawCandidateCount ?? 0} hydrated=${
                        pairScore.heap?.hydratedCandidateCount ?? (pairScore.topCandidates ?? []).length
                      }`}
                    </ThemedText>
                  </View>
                  {(pairScore.topCandidates ?? []).slice(0, 8).map((candidate) => (
                    <CandidateScoreCard
                      key={candidate.account.id}
                      candidate={candidate}
                      rerankEvent={latestRerankByCandidateId[candidate.account.id]}
                      mutedColor={muted}
                    />
                  ))}
                  {(pairScore.topCandidates ?? []).length === 0 ? (
                    <ThemedText style={[styles.signalItemText, { color: muted }]}>
                      No ranked candidates found.
                    </ThemedText>
                  ) : null}
                  {(pairScore.heap?.rawTopCandidates ?? []).length > 0
                    && (pairScore.topCandidates ?? []).length === 0 ? (
                    <View style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>Raw heap candidates</ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        Heap rows exist, but account hydration returned no cards.
                      </ThemedText>
                      {(pairScore.heap?.rawTopCandidates ?? []).slice(0, 5).map((candidate) => (
                        <DetailRows
                          key={candidate.targetAccountId}
                          mutedColor={muted}
                          rows={[
                            { label: 'Target', value: candidate.targetAccountId },
                            { label: 'Score', value: fmtNumber(candidate.score, 2) },
                            { label: 'Computed', value: fmtAdminTime(candidate.computedAt) },
                          ]}
                        />
                      ))}
                    </View>
                  ) : null}
                  {pairScore.pair ? (
                    <PairSnapshotCard
                      pair={pairScore.pair}
                      rerankEvent={latestRerankByCandidateId[pairScore.pair.targetAccountId]}
                      mutedColor={muted}
                    />
                  ) : null}
                </>
              )}
            </AdminSection>

            <AdminSection
              title="Rerank audit"
              summary={rerankSummary}
              expanded={expandedSections.rerankAudit}
              onToggle={() => toggleAdminSection('rerankAudit')}
              borderColor={cardBorder}
              backgroundColor={cardBg}
              mutedColor={muted}
              headerAction={
                <Pressable
                  onPress={refreshRerankEvents}
                  disabled={rerankEventsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {rerankEventsLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              }
            >
              {rerankEventsLoading && !rerankEvents ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <ThemedText>Loading rerank audit...</ThemedText>
                </View>
              ) : !rerankEvents || (rerankEvents.events ?? []).length === 0 ? (
                <ThemedText style={[styles.mutedText, { color: muted }]}>No rerank events recorded yet.</ThemedText>
              ) : (
                (rerankEvents.events ?? []).slice(0, 10).map((event, idx) => {
                  const before = Number.isFinite(event.scoreBefore) ? (event.scoreBefore as number) : null;
                  const after = Number.isFinite(event.scoreAfter) ? (event.scoreAfter as number) : null;
                  const net = Number.isFinite(event.netChange) ? (event.netChange as number) : null;
                  const percent = Number.isFinite(event.percentChange) ? (event.percentChange as number) : null;
                  const compat = Number.isFinite(event.tier3Compatibility)
                    ? (event.tier3Compatibility as number)
                    : null;
                  const confidence = Number.isFinite(event.tier3Confidence)
                    ? (event.tier3Confidence as number)
                    : null;
                  const eventType = event.eventType ?? 'applied';
                  const skipCounts =
                    event.skipReason && Number.isFinite(event.requiredPublicPromptReactionCount)
                      ? `viewer=${Number.isFinite(event.viewerPublicPromptReactionCount) ? event.viewerPublicPromptReactionCount : 'n/a'} candidate=${
                          Number.isFinite(event.candidatePublicPromptReactionCount)
                            ? event.candidatePublicPromptReactionCount
                            : 'n/a'
                        } min=${event.requiredPublicPromptReactionCount}`
                      : null;
                  const why = (event.whyItWorks ?? []).slice(0, 2).join('; ');
                  const risks = (event.risks ?? []).slice(0, 2).join('; ');
                  const missing = (event.missingInfo ?? []).slice(0, 2).join('; ');
                  return (
                    <View key={`${event.createdAt}-${event.candidateId ?? idx}`} style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>
                        {`${event.candidateName ?? event.candidateId ?? 'candidate'} ${
                          event.skipReason
                            ? `(skipped:${event.skipReason})`
                            : event.recommendedUse
                              ? `(${event.recommendedUse})`
                              : ''
                        }`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`${eventType} ${event.surface ?? 'surface'} source=${
                          event.scoreSource ?? 'n/a'
                        } ${new Date(event.createdAt).toLocaleTimeString()} ${event.candidateId ?? ''}`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`score=${before == null ? 'n/a' : before.toFixed(2)} -> ${
                          after == null ? 'n/a' : after.toFixed(2)
                        } net=${net == null ? 'n/a' : fmtDelta(net)} pct=${
                          percent == null ? 'n/a' : `${fmtDelta(percent)}%`
                        }`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`compat=${compat == null ? 'n/a' : compat.toFixed(2)} conf=${
                          confidence == null ? 'n/a' : confidence.toFixed(2)
                        }`}
                      </ThemedText>
                      {event.skipReason ? (
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`skip_reason=${event.skipReason}${skipCounts ? ` ${skipCounts}` : ''}`}
                        </ThemedText>
                      ) : null}
                      {event.fitSummaryInternal ? (
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`summary=${event.fitSummaryInternal}`}
                        </ThemedText>
                      ) : null}
                      {why ? (
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>{`why=${why}`}</ThemedText>
                      ) : null}
                      {risks ? (
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>{`risks=${risks}`}</ThemedText>
                      ) : null}
                      {missing ? (
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`missing=${missing}`}
                        </ThemedText>
                      ) : null}
                    </View>
                  );
                })
              )}
            </AdminSection>

          </>
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
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  collapsibleToggle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  collapsibleTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  expandPill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  expandPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  headerAction: {
    flexShrink: 0,
    paddingTop: 4,
  },
  sectionActionButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sectionActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mutedText: {
    fontSize: 13,
    lineHeight: 18,
  },
  signalItemText: {
    fontSize: 12,
    lineHeight: 18,
  },
  narrativeText: {
    fontSize: 13,
    lineHeight: 19,
  },
  signalGroup: {
    gap: 8,
  },
  signalGroupTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  signalItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.32)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  signalItemToken: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  scoreBadge: {
    flexShrink: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 132,
    minWidth: 132,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  metricValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  metricNote: {
    fontSize: 11,
    lineHeight: 15,
  },
  detailGrid: {
    gap: 5,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailLabel: {
    width: 112,
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  detailValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
  },
  scoreBreakdown: {
    gap: 8,
  },
  conceptBlock: {
    gap: 2,
    paddingTop: 6,
  },
  conceptHeading: {
    fontSize: 12,
    fontWeight: '700',
  },
  conceptExample: {
    fontSize: 12,
    lineHeight: 18,
    paddingLeft: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  targetInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
});
