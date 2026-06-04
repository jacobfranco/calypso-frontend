import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  AdminAiDecisionsResponse,
  AdminPairScoreResponse,
  AdminRerankEventsResponse,
  fetchAdminAiDecisions,
  fetchAdminLlmTelemetry,
  fetchAdminPairScore,
  fetchAdminRerankEvents,
  fetchAdminSilhouette,
  fetchSignals,
  LlmTelemetryResponse,
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

function fmtCount(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value as number));
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

type SignalIntentGroup = 'seeking' | 'self' | 'both' | 'meta' | 'other';

const SIGNAL_GROUP_ORDER: { key: SignalIntentGroup; label: string }[] = [
  { key: 'seeking', label: 'Seeking' },
  { key: 'self', label: 'Self' },
  { key: 'both', label: 'Both' },
  { key: 'meta', label: 'Meta' },
  { key: 'other', label: 'Other' },
];

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

        <ThemedText style={[styles.mutedText, { color: muted }]}>
          Temporary demo/debug tools.
        </ThemedText>

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
              <ThemedText type="defaultSemiBold">Temp: Summon another private prompt</ThemedText>
              <ThemedText style={[styles.mutedText, { color: muted }]}>
                {debugPromptLoading ? 'Summoning...' : 'Testing only'}
              </ThemedText>
            </Pressable>

              <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
                <View style={styles.cardHeader}>
                  <ThemedText type="defaultSemiBold">Temp: Extracted signals</ThemedText>
                <Pressable
                  onPress={refreshSignals}
                  disabled={signalsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {signalsLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              </View>

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
            </View>

            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold">Temp: Silhouette (read-only)</ThemedText>
                <Pressable
                  onPress={refreshSilhouette}
                  disabled={silhouetteLoading || signalsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {silhouetteLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              </View>

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
            </View>

            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold">Temp: LLM telemetry (read-only)</ThemedText>
                <Pressable
                  onPress={refreshLlmTelemetry}
                  disabled={llmTelemetryLoading || signalsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {llmTelemetryLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              </View>

              {llmTelemetryLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <ThemedText>Loading telemetry...</ThemedText>
                </View>
              ) : !llmTelemetry ? (
                <ThemedText style={[styles.mutedText, { color: muted }]}>No telemetry loaded.</ThemedText>
              ) : (
                <>
                  <ThemedText style={[styles.signalItemText, { color: muted }]}>
                    {`calls=${llmTelemetry.totals?.calls ?? 0} success=${llmTelemetry.totals?.successes ?? 0} fail=${
                      llmTelemetry.totals?.failures ?? 0
                    } total_tokens=${llmTelemetry.totals?.totalTokens ?? 0}`}
                  </ThemedText>
                  <ThemedText style={[styles.signalItemText, { color: muted }]}>
                    {`input=${llmTelemetry.totals?.inputTokens ?? 0} output=${
                      llmTelemetry.totals?.outputTokens ?? 0
                    } avg_latency_ms=${(llmTelemetry.totals?.avgLatencyMs ?? 0).toFixed(1)}`}
                  </ThemedText>
                  {(llmTelemetry.byStage ?? []).slice(0, 8).map((row) => (
                    <View key={`${row.stageKey}`} style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>{`${row.stage}/${row.surface}`}</ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`calls=${row.calls} success=${row.successes} fail=${row.failures} tokens=${row.totalTokens}`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`in=${row.inputTokens} out=${row.outputTokens} avg_ms=${row.avgLatencyMs.toFixed(1)}`}
                      </ThemedText>
                    </View>
                  ))}
                  {(llmTelemetry.byContext ?? []).slice(0, 8).map((row) => (
                    <View key={`${row.contextKey}`} style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>
                        {`${row.operation || row.stage}/${row.surface} acct=${row.accountId ?? 'n/a'}`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`calls=${row.calls} fail=${row.failures} tokens=${row.totalTokens} chars=${fmtCount(
                          row.promptChars
                        )} candidates=${fmtCount(row.candidateCount)}`}
                      </ThemedText>
                    </View>
                  ))}
                  {(llmTelemetry.events ?? []).slice(0, 24).map((event, idx) => {
                    const key = `${event.createdAt}-${event.stage}-${event.surface}-${idx}`;
                    const expanded = expandedTelemetryRows[key] === true;
                    const accountLabel = event.accountId == null ? 'acct=n/a' : `acct=${event.accountId}`;
                    const targetLabel = event.targetAccountId == null ? '' : ` target=${event.targetAccountId}`;
                    return (
                      <Pressable key={key} onPress={() => toggleTelemetryRow(key)} style={styles.signalItem}>
                        <ThemedText style={styles.signalItemToken}>
                          {`${event.operation || event.stage}/${event.surface} ${
                            event.success ? 'ok' : 'fail'
                          } tok=${event.totalTokens}`}
                        </ThemedText>
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`${accountLabel}${targetLabel} model=${event.model} ${new Date(
                            event.createdAt
                          ).toLocaleTimeString()}`}
                        </ThemedText>
                        {expanded ? (
                          <>
                            <ThemedText style={[styles.signalItemText, { color: muted }]}>
                              {`stage=${event.stage} prompt=${event.promptId || 'n/a'} source=${
                                event.sourceId || 'n/a'
                              }`}
                            </ThemedText>
                            <ThemedText style={[styles.signalItemText, { color: muted }]}>
                              {`in=${event.inputTokens} out=${event.outputTokens} max_out=${
                                event.maxOutputTokens ?? 'n/a'
                              } chars=${event.promptChars ?? 'n/a'} candidates=${
                                event.candidateCount ?? 'n/a'
                              } ms=${event.latencyMs}`}
                            </ThemedText>
                            {event.error ? (
                              <ThemedText style={[styles.signalItemText, { color: muted }]}>
                                {`error=${event.error}`}
                              </ThemedText>
                            ) : null}
                          </>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </>
              )}
            </View>

            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold">Live: AI decisions</ThemedText>
                <Pressable
                  onPress={refreshAiDecisions}
                  disabled={aiDecisionsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {aiDecisionsLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              </View>

              {aiDecisionsLoading && !aiDecisions ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <ThemedText>Loading AI decisions...</ThemedText>
                </View>
              ) : !aiDecisions ? (
                <ThemedText style={[styles.mutedText, { color: muted }]}>No AI decisions loaded.</ThemedText>
              ) : (
                <>
                  <ThemedText style={[styles.signalItemText, { color: muted }]}>
                    {`decisions=${aiDecisions.totals?.decisions ?? 0} generatedAt=${aiDecisions.generatedAt}`}
                  </ThemedText>
                  <ThemedText style={[styles.signalItemText, { color: muted }]}>
                    {`surfaces: ${compactAggregateRows(aiDecisions.bySurface, 'surface')}`}
                  </ThemedText>
                  <ThemedText style={[styles.signalItemText, { color: muted }]}>
                    {`actions: ${compactAggregateRows(aiDecisions.byAction, 'action')}`}
                  </ThemedText>
                  {(aiDecisions.byDecision ?? []).slice(0, 6).map((row) => (
                    <View key={row.decisionKey ?? `${row.surface}-${row.stage}-${row.action}`} style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>
                        {`${row.action ?? 'action'} / ${row.surface ?? 'surface'}`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`stage=${row.stage ?? 'unknown'} count=${row.count}`}
                      </ThemedText>
                    </View>
                  ))}
                  {(aiDecisions.events ?? []).slice(0, 20).map((event, idx) => {
                    const key = `${event.createdAt}-${event.surface}-${event.stage}-${event.action}-${idx}`;
                    const expanded = expandedAiDecisionRows[key] === true;
                    const details = Object.entries(event.details ?? {}).slice(0, 16);
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
                        {expanded ? (
                          details.length === 0 ? (
                            <ThemedText style={[styles.signalItemText, { color: muted }]}>details=none</ThemedText>
                          ) : (
                            details.map(([detailKey, value]) => (
                              <ThemedText key={detailKey} style={[styles.signalItemText, { color: muted }]}>
                                {`${detailKey}=${compactAdminValue(value)}`}
                              </ThemedText>
                            ))
                          )
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
            </View>

            <Pressable
              onPress={() => router.push('/admin-signal-concepts')}
              style={({ pressed }) => [
                styles.card,
                {
                  borderColor: cardBorder,
                  backgroundColor: cardBg,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <ThemedText type="defaultSemiBold">Temp: Signal concept registry + drift queue</ThemedText>
              <ThemedText style={[styles.mutedText, { color: muted }]}>
                Open full-screen tooling (registry, candidates, promote/reject).
              </ThemedText>
            </Pressable>

            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold">Live: Pair score inspector</ThemedText>
                <Pressable
                  onPress={() => void refreshPairScore()}
                  disabled={pairScoreLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {pairScoreLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              </View>

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
                  <ThemedText style={[styles.signalItemText, { color: muted }]}>
                    {`viewer_mode=${pairScore.viewerMode} threshold_match=${pairScore.viewerThresholds.match.toFixed(
                      2
                    )} threshold_auto=${pairScore.viewerThresholds.autoPass.toFixed(2)} generatedAt=${
                      pairScore.generatedAt
                    }`}
                  </ThemedText>
                  {(pairScore.topCandidates ?? []).slice(0, 8).map((candidate) => {
                    const debug = candidate.scorerDebug;
                    const blend = Number.isFinite(debug?.profileSignalBlend)
                      ? (debug?.profileSignalBlend as number)
                      : null;
                    const align = Number.isFinite(debug?.signalAlignment)
                      ? (debug?.signalAlignment as number)
                      : null;
                    const fit = Number.isFinite(debug?.filterPreferenceFit)
                      ? (debug?.filterPreferenceFit as number)
                      : null;
                    return (
                      <View key={candidate.account.id} style={styles.signalItem}>
                        <ThemedText style={styles.signalItemToken}>
                          {candidate.account.name ?? candidate.account.id}
                        </ThemedText>
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`${candidate.account.id} score=${candidate.score.toFixed(2)} delta_match=${fmtDelta(
                            candidate.deltaToMatchThreshold
                          )} delta_auto=${fmtDelta(candidate.deltaToAutoPassThreshold)}`}
                        </ThemedText>
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`fit=${fit == null ? 'n/a' : fit.toFixed(3)} align=${
                            align == null ? 'n/a' : align.toFixed(3)
                          } blend=${blend == null ? 'n/a' : blend.toFixed(3)}`}
                        </ThemedText>
                      </View>
                    );
                  })}
                  {(pairScore.topCandidates ?? []).length === 0 ? (
                    <ThemedText style={[styles.signalItemText, { color: muted }]}>
                      No ranked candidates found.
                    </ThemedText>
                  ) : null}
                  {pairScore.pair ? (
                    <View style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>
                        {`pair target=${pairScore.pair.targetAccountId} mode=${pairScore.pair.targetMode} source=${
                          pairScore.pair.scoreSource ?? 'n/a'
                        }`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`pair_reaction(v->t/t->v)=${fmtDelta(pairScore.pair.viewerToTargetReactionScore)}/${fmtDelta(
                          pairScore.pair.targetToViewerReactionScore
                        )} facecard_like=${pairScore.pair.viewerLikedTargetFacecard ? 'yes' : 'no'}/${
                          pairScore.pair.targetLikedViewerFacecard ? 'yes' : 'no'
                        } prompt_like=${pairScore.pair.viewerPromptLikeSeen ? 'yes' : 'no'}/${
                          pairScore.pair.targetPromptLikeSeen ? 'yes' : 'no'
                        }`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`viewer->target score=${
                          Number.isFinite(pairScore.pair.viewerToTarget?.score)
                            ? (pairScore.pair.viewerToTarget.score as number).toFixed(2)
                            : 'n/a'
                        } delta_match=${fmtDelta(pairScore.pair.viewerToTarget?.deltaToMatchThreshold)} delta_auto=${fmtDelta(
                          pairScore.pair.viewerToTarget?.deltaToAutoPassThreshold
                        )}`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`target->viewer score=${
                          Number.isFinite(pairScore.pair.targetToViewer?.score)
                            ? (pairScore.pair.targetToViewer.score as number).toFixed(2)
                            : 'n/a'
                        } delta_match=${fmtDelta(pairScore.pair.targetToViewer?.deltaToMatchThreshold)} delta_auto=${fmtDelta(
                          pairScore.pair.targetToViewer?.deltaToAutoPassThreshold
                        )}`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`mutual_min=${
                          Number.isFinite(pairScore.pair.mutualMinScore)
                            ? (pairScore.pair.mutualMinScore as number).toFixed(2)
                            : 'n/a'
                        } mutual_delta=${fmtDelta(pairScore.pair.mutualDeltaToThreshold)} pass_match=${
                          pairScore.pair.bothMeetMatchThreshold ? 'yes' : 'no'
                        } pass_auto=${pairScore.pair.bothMeetAutoPassThreshold ? 'yes' : 'no'}`}
                      </ThemedText>
                    </View>
                  ) : null}
                </>
              )}
            </View>

            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold">Live: Rerank audit</ThemedText>
                <Pressable
                  onPress={refreshRerankEvents}
                  disabled={rerankEventsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {rerankEventsLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              </View>

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
            </View>

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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    gap: 2,
  },
  signalItemToken: {
    fontSize: 13,
    fontWeight: '600',
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
