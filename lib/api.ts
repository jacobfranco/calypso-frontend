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
};

export type TagsResponse = Record<string, string[]>;

export type MatchStandardQuestionAnswerType = 'SINGLE_CHOICE' | 'MULTI_CHOICE';

export type MatchStandardOption = {
  optionId: string;
  text: string;
};

export type MatchStandardQuestion = {
  questionId: string;
  category: string;
  text: string;
  answerType: MatchStandardQuestionAnswerType;
  options: MatchStandardOption[];
  version?: number;
  tags?: string[];
};

export type MatchStandardAnswer = {
  accountId: number;
  questionId: string;
  ownAnswerOptionIds: string[];
  acceptableAnswerOptionIds: string[];
  importance: Importance;
  updatedAt: number;
};

export type MatchStandardAnswerSet = {
  accountId: number;
  answers?: MatchStandardAnswer[];
};

export type MatchStandardAnswerPayload = {
  ownAnswerOptionIds: string[];
  acceptableAnswerOptionIds: string[];
  importance: Importance;
};

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
  sharedSignals?: string[];
};

export type MatchScorerDebug = {
  filterPreferenceFit?: number;
  viewerNeedsMetByTarget?: number;
  targetNeedsMetByViewer?: number;
  sharedSelfOverlap?: number;
  signalAlignment?: number;
  profileSignalBlend?: number;
  matchStandardScore?: number;
  matchStandardSharedCount?: number;
  matchStandardCoverage?: number;
  matchStandardKnownDealbreakerConflicts?: number;
  matchStandardUnknownImportantCount?: number;
  matchStandardKnownSoftConflicts?: number;
  viewerReactionScore?: number;
  targetReactionScore?: number;
  targetInterestScore?: number;
  noveltyScore?: number;
  resonanceAlignment?: number;
  resonanceSharedCount?: number;
  resonanceDelta?: number;
  finalScoreBeforeResonance?: number;
  finalScore?: number;
  tier2Score?: number;
  tier2Normalized?: number;
  tier3Compatibility?: number;
  tier3Spark?: number;
  tier3Sustainability?: number;
  tier3LearningValue?: number;
  tier3Confidence?: number;
  tier3AppliedWeight?: number;
  tier3RecommendedUse?: string;
  tier3HardBlocker?: boolean;
  tier3Reason?: string;
  tier3Applied?: boolean;
  tier3Surface?: string;
  tier3Cached?: boolean;
  tier3ScoreSource?: string;
  tier3Pending?: boolean;
  tier3PendingReason?: string;
  tier3BestModePair?: {
    viewerModeId?: string;
    candidateModeId?: string;
    canonicalOrientation?: boolean;
  };
  viewerSilhouetteMaturity?: string;
  viewerSilhouetteModeCount?: number;
  candidateSilhouetteMaturity?: string;
  candidateSilhouetteModeCount?: number;
  targetToViewerScoreAtRerank?: number;
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
  category?: string;
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
  category?: string;
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
  observedAccounts?: {
    accountId: number;
    intent?: string;
    seenCount: number;
    averageValence: number;
  }[];
  suggestedCanonical?: string;
  suggestionScore?: number;
  suggestedCategory?: string;
  suggestedParents?: string[];
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

export type SilhouetteConcept = {
  id?: string;
  label: string;
  role?: string;
  confidence?: number;
  strength?: number;
  evidenceIds?: string[];
};

export type SilhouetteAntiPattern = {
  id?: string;
  label: string;
  scope?: string;
  severity?: string;
  confidence?: number;
  evidenceIds?: string[];
};

export type SilhouetteTension = {
  id?: string;
  a: string;
  b: string;
  status?: string;
  confidence?: number;
  evidenceIds?: string[];
};

export type SilhouetteEvidence = {
  id?: string;
  source?: string;
  target?: string;
  value: string;
  derivedConceptIds?: string[];
  strength?: number;
  confidence?: number;
  sourceWeight?: number;
  sourceId?: string;
  promptId?: string;
  createdAt?: number;
};

export type SilhouetteMode = {
  id?: string;
  label?: string;
  status?: string;
  weight?: number;
  confidence?: number;
  selfExpression?: SilhouetteConcept[];
  seekingExpression?: SilhouetteConcept[];
  sparkTriggers?: SilhouetteConcept[];
  realWorldComps?: SilhouetteConcept[];
  sustainabilityNeeds?: SilhouetteConcept[];
  aestheticField?: SilhouetteConcept[];
  antiPatterns?: SilhouetteAntiPattern[];
  tensions?: SilhouetteTension[];
  evidence?: SilhouetteEvidence[];
  evidenceSummary?: string[];
  openQuestions?: string[];
  createdAt?: number;
  updatedAt?: number;
  lastReinforcedAt?: number;
};

export type SilhouetteSummaryCache = {
  silhouette?: string;
  generatedFromVersion?: number;
  updatedAt?: number;
};

export type SilhouetteResponse = {
  accountId: number;
  version?: number;
  maturity?: 'empty' | 'sparse' | 'emerging' | 'mature' | string;
  modes?: SilhouetteMode[];
  summaryCache?: SilhouetteSummaryCache;
  updatedAt?: number;
};

export type LlmTelemetryTotals = {
  calls: number;
  successes: number;
  failures: number;
  avgLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type LlmTelemetryStageSummary = {
  stageKey: string;
  stage: string;
  surface: string;
  calls: number;
  successes: number;
  failures: number;
  avgLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type LlmTelemetryContextSummary = {
  contextKey: string;
  stage: string;
  surface: string;
  operation?: string;
  accountId?: number;
  calls: number;
  successes: number;
  failures: number;
  avgLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  candidateCount?: number;
  promptChars?: number;
};

export type LlmTelemetryEvent = {
  createdAt: number;
  stage: string;
  surface: string;
  promptId?: string;
  model: string;
  success: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  accountId?: number;
  targetAccountId?: number;
  operation?: string;
  sourceId?: string;
  candidateCount?: number;
  promptChars?: number;
  maxOutputTokens?: number;
  error?: string;
};

export type LlmTelemetryResponse = {
  generatedAt: number;
  totals: LlmTelemetryTotals;
  byStage: LlmTelemetryStageSummary[];
  byContext?: LlmTelemetryContextSummary[];
  events: LlmTelemetryEvent[];
};

export type AdminPairThresholds = {
  match: number;
  autoPass: number;
};

export type AdminPairStagingSnapshot = {
  available: boolean;
  present: boolean;
  targetAccountId?: string;
  status?: string;
  holdReason?: string | null;
  visibleMatch?: boolean;
  rerankEvidence?: boolean;
  stagingEntranceThreshold?: number;
  stagingExitThreshold?: number;
  escapeThreshold?: number;
  deterministicScore?: number;
  targetToViewerScore?: number;
  mutualScore?: number;
  effectiveScore?: number;
  scoreAtRerank?: number;
  rerankCount?: number;
  lastRerankedAt?: number;
  updatedAt?: number;
  enteredAt?: number;
  demotedAt?: number;
  rerankInvalidatedAt?: number;
  rerankRecommendedUse?: string | null;
  rerankCompatibility?: number;
  rerankConfidence?: number;
  rerankReason?: string | null;
  rerankCached?: boolean;
  followupPending?: boolean;
};

export type AdminPairTopCandidate = {
  account: Account;
  scoreSource?: string;
  score: number;
  computedAt: number;
  deltaToMatchThreshold: number;
  deltaToAutoPassThreshold: number;
  meetsMatchThreshold?: boolean;
  meetsAutoPassThreshold?: boolean;
  noveltyScore?: number;
  viewerReactionScore?: number;
  targetReactionScore?: number;
  scorerDebug?: MatchScorerDebug;
};

export type AdminPairDirectionalScore = {
  present: boolean;
  account?: Account;
  scoreSource?: string;
  score?: number;
  computedAt?: number;
  deltaToMatchThreshold?: number;
  deltaToAutoPassThreshold?: number;
  meetsMatchThreshold?: boolean;
  meetsAutoPassThreshold?: boolean;
  noveltyScore?: number;
  viewerReactionScore?: number;
  targetReactionScore?: number;
  scorerDebug?: MatchScorerDebug;
};

export type AdminPairSnapshot = {
  targetAccountId: string;
  scoreSource?: string;
  viewerMode: string;
  targetMode: string;
  viewerThresholds: AdminPairThresholds;
  targetThresholds: AdminPairThresholds;
  viewerToTarget: AdminPairDirectionalScore;
  targetToViewer: AdminPairDirectionalScore;
  mutualMinScore?: number;
  mutualDeltaToThreshold?: number;
  viewerToTargetReactionScore?: number;
  targetToViewerReactionScore?: number;
  viewerLikedTargetFacecard?: boolean;
  targetLikedViewerFacecard?: boolean;
  viewerPromptLikeSeen?: boolean;
  targetPromptLikeSeen?: boolean;
  bothMeetMatchThreshold: boolean;
  bothMeetAutoPassThreshold: boolean;
  staging?: AdminPairStagingSnapshot | null;
};

export type AdminPairRawCandidate = {
  targetAccountId: string;
  score: number;
  computedAt?: number;
  reasons?: string[];
  scorerDebug?: MatchScorerDebug;
};

export type AdminPairHeapSnapshot = {
  rawCandidateCount: number;
  hydratedCandidateCount: number;
  rawTopCandidates: AdminPairRawCandidate[];
};

export type AdminPairScoreResponse = {
  generatedAt: number;
  viewerId: string;
  viewerMode: string;
  viewerThresholds: AdminPairThresholds;
  heap?: AdminPairHeapSnapshot;
  topCandidates: AdminPairTopCandidate[];
  pair?: AdminPairSnapshot | null;
};

export type AdminRerankEvent = {
  createdAt: number;
  eventType?: string;
  surface?: string;
  scoreSource?: string;
  viewerId?: string;
  candidateId?: string;
  candidateName?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  netChange?: number;
  percentChange?: number | null;
  tier2Normalized?: number;
  tier3Compatibility?: number;
  tier3Confidence?: number;
  tier3AppliedWeight?: number;
  recommendedUse?: string;
  skipReason?: string;
  requiredPublicPromptReactionCount?: number;
  viewerPublicPromptReactionCount?: number;
  candidatePublicPromptReactionCount?: number;
  fitSummaryInternal?: string;
  whyItWorks?: string[];
  risks?: string[];
  missingInfo?: string[];
  conversationSeeds?: string[];
  bestModePair?: {
    viewerModeId?: string;
    candidateModeId?: string;
  };
};

export type AdminRerankEventsResponse = {
  generatedAt: number;
  viewerId: string;
  events: AdminRerankEvent[];
};

export type AdminAiDecisionAggregate = {
  decisionKey?: string;
  surface?: string;
  stage?: string;
  action?: string;
  count: number;
};

export type AdminAiDecisionSurfaceAggregate = {
  surface: string;
  count: number;
};

export type AdminAiDecisionActionAggregate = {
  action: string;
  count: number;
};

export type AdminAiDecisionEvent = {
  createdAt: number;
  surface: string;
  stage: string;
  action: string;
  accountId?: number;
  targetAccountId?: number;
  details?: Record<string, unknown>;
};

export type AdminAiDecisionsResponse = {
  generatedAt: number;
  totals?: {
    decisions?: number;
  };
  byDecision?: AdminAiDecisionAggregate[];
  bySurface?: AdminAiDecisionSurfaceAggregate[];
  byAction?: AdminAiDecisionActionAggregate[];
  events: AdminAiDecisionEvent[];
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

export async function fetchMatchStandardQuestions(): Promise<MatchStandardQuestion[]> {
  const res = await fetch(`${API_BASE_URL}/api/match-standards/questions`);
  const json = (await res.json()) as MatchStandardQuestion[] | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!Array.isArray(json)) {
    throw new Error('Unexpected response from /api/match-standards/questions');
  }
  return json;
}

export async function fetchMatchStandardAnswers(
  accountId: string,
  token: string
): Promise<MatchStandardAnswerSet> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/match-standards/answers`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const json = (await res.json()) as MatchStandardAnswerSet | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('accountId' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/match-standards/answers');
  }
  return json;
}

export async function postMatchStandardAnswer(
  accountId: string,
  token: string,
  questionId: string,
  payload: MatchStandardAnswerPayload
): Promise<MatchStandardAnswer> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/match-standards/answers/${questionId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
  const json = (await res.json()) as MatchStandardAnswer | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('questionId' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/match-standards/answers/{questionId}');
  }
  return json;
}

export async function fetchNextMatchStandardQuestion(
  accountId: string,
  token: string,
  params: { category?: string; starter?: boolean } = {}
): Promise<MatchStandardQuestion | null> {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.starter) query.set('starter', 'true');
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/match-standards/next${suffix}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 404) return null;
  const json = (await res.json()) as MatchStandardQuestion | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('questionId' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/match-standards/next');
  }
  return json;
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

export type DirectMessage = {
  messageId: string;
  senderId: string;
  receiverId: string;
  text: string;
  sentAt: number;
};

export async function sendDirectMessage(
  accountId: string,
  token: string,
  targetAccountId: string,
  text: string
): Promise<DirectMessage> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/direct-messages/${targetAccountId}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(extractErrorMessage(json, res.status));
  return json as DirectMessage;
}

export async function fetchDirectMessages(
  accountId: string,
  token: string,
  targetAccountId: string,
  limit = 50
): Promise<DirectMessage[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/direct-messages/${targetAccountId}?limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(extractErrorMessage(json, res.status));
  if (!('messages' in json) || !Array.isArray(json.messages)) return [];
  return json.messages as DirectMessage[];
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

export async function fetchAdminSilhouette(
  accountId: string,
  token: string
): Promise<SilhouetteResponse> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/admin/silhouette`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await res.json()) as SilhouetteResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('accountId' in json)) {
    throw new Error('Unexpected response from /api/accounts/{id}/admin/silhouette');
  }
  return json;
}

