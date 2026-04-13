import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'http://localhost:8080';

const TOKEN_KEY = 'calypso.token';

export type Account = {
  id: string;
  name: string;
  avatar?: string;
  avatar_static?: string;
  created_at?: string;
  birthday?: string;
  phone_number?: string;
};

export type Importance = 'NOT_IMPORTANT' | 'PREFERENCE' | 'DEALBREAKER';
export type LocationScope = 'NEARBY' | 'COUNTRY' | 'WORLDWIDE';
export type DistanceUnit = 'KM' | 'MI';

export type ModeFilter = {
  self?: string;
};

export type OneToManyFilter = {
  self?: string;
  seeking?: string[];
  importance?: Importance;
};

export type RangeFilter = {
  self?: number;
  min?: number;
  max?: number;
  importance?: Importance;
};

export type LocationFilter = {
  lat?: number;
  lon?: number;
  radiusKm?: number;
  importance?: Importance;
  scope?: LocationScope;
  countryCode?: string;
  distanceUnit?: DistanceUnit;
};

export type TagPreference = {
  tag: string;
  importance: Importance;
};

export type ManyToManyFilter = {
  self?: string[];
  preferences?: TagPreference[];
};

export type Filters = {
  accountId?: number;
  relationshipMode?: ModeFilter;
  gender?: OneToManyFilter;
  age?: RangeFilter;
  location?: LocationFilter;
  religion?: OneToManyFilter;
  politics?: OneToManyFilter;
  lifestyle?: ManyToManyFilter;
};

export type TagsResponse = Record<string, string[]>;

export type PromptDefinition = {
  promptId: string;
  bank: 'PUBLIC' | 'PRIVATE';
  text: string;
  topic?: string;
  tags?: string[];
  version?: number;
};

export type PublicPromptAnswer = {
  answerId: string;
  promptId: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
};

export type PublicPromptFeedCard = {
  answerId: string;
  promptId: string;
  promptText: string;
  body: string;
  createdAt: number;
};

export type PublicPromptAnswerPayload = {
  body: string;
};

export type PublicPromptReactionPayload = {
  strength: -3 | -2 | -1 | 0 | 1 | 2 | 3;
};

export type FacecardReactionPayload = {
  reaction: 'LIKE' | 'DISLIKE' | 'SKIP';
};

export type PublicPromptSelection = {
  accountId: number;
  selectedPromptIds: string[];
  updatedAt: number;
};

export type PrivatePromptStatus = 'ACTIVE' | 'ANSWERED' | 'SKIPPED' | 'SNOOZED';

export type PrivatePromptAssignment = {
  instanceId: string;
  accountId: number;
  promptId: string;
  scheduledAt: number;
  surfacedAt?: number;
  completedAt?: number;
  status: PrivatePromptStatus;
  snoozeUntil?: number;
};

export type PrivatePromptAnswer = {
  instanceId: string;
  accountId: number;
  promptId: string;
  body: string;
  answeredAt: number;
  signalTokens?: string[];
};

export type ActivePrivatePrompt = {
  assignment: PrivatePromptAssignment;
  prompt: PromptDefinition;
  answer?: PrivatePromptAnswer;
};

export type PrivatePromptChatTurnPayload = {
  questionPart?: string;
  userMessage: string;
  conversation?: string[];
};

export type PrivatePromptChatTurnResponse = {
  agentMessage: string;
  needsMoreDetail: boolean;
};

export type MatchCard = {
  account: Account;
  score: number;
  computedAt: number;
  scorerDebug?: MatchScorerDebug;
};

export type MatchScorerDebug = {
  filterPreferenceFit?: number;
  viewerNeedsMetByTarget?: number;
  targetNeedsMetByViewer?: number;
  sharedSelfOverlap?: number;
  signalAlignment?: number;
  profileSignalBlend?: number;
  viewerReactionScore?: number;
  targetInterestScore?: number;
  noveltyScore?: number;
  finalScore?: number;
  tier2Score?: number;
  tier2Normalized?: number;
  tier3Compatibility?: number;
  tier3Confidence?: number;
  tier3AppliedWeight?: number;
  tier3HardBlocker?: boolean;
  tier3Reason?: string;
  tier3Applied?: boolean;
  scoreBeforeTier3?: number;
  scoreAfterTier3?: number;
};

function isSerializedAccountId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^\d+-a$/.test(trimmed);
}

function isValidMatchCard(value: MatchCard | null | undefined): value is MatchCard {
  if (!value || !value.account) return false;
  return isSerializedAccountId(value.account.id);
}

