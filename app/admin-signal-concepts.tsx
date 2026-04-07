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
  fetchSignalConceptCandidates,
  fetchSignalConceptRegistry,
  promoteSignalConceptCandidate,
  rejectSignalConceptCandidate,
  SignalConcept,
  SignalConceptCandidate,
} from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function AdminSignalConceptsScreen() {
  const router = useRouter();
  const { account, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [concepts, setConcepts] = useState<SignalConcept[]>([]);
  const [candidates, setCandidates] = useState<SignalConceptCandidate[]>([]);
  const [version, setVersion] = useState<number>(0);
  const [query, setQuery] = useState('');
  const [canonicalDraftByRaw, setCanonicalDraftByRaw] = useState<Record<string, string>>({});
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

  const normalizedQuery = query.trim().toLowerCase();
  const filteredConcepts = useMemo(() => {
    if (!normalizedQuery) {
      return concepts;
    }
    return concepts.filter((concept) => {
      if (concept.concept.toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      if (concept.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))) {
        return true;
      }
      return false;
    });
  }, [concepts, normalizedQuery]);

  const filteredCandidates = useMemo(() => {
    if (!normalizedQuery) {
      return candidates;
    }
    return candidates.filter((candidate) => {
      if (candidate.rawToken.toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      if ((candidate.suggestedCanonical ?? '').toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      return false;
    });
  }, [candidates, normalizedQuery]);

  const refresh = useCallback(async () => {
    if (!account || !token) return;
    setLoading(true);
    setMessage(null);
    try {
      const [registry, drift] = await Promise.all([
        fetchSignalConceptRegistry(account.id, token),
        fetchSignalConceptCandidates(account.id, token, 500),
      ]);
      setVersion(registry.version ?? 0);
      setConcepts(registry.concepts ?? []);
      setCandidates(drift.candidates ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load signal concept data');
    } finally {
      setLoading(false);
    }
  }, [account, token]);

  const promoteCandidate = useCallback(
    async (rawToken: string) => {
      if (!account || !token) return;
      const canonical = (canonicalDraftByRaw[rawToken] ?? rawToken).trim();
      if (!canonical) {
        return;
      }
      setActionLoading(true);
      setMessage(null);
      try {
        const result = await promoteSignalConceptCandidate(account.id, token, rawToken, canonical);
        setCanonicalDraftByRaw((prev) => {
          const next = { ...prev };
          delete next[rawToken];
          return next;
        });
        await refresh();
        const observedIds = (result.observedAccountIds ?? []).join(', ');
        setMessage(
          `Promoted ${rawToken} -> ${canonical}. migrated=${
            result.migratedStoredAccounts ?? 0
          } replayObserved=${result.replayedObservedAccounts ?? 0} replayOwners=${
            result.replayedContextualOwners ?? 0
          } observedIds=${observedIds || 'none'}`
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to promote candidate');
      } finally {
        setActionLoading(false);
      }
    },
    [account, token, canonicalDraftByRaw, refresh]
  );

  const rejectCandidate = useCallback(
    async (rawToken: string) => {
      if (!account || !token) return;
      setActionLoading(true);
      setMessage(null);
      try {
        await rejectSignalConceptCandidate(account.id, token, rawToken);
        setCanonicalDraftByRaw((prev) => {
          const next = { ...prev };
          delete next[rawToken];
          return next;
        });
        await refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to reject candidate');
      } finally {
        setActionLoading(false);
      }
    },
    [account, token, refresh]
  );

  useEffect(() => {
    if (!account || !token) {
      setConcepts([]);
      setCandidates([]);
      return;
    }
    void refresh();
  }, [account, token, refresh]);

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
          <ThemedText type="title">Signal Concepts</ThemedText>
        </View>

        <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <ThemedText style={[styles.mutedText, { color: muted }]}>
            {`Registry v${version} | concepts=${concepts.length} | candidates=${candidates.length}`}
          </ThemedText>
          <View style={styles.toolbarRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              placeholder="Search concepts or candidates"
              placeholderTextColor={muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => void refresh()}
              disabled={loading || actionLoading}
              style={[styles.smallButton, { borderColor: cardBorder }]}
            >
              <ThemedText style={[styles.mutedText, { color: muted }]}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </ThemedText>
            </Pressable>
          </View>
          {message ? <ThemedText style={[styles.mutedText, { color: muted }]}>{message}</ThemedText> : null}
        </View>

        <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <ThemedText type="defaultSemiBold">
            Drift Candidates ({filteredCandidates.length}/{candidates.length})
          </ThemedText>
          {loading && candidates.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <ThemedText>Loading candidates...</ThemedText>
            </View>
          ) : filteredCandidates.length === 0 ? (
            <ThemedText style={[styles.mutedText, { color: muted }]}>No candidates found.</ThemedText>
          ) : (
            filteredCandidates.map((candidate) => {
              const draft =
                canonicalDraftByRaw[candidate.rawToken] ??
                candidate.suggestedCanonical ??
                candidate.rawToken;
              return (
                <View key={candidate.rawToken} style={styles.item}>
                  <ThemedText style={styles.itemToken}>{candidate.rawToken}</ThemedText>
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {`seen=${candidate.seenCount} source=${candidate.lastSource ?? 'unknown'}`}
                  </ThemedText>
                  {candidate.suggestedCanonical ? (
                    <ThemedText style={[styles.mutedText, { color: muted }]}>
                      {`suggested=${candidate.suggestedCanonical} score=${
                        Number.isFinite(candidate.suggestionScore)
                          ? (candidate.suggestionScore as number).toFixed(2)
                          : 'n/a'
                      } ${candidate.autoReady ? 'auto-ready' : ''}`}
                    </ThemedText>
                  ) : null}
                  {candidate.exampleContexts.length > 0 ? (
                    <ThemedText style={[styles.mutedText, { color: muted }]}>
                      {`example: ${candidate.exampleContexts[0]}`}
                    </ThemedText>
                  ) : null}
                  {candidate.observedAccounts && candidate.observedAccounts.length > 0 ? (
                    <ThemedText style={[styles.mutedText, { color: muted }]}>
                      {`observed: ${candidate.observedAccounts
                        .slice(0, 4)
                        .map(
                          (observation) =>
                            `${observation.accountId}:${observation.intent ?? 'SELF'}x${
                              observation.seenCount
                            }@${Number.isFinite(observation.averageValence)
                              ? observation.averageValence.toFixed(2)
                              : '0.00'}`
                        )
                        .join(', ')}`}
                    </ThemedText>
                  ) : (
                    <ThemedText style={[styles.mutedText, { color: muted }]}>
                      observed: none
                    </ThemedText>
                  )}
                  <TextInput
                    value={draft}
                    editable={!actionLoading}
                    onChangeText={(text) =>
                      setCanonicalDraftByRaw((prev) => ({ ...prev, [candidate.rawToken]: text }))
                    }
                    style={styles.searchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="canonical_token"
                    placeholderTextColor={muted}
                  />
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => void promoteCandidate(candidate.rawToken)}
                      disabled={actionLoading}
                      style={[styles.smallButton, { borderColor: cardBorder }]}
                    >
                      <ThemedText style={[styles.mutedText, { color: muted }]}>Promote</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => void rejectCandidate(candidate.rawToken)}
                      disabled={actionLoading}
                      style={[styles.smallButton, { borderColor: cardBorder }]}
                    >
                      <ThemedText style={[styles.mutedText, { color: muted }]}>Reject</ThemedText>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <ThemedText type="defaultSemiBold">
            Canonical Concepts ({filteredConcepts.length}/{concepts.length})
          </ThemedText>
          {loading && concepts.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <ThemedText>Loading concepts...</ThemedText>
            </View>
          ) : filteredConcepts.length === 0 ? (
            <ThemedText style={[styles.mutedText, { color: muted }]}>No concepts found.</ThemedText>
          ) : (
            filteredConcepts.map((concept) => (
              <View key={concept.concept} style={styles.item}>
                <ThemedText style={styles.itemToken}>{concept.concept}</ThemedText>
                <ThemedText style={[styles.mutedText, { color: muted }]}>
                  {`aliases=${concept.aliases.length} parents=${Object.keys(concept.parents ?? {}).length}`}
                </ThemedText>
                {concept.aliases.length > 0 ? (
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {`aka: ${concept.aliases.join(', ')}`}
                  </ThemedText>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 28,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mutedText: {
    fontSize: 12,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  item: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  itemToken: {
    fontSize: 13,
    fontWeight: '600',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.32)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  smallButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
