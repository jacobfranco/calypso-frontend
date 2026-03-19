import AsyncStorage from '@react-native-async-storage/async-storage';

export const FACECARD_MAX_PHOTOS = 6;

const FACECARD_PHOTO_STORAGE_KEY = 'calypso.facecard.photos.v1';

type FacecardPhotoSet = {
  uris: string[];
  updatedAt: number;
};

type FacecardPhotoMap = Record<string, FacecardPhotoSet>;

function clampIndex(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeUris(uris: string[]): string[] {
  const out: string[] = [];
  for (const uri of uris) {
    const trimmed = uri?.trim();
    if (!trimmed) continue;
    if (out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= FACECARD_MAX_PHOTOS) break;
  }
  return out;
}

export function upsertFacecardPhotoUriAtIndex(
  uris: string[],
  uri: string,
  index: number
): string[] {
  const trimmed = uri?.trim();
  const normalized = normalizeUris(uris);
  if (!trimmed) return normalized;
  const deduped = normalized.filter((item) => item !== trimmed);
  const insertAt = clampIndex(index, 0, deduped.length);
  deduped.splice(insertAt, 0, trimmed);
  return normalizeUris(deduped);
}

export function reorderFacecardPhotoUris(
  uris: string[],
  fromIndex: number,
  toIndex: number
): string[] {
  const normalized = normalizeUris(uris);
  if (normalized.length <= 1) return normalized;
  if (
    fromIndex < 0
    || fromIndex >= normalized.length
    || toIndex < 0
    || toIndex >= normalized.length
    || fromIndex === toIndex
  ) {
    return normalized;
  }
  const next = [...normalized];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function removeFacecardPhotoUriAtIndex(uris: string[], index: number): string[] {
  const normalized = normalizeUris(uris);
  if (index < 0 || index >= normalized.length) return normalized;
  return normalized.filter((_, idx) => idx !== index);
}

async function readPhotoMap(): Promise<FacecardPhotoMap> {
  const raw = await AsyncStorage.getItem(FACECARD_PHOTO_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as FacecardPhotoMap;
    if (!parsed || typeof parsed !== 'object') return {};
    const normalized: FacecardPhotoMap = {};
    Object.entries(parsed).forEach(([accountId, set]) => {
      if (!set || !Array.isArray(set.uris)) return;
      const uris = normalizeUris(set.uris);
      if (!uris.length) return;
      normalized[accountId] = {
        uris,
        updatedAt: typeof set.updatedAt === 'number' ? set.updatedAt : Date.now(),
      };
    });
    return normalized;
  } catch {
    return {};
  }
}

async function writePhotoMap(map: FacecardPhotoMap): Promise<void> {
  await AsyncStorage.setItem(FACECARD_PHOTO_STORAGE_KEY, JSON.stringify(map));
}

export async function getFacecardPhotoUris(accountId: string): Promise<string[]> {
  const key = accountId?.trim();
  if (!key) return [];
  const map = await readPhotoMap();
  return map[key]?.uris ?? [];
}

export async function getFacecardPhotoUrisByAccountIds(
  accountIds: string[]
): Promise<Record<string, string[]>> {
  const ids = Array.from(new Set(accountIds.map((value) => value?.trim()).filter(Boolean)));
  if (!ids.length) return {};
  const map = await readPhotoMap();
  const out: Record<string, string[]> = {};
  ids.forEach((id) => {
    const uris = map[id]?.uris;
    if (uris?.length) {
      out[id] = [...uris];
    }
  });
  return out;
}

export async function saveFacecardPhotoUris(
  accountId: string,
  uris: string[]
): Promise<string[]> {
  const key = accountId?.trim();
  if (!key) throw new Error('accountId required');
  const normalized = normalizeUris(uris);
  const map = await readPhotoMap();
  if (!normalized.length) {
    delete map[key];
  } else {
    map[key] = { uris: normalized, updatedAt: Date.now() };
  }
  await writePhotoMap(map);
  return normalized;
}