export async function fetchAdminLlmTelemetry(
  accountId: string,
  token: string,
  limit = 120
): Promise<LlmTelemetryResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/accounts/${accountId}/admin/llm-telemetry?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const json = (await res.json()) as LlmTelemetryResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('totals' in json) || !('events' in json) || !Array.isArray(json.events)) {
    throw new Error('Unexpected response from /api/accounts/{id}/admin/llm-telemetry');
  }
  return json;
}

export async function fetchAdminPairScore(
  accountId: string,
  token: string,
  targetAccountId?: string | null,
  limit = 12
): Promise<AdminPairScoreResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  const target = targetAccountId?.trim();
  if (target) {
    params.set('targetId', target);
  }
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/admin/pair-score?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await res.json()) as AdminPairScoreResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('viewerId' in json) || !('topCandidates' in json) || !Array.isArray(json.topCandidates)) {
    throw new Error('Unexpected response from /api/accounts/{id}/admin/pair-score');
  }
  return json;
}

export async function fetchAdminRerankEvents(
  accountId: string,
  token: string,
  limit = 50
): Promise<AdminRerankEventsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/admin/rerank-events?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await res.json()) as AdminRerankEventsResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('viewerId' in json) || !('events' in json) || !Array.isArray(json.events)) {
    throw new Error('Unexpected response from /api/accounts/{id}/admin/rerank-events');
  }
  return json;
}