export type SignalRecord = {
  token: string;
  rawToken?: string;
  canonicalToken?: string;
  source?: string;
  sourceId?: string;
  firstSeen?: number;
  lastSeen?: number;
  count?: number;
  lastContext?: string;
  intent?: string;
  valence?: number;
};

export type SignalsResponse = {
  accountId: number;
  tokens: string[];
  records: SignalRecord[];
};

export type SignalConcept = {
  concept: string;
  aliases: string[];
  parents: Record<string, number>;
};

export type SignalConceptRegistryResponse = {
  version: number;
  concepts: SignalConcept[];
};

export type SignalConceptCandidate = {
  rawToken: string;
  seenCount: number;
  firstSeen: number;
  lastSeen: number;
  lastSource?: string;
  exampleContexts: string[];
  observedAccounts?: Array<{
    accountId: number;
    intent?: string;
    seenCount: number;
    averageValence: number;
  }>;
  suggestedCanonical?: string;
  suggestionScore?: number;
  autoReady?: boolean;
  blockedAt?: number;
};

export type SignalConceptCandidatesResponse = {
  version: number;
  candidates: SignalConceptCandidate[];
};

export type SignalDisambiguationCandidate = {
  key: string;
  term: string;
  question: string;
  promptId?: string;
  source?: string;
  sourceId?: string;
  context?: string;
  seenCount: number;
  firstSeen: number;
  lastSeen: number;
};

export type SignalDisambiguationCandidatesResponse = {
  candidates: SignalDisambiguationCandidate[];
};

export type SignalConceptCandidateAction = 'create' | 'map' | 'reject' | 'block' | 'unblock';

export type TokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  created_at: number;
};

export type SignupRequest = {
  name: string;
  email: string;
  password: string;
  locale?: string;
};

export type PhoneSignupRequest = {
  name: string;
  phone_number: string;
  birthday: string;
  verification_token: string;
  locale?: string;
};

type PhoneCodeResponse = {
  verification_token: string;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTokenResponse(value: unknown): value is TokenResponse {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.access_token === 'string' &&
    typeof value.token_type === 'string' &&
    typeof value.scope === 'string' &&
    typeof value.created_at === 'number'
  );
}

function isPhoneCodeResponse(value: unknown): value is PhoneCodeResponse {
  return isObjectRecord(value) && typeof value.verification_token === 'string';
}

export async function createAccount(payload: SignupRequest): Promise<TokenResponse> {
  const body = {
    name: payload.name,
    email: payload.email,
    password: payload.password,
    agreement: true,
    locale: payload.locale ?? 'en-US',
  };

  const res = await fetch(`${API_BASE_URL}/api/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as unknown;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!isTokenResponse(json)) {
    throw new Error('Unexpected response from /api/accounts');
  }

  return json;
}

export type PhoneRequestResponse = {
  code?: string;
  fallback?: boolean;
  existing?: boolean;
};

export async function requestPhoneCode(phoneNumber: string): Promise<PhoneRequestResponse> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/phone/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone_number: phoneNumber }),
  });

  if (!res.ok) {
    const json = (await res.json()) as ErrorDetails;
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (res.status === 204) return {};
  try {
    return (await res.json()) as PhoneRequestResponse;
  } catch {
    return {};
  }
}

export type PhoneVerifyResponse = TokenResponse | PhoneCodeResponse;

export async function verifyPhoneCode(
  phoneNumber: string,
  code: string
): Promise<PhoneVerifyResponse> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/phone/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone_number: phoneNumber, code }),
  });

  const json = (await res.json()) as unknown;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (isPhoneCodeResponse(json) || isTokenResponse(json)) {
    return json;
  }

  throw new Error('Unexpected response from /api/accounts/phone/verify');
}

export async function createPhoneAccount(payload: PhoneSignupRequest): Promise<TokenResponse> {
  const body = {
    name: payload.name,
    phone_number: payload.phone_number,
    birthday: payload.birthday,
    verification_token: payload.verification_token,
    agreement: true,
    locale: payload.locale ?? 'en-US',
  };

  const res = await fetch(`${API_BASE_URL}/api/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as unknown;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!isTokenResponse(json)) {
    throw new Error('Unexpected response from /api/accounts');
  }

  return json;
}

type ErrorDetails = {
  error: string;
  details?: Record<string, { code: string; message: string }>;
};

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function storeToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function loginWithPassword(
  username: string,
  password: string,
  scope = 'read write follow push'
): Promise<TokenResponse> {
  const body = {
    grant_type: 'password',
    username,
    password,
    scope,
  };

  const res = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as unknown;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!isTokenResponse(json)) {
    throw new Error('Unexpected response from /oauth/token');
  }

  return json;
}

