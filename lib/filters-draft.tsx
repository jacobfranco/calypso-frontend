import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { Filters, fetchFilters, postFilters } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type FiltersDraftStatus = 'idle' | 'loading' | 'saving' | 'error';

type FiltersDraftContextValue = {
  status: FiltersDraftStatus;
  message: string | null;
  draft: Filters | null;
  dirty: boolean;
  refresh: () => Promise<void>;
  updateDraft: (next: Filters) => void;
  saveAll: () => Promise<void>;
  clearMessage: () => void;
};

const FiltersDraftContext = createContext<FiltersDraftContextValue | null>(null);

function validateFilters(filters: Filters): string[] {
  const missing: string[] = [];

  if (!filters.relationshipMode?.self) missing.push('relationship mode');

  const genderSelf = filters.gender?.self;
  const genderSeeking = filters.gender?.seeking ?? [];
  if (!genderSelf && genderSeeking.length === 0) missing.push('gender');

  if (filters.age?.min === undefined || filters.age?.max === undefined) missing.push('age range');

  if (
    filters.location?.lat === undefined ||
    filters.location?.lon === undefined ||
    filters.location?.radiusKm === undefined
  ) {
    missing.push('location');
  }
  if (filters.location?.scope === 'COUNTRY' && !filters.location?.countryCode) {
    missing.push('location (country)');
  }

  if (!filters.religion?.self) missing.push('religion');
  if (!filters.politics?.self) missing.push('politics');

  return missing;
}

export function FiltersDraftProvider({ children }: { children: React.ReactNode }) {
  const { account, token } = useAuth();

  const [status, setStatus] = useState<FiltersDraftStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Filters | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setMessage(null);
    setDraft(null);
    setDirty(false);
    setLoadedFor(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!account || !token) return;
    setStatus('loading');
    setMessage(null);
    try {
      const existing = await fetchFilters(account.id, token);
      setDraft(existing ?? {});
      setDirty(false);
      setLoadedFor(`${account.id}:${token}`);
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to load filters');
    }
  }, [account, token]);

  useEffect(() => {
    if (!account || !token) {
      reset();
      return;
    }
    if (loadedFor === `${account.id}:${token}`) return;
    refresh();
  }, [account, token, loadedFor, refresh, reset]);

  const updateDraft = useCallback((next: Filters) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const saveAll = useCallback(async () => {
    if (!account || !token || !draft) return;

    const missing = validateFilters(draft);
    if (missing.length) {
      setStatus('error');
      setMessage(`Please set ${missing.join(', ')} before saving.`);
      return;
    }

    setStatus('saving');
    setMessage(null);

    try {
      const saved = await postFilters(account.id, token, draft);
      setDraft(saved);
      setDirty(false);
      setStatus('idle');
      setMessage('Filters saved.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to save filters');
    }
  }, [account, token, draft]);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  const value = useMemo(
    () => ({
      status,
      message,
      draft,
      dirty,
      refresh,
      updateDraft,
      saveAll,
      clearMessage,
    }),
    [status, message, draft, dirty, refresh, updateDraft, saveAll, clearMessage]
  );

  return <FiltersDraftContext.Provider value={value}>{children}</FiltersDraftContext.Provider>;
}

export function useFiltersDraft() {
  const ctx = useContext(FiltersDraftContext);
  if (!ctx) {
    throw new Error('useFiltersDraft must be used within FiltersDraftProvider');
  }
  return ctx;
}
