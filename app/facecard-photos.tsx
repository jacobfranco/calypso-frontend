import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { FacecardPhotoGrid } from '@/components/facecard-photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import {
  FACECARD_MAX_PHOTOS,
  getFacecardPhotoUris,
  removeFacecardPhotoUriAtIndex,
  reorderFacecardPhotoUris,
  saveFacecardPhotoUris,
  upsertFacecardPhotoUriAtIndex,
} from '@/lib/facecard-photos';
import { pickPhotoFromLibrary } from '@/lib/image-picker';
import { useThemeColor } from '@/hooks/use-theme-color';

const FACECARD_MIN_PHOTOS = 1;

export default function FacecardPhotosScreen() {
  const router = useRouter();
  const { account } = useAuth();
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
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
    { light: 'rgba(0, 0, 0, 0.02)', dark: 'rgba(255, 255, 255, 0.04)' },
    'background'
  );
  const muted = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.6)', dark: 'rgba(255, 255, 255, 0.6)' },
    'text'
  );
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');

  const loadPhotos = useCallback(async () => {
    if (!account) {
      setPhotoUris([]);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const existing = await getFacecardPhotoUris(account.id);
      setPhotoUris(existing);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load facecard photos');
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  useFocusEffect(
    useCallback(() => {
      loadPhotos();
      return () => {};
    }, [loadPhotos])
  );

  const pickPhotoAt = useCallback(async (index: number) => {
    setMessage(null);
    setPicking(true);
    try {
      const uri = await pickPhotoFromLibrary();
      if (!uri) return;
      setPhotoUris((prev) => upsertFacecardPhotoUriAtIndex(prev, uri, index));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to pick photo');
    } finally {
      setPicking(false);
    }
  }, []);

  const removePhotoAt = useCallback((index: number) => {
    setPhotoUris((prev) => {
      if (prev.length <= FACECARD_MIN_PHOTOS) return prev;
      return removeFacecardPhotoUriAtIndex(prev, index);
    });
  }, []);

  const reorderPhotos = useCallback((fromIndex: number, toIndex: number) => {
    setPhotoUris((prev) => reorderFacecardPhotoUris(prev, fromIndex, toIndex));
  }, []);

  const savePhotos = useCallback(async () => {
    if (!account) return;
    if (photoUris.length < FACECARD_MIN_PHOTOS) {
      setMessage('At least one facecard photo is required.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveFacecardPhotoUris(account.id, photoUris);
      setPhotoUris(saved);
      setMessage('Facecard photos updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save facecard photos');
    } finally {
      setSaving(false);
    }
  }, [account, photoUris]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={[styles.backButton, { borderColor }]}>
            <ThemedText style={[styles.backButtonText, { color: muted }]}>Back</ThemedText>
          </Pressable>
          <ThemedText type="title">Facecard photos</ThemedText>
        </View>
        <View style={styles.header}>
          <ThemedText style={[styles.mutedText, { color: muted }]}>
            Upload up to {FACECARD_MAX_PHOTOS} photos. The first photo in this grid shows first.
          </ThemedText>
        </View>

        {!account ? (
          <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
            <ThemedText style={[styles.mutedText, { color: muted }]}>Log in to edit photos.</ThemedText>
          </View>
        ) : (
          <>
            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <ThemedText>Loading photos…</ThemedText>
              </View>
            )}

            {message ? (
              <View style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}>
                <ThemedText style={[styles.mutedText, { color: muted }]}>{message}</ThemedText>
              </View>
            ) : null}

            <FacecardPhotoGrid
              photoUris={photoUris}
              maxPhotos={FACECARD_MAX_PHOTOS}
              disabled={picking || saving}
              cardBorderColor={cardBorder}
              cardBackgroundColor={cardBg}
              mutedTextColor={muted}
              onPickPhotoAt={pickPhotoAt}
              onRemovePhotoAt={removePhotoAt}
              onReorderPhotos={reorderPhotos}
            />

            {picking && (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <ThemedText>Opening photos…</ThemedText>
              </View>
            )}

            <ThemedText style={[styles.mutedText, { color: muted }]}>
              {photoUris.length}/{FACECARD_MAX_PHOTOS} photos selected
            </ThemedText>

            <Pressable
              onPress={savePhotos}
              disabled={saving || picking || photoUris.length < FACECARD_MIN_PHOTOS}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: primaryBg },
                (pressed || saving || picking || photoUris.length < FACECARD_MIN_PHOTOS)
                && styles.buttonDisabled,
              ]}
            >
              <ThemedText style={[styles.primaryButtonText, { color: primaryText }]}>
                {saving ? 'Saving…' : 'Save photos'}
              </ThemedText>
            </Pressable>
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
  header: {
    gap: 8,
  },
  backButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backButtonText: {
    fontWeight: '600',
  },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  mutedText: {
    fontSize: 13,
  },
});