export async function revokeToken(token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/oauth/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const json = (await res.json()) as ErrorDetails;
    throw new Error(extractErrorMessage(json, res.status));
  }
}

export async function fetchMe(token: string): Promise<Account> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await res.json()) as Account | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!('id' in json)) {
    throw new Error('Unexpected response from /api/accounts/me');
  }

  return json;
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = payload as ErrorDetails;
    if (err.details) {
      const first = Object.values(err.details)[0];
      if (first?.message) {
        return first.message;
      }
    }
    if (err.error) {
      return err.error;
    }
  }
  return `Request failed (${status})`;
}

export async function fetchFilters(accountId: string, token: string): Promise<Filters | null> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/filters`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 404) {
    return null;
  }

  const json = (await res.json()) as { filters?: Filters } | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if ('filters' in json && json.filters) {
    return json.filters;
  }

  return null;
}

export async function postFilters(
  accountId: string,
  token: string,
  filters: Filters
): Promise<Filters> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/filters`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(filters),
  });

  const json = (await res.json()) as { filters?: Filters } | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if ('filters' in json && json.filters) {
    return json.filters;
  }

  throw new Error('Unexpected response from /api/accounts/{id}/filters');
}

export async function fetchTags(kind: string): Promise<TagsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/meta/tags/${kind}`);
  const json = (await res.json()) as TagsResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  return json as TagsResponse;
}

export async function fetchPublicPromptLibrary(): Promise<PromptDefinition[]> {
  const res = await fetch(`${API_BASE_URL}/api/meta/prompts/public`);
  const json = (await res.json()) as PromptDefinition[] | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!Array.isArray(json)) {
    throw new Error('Unexpected response from /api/meta/prompts/public');
  }
  return json;
}

export async function fetchPublicPromptFeed(
  accountId: string,
  token: string,
  limit = 1
): Promise<PublicPromptFeedCard[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/public-prompt-feed?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const json = (await res.json()) as PublicPromptFeedCard[] | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!Array.isArray(json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/public-prompt-feed');
  }

  return json;
}

export async function fetchMyPublicPromptAnswers(
  accountId: string,
  token: string
): Promise<PublicPromptAnswer[]> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/public-prompts/answers`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await res.json()) as PublicPromptAnswer[] | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!Array.isArray(json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/public-prompts/answers');
  }

  return json;
}

export async function postPublicPromptAnswer(
  accountId: string,
  token: string,
  promptId: string,
  payload: PublicPromptAnswerPayload
): Promise<PublicPromptAnswer> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/public-prompts/${promptId}/answer`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const json = (await res.json()) as PublicPromptAnswer | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!('answerId' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/public-prompts/{promptId}/answer');
  }

  return json;
}

export async function fetchPublicPromptSelection(
  accountId: string,
  token: string
): Promise<PublicPromptSelection | null> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/public-prompts/selection`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 204) return null;

  const json = (await res.json()) as PublicPromptSelection | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!('accountId' in json)) {
    return null;
  }

  return json;
}

export async function postPublicPromptSelection(
  accountId: string,
  token: string,
  selectedPromptIds: string[]
): Promise<PublicPromptSelection> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/public-prompts/selection`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ selectedPromptIds }),
  });

  const json = (await res.json()) as PublicPromptSelection | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!('accountId' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/public-prompts/selection');
  }

  return json;
}

export async function postPublicPromptReaction(
  accountId: string,
  token: string,
  answerId: string,
  payload: PublicPromptReactionPayload
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/public-prompt-feed/${answerId}/reaction`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const json = (await res.json()) as Record<string, unknown> | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  return;
}

export async function postFacecardReaction(
  accountId: string,
  token: string,
  targetAccountId: string,
  payload: FacecardReactionPayload
): Promise<void> {
  const targetId = targetAccountId?.trim();
  if (!isSerializedAccountId(targetId)) {
    throw new Error('Target account required');
  }
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/facecards/${targetId}/reaction`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const json = (await res.json()) as Record<string, unknown> | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
}

export async function fetchActivePrivatePrompt(
  accountId: string,
  token: string
): Promise<ActivePrivatePrompt | null> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/agent/private-prompt`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 204) return null;

  const json = (await res.json()) as ActivePrivatePrompt | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('assignment' in json) || !('prompt' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/agent/private-prompt');
  }
  return json;
}