export async function fetchAdminAiDecisions(
  accountId: string,
  token: string,
  limit = 120
): Promise<AdminAiDecisionsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/admin/ai-decisions?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await res.json()) as AdminAiDecisionsResponse | ErrorDetails;
  if (!res.ok) {
    throw new Error(extractErrorMessage(json, res.status));
  }
  if (!('events' in json) || !Array.isArray(json.events)) {
    throw new Error('Unexpected response from /api/accounts/{id}/admin/ai-decisions');
  }
  return json;
}

export async function actOnSignalConceptCandidate(
  accountId: string,
  token: string,
  action: SignalConceptCandidateAction,
  rawToken: string,
  canonicalToken?: string,
  category?: string,
  parentConcepts?: string[]
): Promise<{
  action?: string;
  changed: boolean;
  rawToken?: string;
  canonicalToken?: string;
  category?: string;
  parentConcepts?: string[];
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
    body: JSON.stringify({ action, rawToken, canonicalToken, category, parentConcepts }),
  });

  const json = (await res.json()) as
    | {
        action?: string;
        changed?: boolean;
        rawToken?: string;
        canonicalToken?: string;
        category?: string;
        parentConcepts?: string[];
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
    category: 'category' in json ? json.category : undefined,
    parentConcepts: 'parentConcepts' in json ? json.parentConcepts : undefined,
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
  canonicalToken: string,
  category?: string,
  parentConcepts?: string[]
): Promise<{
  changed: boolean;
  rawToken?: string;
  canonicalToken?: string;
  category?: string;
  parentConcepts?: string[];
  migratedStoredAccounts?: number;
  replayedObservedAccounts?: number;
  replayedContextualOwners?: number;
  observedAccountIds?: number[];
}> {
  return actOnSignalConceptCandidate(accountId, token, 'map', rawToken, canonicalToken, category, parentConcepts);
}

export async function rejectSignalConceptCandidate(
  accountId: string,
  token: string,
  rawToken: string
): Promise<boolean> {
  const result = await actOnSignalConceptCandidate(accountId, token, 'reject', rawToken);
  return Boolean(result.changed);
}
