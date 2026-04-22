import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  fetchAdminLlmTelemetry,
  fetchAdminSilhouette,
  fetchFacecards,
  fetchSignals,
  LlmTelemetryResponse,
  MatchCard,
  postDebugSummonNextPrivatePrompt,
  SignalRecord,
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

export default function AdminScreen() {
  const router = useRouter();
  const { account, token } = useAuth();
  const [debugPromptLoading, setDebugPromptLoading] = useState(false);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [silhouetteLoading, setSilhouetteLoading] = useState(false);
  const [llmTelemetryLoading, setLlmTelemetryLoading] = useState(false);
  const [facecardsLoading, setFacecardsLoading] = useState(false);
  const [signalRecords, setSignalRecords] = useState<SignalRecord[]>([]);
  const [silhouette, setSilhouette] = useState<SilhouetteResponse | null>(null);
  const [llmTelemetry, setLlmTelemetry] = useState<LlmTelemetryResponse | null>(null);
  const [facecards, setFacecards] = useState<MatchCard[]>([]);
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

  const sortedSignals = useMemo(
    () => signalRecords.slice().sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0)),
    [signalRecords]
  );
  const sortedFacecards = useMemo(
    () => facecards.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [facecards]
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

  const refreshFacecards = useCallback(async () => {
    if (!account || !token) return;
    setFacecardsLoading(true);
    try {
      const next = await fetchFacecards(account.id, token, 8);
      setFacecards(next ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load facecards');
    } finally {
      setFacecardsLoading(false);
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

  useEffect(() => {
    if (!account || !token) {
      setSignalRecords([]);
      setSilhouette(null);
      setLlmTelemetry(null);
      setFacecards([]);
      return;
    }
    void refreshSignals();
    void refreshSilhouette();
    void refreshLlmTelemetry();
    void refreshFacecards();
  }, [account, refreshFacecards, refreshLlmTelemetry, refreshSignals, refreshSilhouette, token]);

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
              disabled={debugPromptLoading || signalsLoading || facecardsLoading}
              style={({ pressed }) => [
                styles.card,
                {
                  borderColor: cardBorder,
                  backgroundColor: cardBg,
                  opacity: pressed || debugPromptLoading || signalsLoading || facecardsLoading ? 0.7 : 1,
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
                  disabled={signalsLoading || debugPromptLoading || facecardsLoading}
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
                sortedSignals.map((record, idx) => (
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
                ))
              )}
            </View>

            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold">Temp: Silhouette (read-only)</ThemedText>
                <Pressable
                  onPress={refreshSilhouette}
                  disabled={silhouetteLoading || signalsLoading || facecardsLoading || debugPromptLoading}
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
                  {silhouette.summaryCache?.rerankerShort ? (
                    <View style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>reranker_short</ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {silhouette.summaryCache.rerankerShort}
                      </ThemedText>
                    </View>
                  ) : null}
                  {silhouette.summaryCache?.adminLong ? (
                    <View style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>admin_long</ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {silhouette.summaryCache.adminLong}
                      </ThemedText>
                    </View>
                  ) : null}
                  {(silhouette.claims ?? []).slice(0, 12).map((claim, idx) => (
                    <View key={`claim-${claim.id ?? idx}`} style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>
                        {claim.facet ?? 'general'}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`${claim.text} (conf=${(claim.confidence ?? 0).toFixed(2)})`}
                      </ThemedText>
                      {claim.kind ? (
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`kind=${claim.kind}`}
                        </ThemedText>
                      ) : null}
                      {claim.source ? (
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`${claim.source}${claim.promptId ? ` | ${claim.promptId}` : ''}`}
                        </ThemedText>
                      ) : null}
                    </View>
                  ))}
                  {(silhouette.claims ?? []).length === 0 ? (
                    <View style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>claims</ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        none
                      </ThemedText>
                    </View>
                  ) : null}
                  <ThemedText style={[styles.signalItemText, { color: muted }]}>
                    {JSON.stringify(silhouette)}
                  </ThemedText>
                </>
              )}
            </View>

            <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold">Temp: LLM telemetry (read-only)</ThemedText>
                <Pressable
                  onPress={refreshLlmTelemetry}
                  disabled={llmTelemetryLoading || signalsLoading || facecardsLoading || debugPromptLoading}
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
                  {(llmTelemetry.events ?? []).slice(0, 12).map((event, idx) => (
                    <View key={`${event.createdAt}-${event.stage}-${idx}`} style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>
                        {`${event.stage}/${event.surface} ${event.success ? 'ok' : 'fail'}`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`model=${event.model} tok=${event.totalTokens} in=${event.inputTokens} out=${event.outputTokens} ms=${event.latencyMs}`}
                      </ThemedText>
                    </View>
                  ))}
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
                <ThemedText type="defaultSemiBold">Temp: Facecard score debug</ThemedText>
                <Pressable
                  onPress={refreshFacecards}
                  disabled={facecardsLoading || signalsLoading || debugPromptLoading}
                >
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {facecardsLoading ? 'Refreshing...' : 'Refresh'}
                  </ThemedText>
                </Pressable>
              </View>

              {facecardsLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <ThemedText>Loading facecards...</ThemedText>
                </View>
              ) : sortedFacecards.length === 0 ? (
                <ThemedText style={[styles.mutedText, { color: muted }]}>No facecards loaded.</ThemedText>
              ) : (
                sortedFacecards.map((match) => {
                  const debug = match.scorerDebug;
                  const filterPreferenceFit = Number.isFinite(debug?.filterPreferenceFit)
                    ? (debug?.filterPreferenceFit as number)
                    : null;
                  const signalAlignment = Number.isFinite(debug?.signalAlignment)
                    ? (debug?.signalAlignment as number)
                    : null;
                  const profileSignalBlend = Number.isFinite(debug?.profileSignalBlend)
                    ? (debug?.profileSignalBlend as number)
                    : null;
                  const viewerNeedsMetByTarget = Number.isFinite(debug?.viewerNeedsMetByTarget)
                    ? (debug?.viewerNeedsMetByTarget as number)
                    : null;
                  const targetNeedsMetByViewer = Number.isFinite(debug?.targetNeedsMetByViewer)
                    ? (debug?.targetNeedsMetByViewer as number)
                    : null;
                  const sharedSelfOverlap = Number.isFinite(debug?.sharedSelfOverlap)
                    ? (debug?.sharedSelfOverlap as number)
                    : null;
                  const viewerReactionScore = Number.isFinite(debug?.viewerReactionScore)
                    ? (debug?.viewerReactionScore as number)
                    : null;
                  const targetInterestScore = Number.isFinite(debug?.targetInterestScore)
                    ? (debug?.targetInterestScore as number)
                    : null;
                  const noveltyScore = Number.isFinite(debug?.noveltyScore)
                    ? (debug?.noveltyScore as number)
                    : null;
                  const finalScore = Number.isFinite(debug?.finalScore)
                    ? (debug?.finalScore as number)
                    : null;
                  const tier3Compatibility = Number.isFinite(debug?.tier3Compatibility)
                    ? (debug?.tier3Compatibility as number)
                    : null;
                  const tier3Confidence = Number.isFinite(debug?.tier3Confidence)
                    ? (debug?.tier3Confidence as number)
                    : null;
                  const tier3Applied = debug?.tier3Applied === true;
                  const tier3HardBlocker = debug?.tier3HardBlocker === true;
                  const tier3Reason =
                    typeof debug?.tier3Reason === 'string' ? debug.tier3Reason : null;
                  return (
                    <View key={match.account.id} style={styles.signalItem}>
                      <ThemedText style={styles.signalItemToken}>
                        {match.account.name ?? match.account.id}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`score=${match.score.toFixed(2)} final=${
                          finalScore == null ? 'n/a' : finalScore.toFixed(3)
                        } blend=${profileSignalBlend == null ? 'n/a' : profileSignalBlend.toFixed(3)}`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`fit=${
                          filterPreferenceFit == null ? 'n/a' : filterPreferenceFit.toFixed(3)
                        } align=${signalAlignment == null ? 'n/a' : signalAlignment.toFixed(3)} overlap=${
                          sharedSelfOverlap == null ? 'n/a' : sharedSelfOverlap.toFixed(3)
                        }`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`needs(v->t/t->v)=${
                          viewerNeedsMetByTarget == null ? 'n/a' : viewerNeedsMetByTarget.toFixed(3)
                        }/${targetNeedsMetByViewer == null ? 'n/a' : targetNeedsMetByViewer.toFixed(3)} react=${
                          viewerReactionScore == null ? 'n/a' : viewerReactionScore.toFixed(3)
                        } interest=${targetInterestScore == null ? 'n/a' : targetInterestScore.toFixed(3)} novelty=${
                          noveltyScore == null ? 'n/a' : noveltyScore.toFixed(3)
                        }`}
                      </ThemedText>
                      <ThemedText style={[styles.signalItemText, { color: muted }]}>
                        {`tier3=${tier3Applied ? 'applied' : 'off'} compat=${
                          tier3Compatibility == null ? 'n/a' : tier3Compatibility.toFixed(2)
                        } conf=${tier3Confidence == null ? 'n/a' : tier3Confidence.toFixed(2)} blocker=${
                          tier3HardBlocker ? 'yes' : 'no'
                        }`}
                      </ThemedText>
                      {tier3Reason ? (
                        <ThemedText style={[styles.signalItemText, { color: muted }]}>
                          {`tier3_reason=${tier3Reason}`}
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
});