export async function fetchActiveMatchmakingFollowup(
  accountId: string,
  token: string
): Promise<ActivePrivatePrompt | null> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/agent/matchmaking-followup`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 204) return null;

  const json = (await res.json()) as ActivePrivatePrompt | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('assignment' in json) || !('prompt' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/agent/matchmaking-followup');
  }
  return json;
}

export async function postPrivatePromptAnswer(
  accountId: string,
  token: string,
  instanceId: string,
  body: string,
  conversation?: string[]
): Promise<ActivePrivatePrompt> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/agent/private-prompt/${instanceId}/answer`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body, conversation }),
    }
  );

  const json = (await res.json()) as ActivePrivatePrompt | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('assignment' in json) || !('prompt' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/agent/private-prompt/{instanceId}/answer');
  }
  return json;
}

export async function postMatchmakingFollowupAnswer(
  accountId: string,
  token: string,
  instanceId: string,
  body: string,
  conversation?: string[]
): Promise<ActivePrivatePrompt> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/agent/matchmaking-followup/${instanceId}/answer`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body, conversation }),
    }
  );

  const json = (await res.json()) as ActivePrivatePrompt | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('assignment' in json) || !('prompt' in json)) {
    throw new Error(
      'Unexpected response from /api/accounts/{id}/agent/matchmaking-followup/{instanceId}/answer'
    );
  }
  return json;
}

export async function postPrivatePromptChatTurn(
  accountId: string,
  token: string,
  instanceId: string,
  payload: PrivatePromptChatTurnPayload
): Promise<PrivatePromptChatTurnResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/agent/private-prompt/${instanceId}/chat-turn`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const json = (await res.json()) as PrivatePromptChatTurnResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('agentMessage' in json) || !('needsMoreDetail' in json)) {
    throw new Error(
      'Unexpected response from /api/accounts/{id}/agent/private-prompt/{instanceId}/chat-turn'
    );
  }
  return json;
}

export async function postMatchmakingFollowupChatTurn(
  accountId: string,
  token: string,
  instanceId: string,
  payload: PrivatePromptChatTurnPayload
): Promise<PrivatePromptChatTurnResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/agent/matchmaking-followup/${instanceId}/chat-turn`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const json = (await res.json()) as PrivatePromptChatTurnResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('agentMessage' in json) || !('needsMoreDetail' in json)) {
    throw new Error(
      'Unexpected response from /api/accounts/{id}/agent/matchmaking-followup/{instanceId}/chat-turn'
    );
  }
  return json;
}

export async function postPrivatePromptSkip(
  accountId: string,
  token: string,
  instanceId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/agent/private-prompt/${instanceId}/skip`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const json = (await res.json()) as ErrorDetails;
    throw new Error(extractErrorMessage(json, res.status));
  }
}

export async function postMatchmakingFollowupSkip(
  accountId: string,
  token: string,
  instanceId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/agent/matchmaking-followup/${instanceId}/skip`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const json = (await res.json()) as ErrorDetails;
    throw new Error(extractErrorMessage(json, res.status));
  }
}

export async function postPrivatePromptSnooze(
  accountId: string,
  token: string,
  instanceId: string,
  snoozeUntil?: number
): Promise<void> {
  const body = snoozeUntil ? { snoozeUntil } : {};
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/agent/private-prompt/${instanceId}/snooze`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const json = (await res.json()) as ErrorDetails;
    throw new Error(extractErrorMessage(json, res.status));
  }
}

export async function postDebugSummonNextPrivatePrompt(
  accountId: string,
  token: string
): Promise<ActivePrivatePrompt | null> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/agent/private-prompt/debug/next`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (res.status === 204) return null;

  const json = (await res.json()) as ActivePrivatePrompt | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('assignment' in json) || !('prompt' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/agent/private-prompt/debug/next');
  }
  return json;
}

type MatchesResponse = {
  matches?: MatchCard[];
};

export async function fetchMatches(
  accountId: string,
  token: string,
  limit = 20
): Promise<MatchCard[]> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/matches?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await res.json()) as MatchesResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!('matches' in json) || !Array.isArray(json.matches)) {
    throw new Error('Unexpected response from /api/accounts/{id}/matches');
  }

  return json.matches.filter((match) => isValidMatchCard(match));
}

export async function fetchFacecards(
  accountId: string,
  token: string,
  limit = 20
): Promise<MatchCard[]> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/facecards?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await res.json()) as MatchesResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!('matches' in json) || !Array.isArray(json.matches)) {
    throw new Error('Unexpected response from /api/accounts/{id}/facecards');
  }

  return json.matches.filter((match) => isValidMatchCard(match));
}

export async function fetchSignals(accountId: string, token: string): Promise<SignalsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/signals`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 204) {
    return { accountId: Number(accountId), tokens: [], records: [] };
  }

  const json = (await res.json()) as SignalsResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('accountId' in json) || !('records' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/signals');
  }
  return json;
}

