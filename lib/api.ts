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
};

type TokenResponse = {
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
