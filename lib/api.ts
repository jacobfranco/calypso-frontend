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
  reaction: 'LIKE' | 'DISLIKE' | 'SKIP';
};

export type PublicPromptSelection = {
  accountId: number;
  selectedPromptIds: string[];
  updatedAt: number;
};

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

  const json = (await res.json()) as TokenResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!('access_token' in json)) {
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

  const json = (await res.json()) as PhoneCodeResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!('verification_token' in json) && !('access_token' in json)) {
    throw new Error('Unexpected response from /api/accounts/phone/verify');
  }

  return json;
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

  const json = (await res.json()) as TokenResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!('access_token' in json)) {
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

  const json = (await res.json()) as TokenResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }

  if (!('access_token' in json)) {
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