export async function fetchSignalConceptRegistry(
  accountId: string,
  token: string
): Promise<SignalConceptRegistryResponse> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/admin/signal-concepts`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await res.json()) as SignalConceptRegistryResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('version' in json) || !('concepts' in json) || !Array.isArray(json.concepts)) {
    throw new Error('Unexpected response from /api/accounts/{id}/admin/signal-concepts');
  }
  return json;
}

export async function fetchSignalConceptCandidates(
  accountId: string,
  token: string,
  limit = 100
): Promise<SignalConceptCandidatesResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/admin/signal-concepts/candidates?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const json = (await res.json()) as SignalConceptCandidatesResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('version' in json) || !('candidates' in json) || !Array.isArray(json.candidates)) {
    throw new Error('Unexpected response from /api/accounts/{id}/admin/signal-concepts/candidates');
  }
  return json;
}

export async function fetchBlockedSignalConceptCandidates(
  accountId: string,
  token: string,
  limit = 100
): Promise<SignalConceptCandidatesResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/admin/signal-concepts/blocked?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const json = (await res.json()) as SignalConceptCandidatesResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('version' in json) || !('candidates' in json) || !Array.isArray(json.candidates)) {
    throw new Error('Unexpected response from /api/accounts/{id}/admin/signal-concepts/blocked');
  }
  return json;
}

export async function fetchSignalDisambiguationCandidates(
  accountId: string,
  token: string,
  limit = 100
): Promise<SignalDisambiguationCandidatesResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/admin/signal-disambiguation/candidates?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const json = (await res.json()) as SignalDisambiguationCandidatesResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('candidates' in json) || !Array.isArray(json.candidates)) {
    throw new Error('Unexpected response from /api/accounts/{id}/admin/signal-disambiguation/candidates');
  }
  return json;
}

export async function actOnSignalConceptCandidate(
  accountId: string,
  token: string,
  action: SignalConceptCandidateAction,
  rawToken: string,
  canonicalToken?: string
): Promise<{
  action?: string;
  changed: boolean;
  rawToken?: string;
  canonicalToken?: string;
  migratedStoredAccounts?: number;
  replayedObservedAccounts?: number;
  replayedContextualOwners?: number;
  observedAccountIds?: number[];
}> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/admin/signal-concepts/action`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, rawToken, canonicalToken }),
  });

  const json = (await res.json()) as
    | {
        action?: string;
        changed?: boolean;
        rawToken?: string;
        canonicalToken?: string;
        migratedStoredAccounts?: number;
        replayedObservedAccounts?: number;
        replayedContextualOwners?: number;
        observedAccountIds?: number[];
      }
    | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  return {
    action: 'action' in json ? json.action : undefined,
    changed: Boolean('changed' in json ? json.changed : false),
    rawToken: 'rawToken' in json ? json.rawToken : undefined,
    canonicalToken: 'canonicalToken' in json ? json.canonicalToken : undefined,
    migratedStoredAccounts:
      'migratedStoredAccounts' in json ? json.migratedStoredAccounts : undefined,
    replayedObservedAccounts:
      'replayedObservedAccounts' in json ? json.replayedObservedAccounts : undefined,
    replayedContextualOwners:
      'replayedContextualOwners' in json ? json.replayedContextualOwners : undefined,
    observedAccountIds: 'observedAccountIds' in json ? json.observedAccountIds : undefined,
  };
}

export async function promoteSignalConceptCandidate(
  accountId: string,
  token: string,
  rawToken: string,
  canonicalToken: string
): Promise<{
  changed: boolean;
  rawToken?: string;
  canonicalToken?: string;
  migratedStoredAccounts?: number;
  replayedObservedAccounts?: number;
  replayedContextualOwners?: number;
  observedAccountIds?: number[];
}> {
  return actOnSignalConceptCandidate(accountId, token, 'map', rawToken, canonicalToken);
}

export async function rejectSignalConceptCandidate(
  accountId: string,
  token: string,
  rawToken: string
): Promise<boolean> {
  const result = await actOnSignalConceptCandidate(accountId, token, 'reject', rawToken);
  return Boolean(result.changed);
}
