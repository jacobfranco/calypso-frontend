import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  actOnSignalConceptCandidate,
  fetchSignalConceptCandidates,
  fetchBlockedSignalConceptCandidates,
  fetchSignalDisambiguationCandidates,
  fetchSignalConceptRegistry,
  SignalConcept,
  SignalConceptCandidate,
  SignalDisambiguationCandidate,
} from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function AdminSignalConceptsScreen() {
  const router = useRouter();
  const { account, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [concepts, setConcepts] = useState<SignalConcept[]>([]);
  const [candidates, setCandidates] = useState<SignalConceptCandidate[]>([]);
  const [blockedCandidates, setBlockedCandidates] = useState<SignalConceptCandidate[]>([]);
  const [disambiguationCandidates, setDisambiguationCandidates] = useState<SignalDisambiguationCandidate[]>([]);
  const [version, setVersion] = useState<number>(0);
  const [query, setQuery] = useState('');
  const [canonicalDraftByRaw, setCanonicalDraftByRaw] = useState<Record<string, string>>({});
  const [parentDraftByRaw, setParentDraftByRaw] = useState<Record<string, string>>({});
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [mapPickerRawToken, setMapPickerRawToken] = useState<string | null>(null);
  const [mapPickerSearch, setMapPickerSearch] = useState('');
  const [canonicalSectionY, setCanonicalSectionY] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

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
  const modalCardBg = useThemeColor(
    { light: '#ffffff', dark: '#111827' },
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
      if ((concept.category ?? '').toLowerCase().includes(normalizedQuery)) {
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
      if ((candidate.suggestedCategory ?? '').toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      return false;
    });
  }, [candidates, normalizedQuery]);

  const filteredBlockedCandidates = useMemo(() => {
    if (!normalizedQuery) {
      return blockedCandidates;
    }
    return blockedCandidates.filter((candidate) => {
      if (candidate.rawToken.toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      if ((candidate.suggestedCanonical ?? '').toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      if ((candidate.suggestedCategory ?? '').toLowerCase().includes(normalizedQuery)) {
        return true;
      }
      return false;
    });
  }, [blockedCandidates, normalizedQuery]);

  const canonicalConceptSet = useMemo(() => {
    const out = new Set<string>();
    concepts.forEach((concept) => {
      if (!concept?.concept) return;
      out.add(concept.concept.trim().toLowerCase());
    });
    return out;
  }, [concepts]);

  const mapPickerSelectedCanonical = useMemo(() => {
    if (!mapPickerRawToken) return '';
    return (canonicalDraftByRaw[mapPickerRawToken] ?? '').trim().toLowerCase();
  }, [mapPickerRawToken, canonicalDraftByRaw]);

  const mapPickerCandidate = useMemo(() => {
    if (!mapPickerRawToken) return null;
    return candidates.find((candidate) => candidate.rawToken === mapPickerRawToken) ?? null;
  }, [candidates, mapPickerRawToken]);

  const mapPickerSuggestedCanonical = useMemo(() => {
    const suggested = mapPickerCandidate?.suggestedCanonical?.trim().toLowerCase();
    if (!suggested) return null;
    return canonicalConceptSet.has(suggested) ? suggested : null;
  }, [mapPickerCandidate, canonicalConceptSet]);

  const normalizedMapPickerSearch = mapPickerSearch.trim().toLowerCase();
  const mapPickerConcepts = useMemo(() => {
    const source = concepts;
    if (!normalizedMapPickerSearch) {
      return source.slice(0, 200);
    }
    return source
      .filter((concept) => {
        if (concept.concept.toLowerCase().includes(normalizedMapPickerSearch)) {
          return true;
        }
        if (concept.aliases.some((alias) => alias.toLowerCase().includes(normalizedMapPickerSearch))) {
          return true;
        }
        return false;
      })
      .slice(0, 200);
  }, [concepts, normalizedMapPickerSearch]);

  const confirmAction = useCallback((title: string, description: string) => {
    return new Promise<boolean>((resolve) => {
      Alert.alert(title, description, [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ]);
    });
  }, []);

  const parentConceptsForCandidate = useCallback(
    (candidate?: SignalConceptCandidate | null) => {
      if (!candidate?.rawToken) return [];
      const draft = (parentDraftByRaw[candidate.rawToken] ?? '').trim();
      const source = draft || (candidate.suggestedParents ?? []).join(', ');
      return source
        .split(',')
        .map((item) => item.trim().toLowerCase().replace(/[\s-]+/g, '_'))
        .filter(Boolean);
    },
    [parentDraftByRaw]
  );

  const refresh = useCallback(async () => {
    if (!account || !token) return;
    setLoading(true);
    setMessage(null);
    try {
      const [registry, drift, blocked, disambiguation] = await Promise.all([
        fetchSignalConceptRegistry(account.id, token),
        fetchSignalConceptCandidates(account.id, token, 500),
        fetchBlockedSignalConceptCandidates(account.id, token, 500),
        fetchSignalDisambiguationCandidates(account.id, token, 200),
      ]);
      setVersion(registry.version ?? 0);
      setConcepts(registry.concepts ?? []);
      setCandidates(drift.candidates ?? []);
      setBlockedCandidates(blocked.candidates ?? []);
      setDisambiguationCandidates(disambiguation.candidates ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load signal concept data');
    } finally {
      setLoading(false);
    }
  }, [account, token]);

  const createCanonicalCandidate = useCallback(
    async (rawToken: string) => {
      if (!account || !token) return;
      const candidate = candidates.find((entry) => entry.rawToken === rawToken);
      const category = candidate?.suggestedCategory;
      const parentConcepts = parentConceptsForCandidate(candidate);
      const confirmed = await confirmAction(
        'Create Canonical Concept?',
        `Create a new canonical concept for "${rawToken}" and retroactively backfill affected users?`
      );
      if (!confirmed) {
        return;
      }
      setActionLoading(true);
      setMessage(null);
      try {
        const result = await actOnSignalConceptCandidate(
          account.id,
          token,
          'create',
          rawToken,
          rawToken,
          category,
          parentConcepts
        );
        setCanonicalDraftByRaw((prev) => {
          const next = { ...prev };
          delete next[rawToken];
          return next;
        });
        setParentDraftByRaw((prev) => {
          const next = { ...prev };
          delete next[rawToken];
          return next;
        });
        await refresh();
        const observedIds = (result.observedAccountIds ?? []).join(', ');
        const parents = (result.parentConcepts ?? parentConcepts).join(', ');
        setMessage(
          `Created canonical ${result.canonicalToken ?? rawToken}. migrated=${
            result.migratedStoredAccounts ?? 0
          } replayObserved=${result.replayedObservedAccounts ?? 0} replayOwners=${
            result.replayedContextualOwners ?? 0
          } category=${result.category ?? category ?? 'other'} parents=${parents || 'none'} observedIds=${
            observedIds || 'none'
          }`
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to create canonical concept');
      } finally {
        setActionLoading(false);
      }
    },
    [account, token, candidates, confirmAction, parentConceptsForCandidate, refresh]
  );

  const openMapPicker = useCallback(
    (rawToken: string) => {
      const candidate = candidates.find((entry) => entry.rawToken === rawToken);
      const suggested = candidate?.suggestedCanonical?.trim().toLowerCase();
      setCanonicalDraftByRaw((prev) => {
        const next = { ...prev };
        const current = (next[rawToken] ?? '').trim().toLowerCase();
        if (current && canonicalConceptSet.has(current)) {
          next[rawToken] = current;
          return next;
        }
        if (suggested && canonicalConceptSet.has(suggested)) {
          next[rawToken] = suggested;
          return next;
        }
        return next;
      });
      setMapPickerRawToken(rawToken);
      setMapPickerSearch('');
      setMapPickerVisible(true);
    },
    [candidates, canonicalConceptSet]
  );

  const closeMapPicker = useCallback(() => {
    setMapPickerVisible(false);
    setMapPickerRawToken(null);
    setMapPickerSearch('');
  }, []);

  const mapCandidateToExisting = useCallback(
    async (rawToken: string, canonicalOverride?: string) => {
      if (!account || !token) return false;
      const canonical = (canonicalOverride ?? canonicalDraftByRaw[rawToken] ?? '').trim().toLowerCase();
      if (!canonical) {
        Alert.alert('Pick a canonical concept', 'Choose an existing canonical concept to map to.');
        return false;
      }
      if (!canonicalConceptSet.has(canonical)) {
        setMessage(`"${canonical}" is not an existing canonical concept. Use Create Canonical instead.`);
        return false;
      }
      const candidate = candidates.find((entry) => entry.rawToken === rawToken);
      const canonicalConcept = concepts.find((entry) => entry.concept.trim().toLowerCase() === canonical);
      const category = canonicalConcept?.category ?? candidate?.suggestedCategory;
      const confirmed = await confirmAction(
        'Map Candidate to Canonical?',
        `Map "${rawToken}" to existing canonical "${canonical}" and backfill affected users?`
      );
      if (!confirmed) {
        return false;
      }
      setActionLoading(true);
      setMessage(null);
      try {
        const result = await actOnSignalConceptCandidate(account.id, token, 'map', rawToken, canonical, category);
        setCanonicalDraftByRaw((prev) => {
          const next = { ...prev };
          delete next[rawToken];
          return next;
        });
        await refresh();
        const observedIds = (result.observedAccountIds ?? []).join(', ');
        setMessage(
          `Mapped ${rawToken} -> ${canonical}. migrated=${
            result.migratedStoredAccounts ?? 0
          } replayObserved=${result.replayedObservedAccounts ?? 0} replayOwners=${
            result.replayedContextualOwners ?? 0
          } category=${result.category ?? category ?? 'other'} observedIds=${observedIds || 'none'}`
        );
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to map candidate');
        return false;
      } finally {
        setActionLoading(false);
      }
    },
    [account, token, canonicalDraftByRaw, canonicalConceptSet, candidates, concepts, confirmAction, refresh]
  );

  const jumpToCanonicalList = useCallback(() => {
    const seed = mapPickerSelectedCanonical || normalizedMapPickerSearch;
    if (seed) {
      setQuery(seed);
    }
    closeMapPicker();
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, canonicalSectionY - 24),
        animated: true,
      });
    });
  }, [
    canonicalSectionY,
    closeMapPicker,
    mapPickerSelectedCanonical,
    normalizedMapPickerSearch,
  ]);

  const confirmMapFromPicker = useCallback(async () => {
    if (!mapPickerRawToken) return;
    const success = await mapCandidateToExisting(mapPickerRawToken, mapPickerSelectedCanonical);
    if (success) {
      closeMapPicker();
    }
  }, [closeMapPicker, mapCandidateToExisting, mapPickerRawToken, mapPickerSelectedCanonical]);

  const rejectCandidate = useCallback(
    async (rawToken: string) => {
      if (!account || !token) return;
      const confirmed = await confirmAction(
        'Reject Candidate?',
        `Reject "${rawToken}" and remove it from the drift queue?`
      );
      if (!confirmed) {
        return;
      }
      setActionLoading(true);
      setMessage(null);
      try {
        await actOnSignalConceptCandidate(account.id, token, 'reject', rawToken);
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
    [account, token, confirmAction, refresh]
  );

  const blockCandidate = useCallback(
    async (rawToken: string) => {
      if (!account || !token) return;
      const confirmed = await confirmAction(
        'Block Candidate?',
        `Block "${rawToken}" so new observations are ignored until it is unblocked?`
      );
      if (!confirmed) {
        return;
      }
      setActionLoading(true);
      setMessage(null);
      try {
        await actOnSignalConceptCandidate(account.id, token, 'block', rawToken);
        setCanonicalDraftByRaw((prev) => {
          const next = { ...prev };
          delete next[rawToken];
          return next;
        });
        await refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to block candidate');
      } finally {
        setActionLoading(false);
      }
    },
    [account, token, confirmAction, refresh]
  );

  const unblockCandidate = useCallback(
    async (rawToken: string) => {
      if (!account || !token) return;
      const confirmed = await confirmAction(
        'Unblock Candidate?',
        `Unblock "${rawToken}" and return it to the drift queue?`
      );
      if (!confirmed) {
        return;
      }
      setActionLoading(true);
      setMessage(null);
      try {
        await actOnSignalConceptCandidate(account.id, token, 'unblock', rawToken);
        setCanonicalDraftByRaw((prev) => {
          const next = { ...prev };
          delete next[rawToken];
          return next;
        });
        await refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to unblock candidate');
      } finally {
        setActionLoading(false);
      }
    },
    [account, token, confirmAction, refresh]
  );

  useEffect(() => {
    if (!account || !token) {
      setConcepts([]);
      setCandidates([]);
      setBlockedCandidates([]);
      setDisambiguationCandidates([]);
      return;
    }
    void refresh();
  }, [account, token, refresh]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
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
            {`Registry v${version} | concepts=${concepts.length} | candidates=${candidates.length} | blocked=${blockedCandidates.length} | disambiguation=${disambiguationCandidates.length}`}
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
              const selectedMapTarget = (canonicalDraftByRaw[candidate.rawToken] ?? '').trim().toLowerCase();
              return (
                <View key={candidate.rawToken} style={styles.item}>
                  <ThemedText style={styles.itemToken}>{candidate.rawToken}</ThemedText>
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {`seen=${candidate.seenCount} source=${candidate.lastSource ?? 'unknown'}`}
                  </ThemedText>
                  {candidate.suggestedCategory ? (
                    <ThemedText style={[styles.mutedText, { color: muted }]}>
                      {`category=${candidate.suggestedCategory}`}
                    </ThemedText>
                  ) : null}
                  {candidate.suggestedParents && candidate.suggestedParents.length > 0 ? (
                    <ThemedText style={[styles.mutedText, { color: muted }]}>
                      {`suggested_parents=${candidate.suggestedParents.join(', ')}`}
                    </ThemedText>
                  ) : null}
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
                  {selectedMapTarget ? (
                    <ThemedText style={[styles.mutedText, { color: muted }]}>
                      {`map_target=${selectedMapTarget}`}
                    </ThemedText>
                  ) : null}
                  <TextInput
                    value={parentDraftByRaw[candidate.rawToken] ?? ''}
                    onChangeText={(value) =>
                      setParentDraftByRaw((prev) => ({ ...prev, [candidate.rawToken]: value }))
                    }
                    style={[styles.searchInput, { borderColor: cardBorder }]}
                    placeholder="Parent concepts, e.g. video_games, music"
                    placeholderTextColor={muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => void createCanonicalCandidate(candidate.rawToken)}
                      disabled={actionLoading}
                      style={[styles.smallButton, { borderColor: cardBorder }]}
                    >
                      <ThemedText style={[styles.mutedText, { color: muted }]}>Create Canonical</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => openMapPicker(candidate.rawToken)}
                      disabled={actionLoading}
                      style={[styles.smallButton, { borderColor: cardBorder }]}
                    >
                      <ThemedText style={[styles.mutedText, { color: muted }]}>Map to Existing</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => void rejectCandidate(candidate.rawToken)}
                      disabled={actionLoading}
                      style={[styles.smallButton, { borderColor: cardBorder }]}
                    >
                      <ThemedText style={[styles.mutedText, { color: muted }]}>Reject</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => void blockCandidate(candidate.rawToken)}
                      disabled={actionLoading}
                      style={[styles.smallButton, { borderColor: cardBorder }]}
                    >
                      <ThemedText style={[styles.mutedText, { color: muted }]}>Block</ThemedText>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <ThemedText type="defaultSemiBold">
            Blocked Candidates ({filteredBlockedCandidates.length}/{blockedCandidates.length})
          </ThemedText>
          {loading && blockedCandidates.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <ThemedText>Loading blocked candidates...</ThemedText>
            </View>
          ) : filteredBlockedCandidates.length === 0 ? (
            <ThemedText style={[styles.mutedText, { color: muted }]}>No blocked candidates found.</ThemedText>
          ) : (
            filteredBlockedCandidates.map((candidate) => (
              <View key={`blocked-${candidate.rawToken}`} style={styles.item}>
                <ThemedText style={styles.itemToken}>{candidate.rawToken}</ThemedText>
                <ThemedText style={[styles.mutedText, { color: muted }]}>
                  {`seen=${candidate.seenCount} source=${candidate.lastSource ?? 'unknown'} blockedAt=${
                    candidate.blockedAt ? new Date(candidate.blockedAt).toLocaleString() : 'unknown'
                  }`}
                </ThemedText>
                {candidate.suggestedCategory ? (
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {`category=${candidate.suggestedCategory}`}
                  </ThemedText>
                ) : null}
                {candidate.suggestedCanonical ? (
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {`suggested=${candidate.suggestedCanonical} score=${
                      Number.isFinite(candidate.suggestionScore)
                        ? (candidate.suggestionScore as number).toFixed(2)
                        : 'n/a'
                    }`}
                  </ThemedText>
                ) : null}
                {candidate.exampleContexts.length > 0 ? (
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {`example: ${candidate.exampleContexts[0]}`}
                  </ThemedText>
                ) : null}
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => void unblockCandidate(candidate.rawToken)}
                    disabled={actionLoading}
                    style={[styles.smallButton, { borderColor: cardBorder }]}
                  >
                    <ThemedText style={[styles.mutedText, { color: muted }]}>Unblock</ThemedText>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <ThemedText type="defaultSemiBold">
            Disambiguation Followups ({disambiguationCandidates.length})
          </ThemedText>
          {disambiguationCandidates.length === 0 ? (
            <ThemedText style={[styles.mutedText, { color: muted }]}>
              No pending disambiguation followups.
            </ThemedText>
          ) : (
            disambiguationCandidates.map((candidate) => (
              <View key={candidate.key} style={styles.item}>
                <ThemedText style={styles.itemToken}>{candidate.term}</ThemedText>
                <ThemedText style={[styles.mutedText, { color: muted }]}>
                  {`seen=${candidate.seenCount} source=${candidate.source ?? 'unknown'} prompt=${
                    candidate.promptId ?? 'unknown'
                  }`}
                </ThemedText>
                <ThemedText style={[styles.mutedText, { color: muted }]}>
                  {candidate.question}
                </ThemedText>
                {candidate.context ? (
                  <ThemedText style={[styles.mutedText, { color: muted }]}>
                    {`context: ${candidate.context}`}
                  </ThemedText>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View
          style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}
          onLayout={(event) => setCanonicalSectionY(event.nativeEvent.layout.y)}
        >
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
                  {`category=${concept.category ?? 'other'} aliases=${concept.aliases.length} parents=${
                    Object.keys(concept.parents ?? {}).length
                  }`}
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
      <Modal visible={mapPickerVisible} transparent animationType="fade" onRequestClose={closeMapPicker}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { borderColor: cardBorder, backgroundColor: modalCardBg }]}>
            <ThemedText type="defaultSemiBold">Map to Existing Canonical</ThemedText>
            <ThemedText style={[styles.mutedText, { color: muted }]}>
              {mapPickerRawToken ? `raw=${mapPickerRawToken}` : 'Pick a canonical concept to map to.'}
            </ThemedText>
            {mapPickerCandidate?.suggestedCategory ? (
              <ThemedText style={[styles.mutedText, { color: muted }]}>
                {`suggested_category=${mapPickerCandidate.suggestedCategory}`}
              </ThemedText>
            ) : null}
            <TextInput
              value={mapPickerSearch}
              onChangeText={setMapPickerSearch}
              style={[styles.searchInput, styles.modalSearchInput]}
              placeholder="Search canonical concepts"
              placeholderTextColor={muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {mapPickerSuggestedCanonical ? (
              <Pressable
                onPress={() => {
                  if (!mapPickerRawToken) return;
                  setCanonicalDraftByRaw((prev) => ({
                    ...prev,
                    [mapPickerRawToken]: mapPickerSuggestedCanonical,
                  }));
                }}
                style={[styles.suggestedButton, { borderColor: cardBorder }]}
              >
                <ThemedText style={[styles.mutedText, { color: muted }]}>
                  {`Use suggested: ${mapPickerSuggestedCanonical}`}
                </ThemedText>
              </Pressable>
            ) : null}
            <ThemedText style={[styles.mutedText, { color: muted }]}>
              {`selected=${mapPickerSelectedCanonical || 'none'}`}
            </ThemedText>
            <ScrollView
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
              keyboardShouldPersistTaps="handled"
            >
              {mapPickerConcepts.length === 0 ? (
                <ThemedText style={[styles.mutedText, { color: muted }]}>No canonical concepts found.</ThemedText>
              ) : (
                mapPickerConcepts.map((concept) => {
                  const conceptToken = concept.concept.trim().toLowerCase();
                  const selected = conceptToken === mapPickerSelectedCanonical;
                  return (
                    <Pressable
                      key={concept.concept}
                      onPress={() => {
                        if (!mapPickerRawToken) return;
                        setCanonicalDraftByRaw((prev) => ({ ...prev, [mapPickerRawToken]: conceptToken }));
                      }}
                      style={[
                        styles.modalListItem,
                        { borderColor: cardBorder, backgroundColor: modalCardBg },
                        selected ? styles.modalListItemSelected : undefined,
                      ]}
                    >
                      <ThemedText style={styles.itemToken}>{concept.concept}</ThemedText>
                      {concept.category ? (
                        <ThemedText style={[styles.mutedText, { color: muted }]}>
                          {`category=${concept.category}`}
                        </ThemedText>
                      ) : null}
                      {concept.aliases.length > 0 ? (
                        <ThemedText style={[styles.mutedText, { color: muted }]}>
                          {`aka: ${concept.aliases.slice(0, 3).join(', ')}`}
                        </ThemedText>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.actionRow}>
              <Pressable
                onPress={closeMapPicker}
                style={[styles.smallButton, { borderColor: cardBorder }]}
                disabled={actionLoading}
              >
                <ThemedText style={[styles.mutedText, { color: muted }]}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={jumpToCanonicalList}
                style={[styles.smallButton, { borderColor: cardBorder }]}
                disabled={actionLoading}
              >
                <ThemedText style={[styles.mutedText, { color: muted }]}>View Full List</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => void confirmMapFromPicker()}
                style={[styles.smallButton, { borderColor: cardBorder }]}
                disabled={actionLoading}
              >
                <ThemedText style={[styles.mutedText, { color: muted }]}>
                  {actionLoading ? 'Mapping...' : 'Map Selected'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  modalSearchInput: {
    flex: 0,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  smallButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  suggestedButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.84)',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    maxHeight: '88%',
  },
  modalList: {
    maxHeight: 330,
  },
  modalListContent: {
    gap: 8,
    paddingBottom: 6,
  },
  modalListItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  modalListItemSelected: {
    borderColor: 'rgba(34, 197, 94, 0.9)',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
});
