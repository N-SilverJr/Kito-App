import type {
  AnalyzeResponse,
  ActivityEntry,
  AiStatus,
  ApiErrorBody,
  CompanionState,
  DailySummary,
  FastingSession,
  Food,
  HydrationEntry,
  Meal,
  MealPlan,
  Preferences,
  Profile,
  SessionResponse,
  StatsResponse,
  TextParseResponse,
  User,
  WeightEntry,
  AchievementStatus,
} from '@nutripals/core';
import type {
  ActivityInput,
  AiAnalyzeRequest,
  CustomFoodInput,
  HydrationInput,
  MealInput,
  OnboardingInput,
  PlanPreferences,
  PreferencesUpdateInput,
  ProfileUpdateInput,
  WeightInput,
} from '@nutripals/core';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Injected in tests; defaults to crypto.randomUUID. */
  idempotencyKeyFactory?: () => string;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

function defaultIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
  const doFetch = options.fetchImpl ?? fetch;
  const makeKey = options.idempotencyKeyFactory ?? defaultIdempotencyKey;

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const init: RequestInit = {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers,
      signal: opts.signal,
    };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, init);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'We could not reach the server. Check your connection and try again — nothing was saved.',
      );
    }
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const errBody = payload as ApiErrorBody | null;
      const message =
        errBody?.error?.message ?? (response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Something went wrong.');
      throw new ApiError(response.status, errBody?.error?.code ?? 'request_failed', message, errBody?.error?.details);
    }
    return payload as T;
  }

  return {
    request,
    auth: {
      register(input: { email: string; password: string; display_name?: string }) {
        return request<{ user: User; verification_required: boolean; dev_verification_token?: string }>('/api/auth/register', {
          method: 'POST',
          body: input,
        });
      },
      login(input: { email: string; password: string }) {
        return request<{ user: User }>('/api/auth/login', { method: 'POST', body: input });
      },
      logout() {
        return request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
      },
      session() {
        return request<SessionResponse>('/api/auth/session');
      },
      verifyEmail(token: string) {
        return request<{ verified: true }>('/api/auth/verify-email', { method: 'POST', body: { token } });
      },
      resendVerification() {
        return request<{ ok: true; dev_verification_token?: string }>('/api/auth/resend-verification', { method: 'POST' });
      },
      forgotPassword(email: string) {
        return request<{ ok: true; dev_reset_token?: string }>('/api/auth/forgot-password', { method: 'POST', body: { email } });
      },
      resetPassword(token: string, password: string) {
        return request<{ ok: true }>('/api/auth/reset-password', { method: 'POST', body: { token, password } });
      },
      changePassword(current_password: string, new_password: string) {
        return request<{ ok: true }>('/api/auth/change-password', {
          method: 'POST',
          body: { current_password, new_password },
        });
      },
    },
    me: {
      completeOnboarding(input: OnboardingInput) {
        return request<SessionResponse>('/api/me/onboarding', { method: 'POST', body: input });
      },
      updateProfile(input: ProfileUpdateInput) {
        return request<{ profile: Profile; goals: DailySummary['goals'] }>('/api/me/profile', { method: 'PATCH', body: input });
      },
      updatePreferences(input: PreferencesUpdateInput) {
        return request<{ preferences: Preferences }>('/api/me/preferences', { method: 'PUT', body: input });
      },
      deleteAccount(password: string, confirmation: string) {
        return request<{ ok: true }>('/api/me', { method: 'DELETE', body: { password, confirmation } });
      },
      exportData() {
        return request<Record<string, unknown>>('/api/me/export');
      },
    },
    dashboard(date?: string) {
      return request<DailySummary>(`/api/dashboard${date ? `?date=${encodeURIComponent(date)}` : ''}`);
    },
    meals: {
      list(range: { date?: string; from?: string; to?: string }) {
        const params = new URLSearchParams();
        if (range.date) params.set('date', range.date);
        if (range.from) params.set('from', range.from);
        if (range.to) params.set('to', range.to);
        return request<{ meals: Meal[] }>(`/api/meals?${params.toString()}`);
      },
      get(id: string) {
        return request<{ meal: Meal }>(`/api/meals/${id}`);
      },
      create(input: MealInput, idempotencyKey = makeKey()) {
        return request<{ meal: Meal }>('/api/meals', { method: 'POST', body: input, idempotencyKey });
      },
      update(id: string, input: Partial<MealInput>) {
        return request<{ meal: Meal }>(`/api/meals/${id}`, { method: 'PATCH', body: input });
      },
      remove(id: string) {
        return request<{ ok: true }>(`/api/meals/${id}`, { method: 'DELETE' });
      },
    },
    foods: {
      search(q: string, includeExternal = true) {
        const params = new URLSearchParams({ q, include_external: String(includeExternal) });
        return request<{ foods: Food[]; external_error?: string | null }>(`/api/foods/search?${params.toString()}`);
      },
      barcode(code: string) {
        return request<{ food: Food }>(`/api/foods/barcode/${encodeURIComponent(code)}`);
      },
      create(input: CustomFoodInput) {
        return request<{ food: Food }>('/api/foods', { method: 'POST', body: input });
      },
    },
    ai: {
      status() {
        return request<AiStatus>('/api/ai/status');
      },
      analyze(input: AiAnalyzeRequest) {
        return request<AnalyzeResponse>('/api/ai/analyze', { method: 'POST', body: input });
      },
    },
    parseText(text: string) {
      return request<TextParseResponse>('/api/foods/parse', { method: 'POST', body: { text } });
    },
    hydration: {
      list(date: string) {
        return request<{ entries: HydrationEntry[]; total_ml: number }>(`/api/hydration?date=${encodeURIComponent(date)}`);
      },
      add(input: HydrationInput, idempotencyKey = makeKey()) {
        return request<{ entry: HydrationEntry; total_ml: number; awarded_xp: number }>('/api/hydration', {
          method: 'POST',
          body: input,
          idempotencyKey,
        });
      },
      update(id: string, amount_ml: number) {
        return request<{ entry: HydrationEntry }>(`/api/hydration/${id}`, { method: 'PATCH', body: { amount_ml } });
      },
      remove(id: string) {
        return request<{ ok: true }>(`/api/hydration/${id}`, { method: 'DELETE' });
      },
    },
    weight: {
      list(range: { from?: string; to?: string; limit?: number } = {}) {
        const params = new URLSearchParams();
        if (range.from) params.set('from', range.from);
        if (range.to) params.set('to', range.to);
        if (range.limit) params.set('limit', String(range.limit));
        return request<{ entries: WeightEntry[] }>(`/api/weight?${params.toString()}`);
      },
      add(input: WeightInput, idempotencyKey = makeKey()) {
        return request<{ entry: WeightEntry; awarded_xp: number }>('/api/weight', { method: 'POST', body: input, idempotencyKey });
      },
      update(id: string, input: Partial<WeightInput>) {
        return request<{ entry: WeightEntry }>(`/api/weight/${id}`, { method: 'PATCH', body: input });
      },
      remove(id: string) {
        return request<{ ok: true }>(`/api/weight/${id}`, { method: 'DELETE' });
      },
    },
    fasting: {
      list() {
        return request<{ active: FastingSession | null; sessions: FastingSession[] }>('/api/fasting');
      },
      start(plan: string, target_minutes: number) {
        return request<{ session: FastingSession }>('/api/fasting', { method: 'POST', body: { plan, target_minutes } });
      },
      finish(id: string) {
        return request<{ session: FastingSession; awarded_xp: number }>(`/api/fasting/${id}/finish`, { method: 'POST' });
      },
      cancel(id: string) {
        return request<{ session: FastingSession }>(`/api/fasting/${id}/cancel`, { method: 'POST' });
      },
    },
    activity: {
      list(date: string) {
        return request<{ entries: ActivityEntry[] }>(`/api/activity?date=${encodeURIComponent(date)}`);
      },
      add(input: ActivityInput) {
        return request<{ entry: ActivityEntry }>('/api/activity', { method: 'POST', body: input });
      },
      remove(id: string) {
        return request<{ ok: true }>(`/api/activity/${id}`, { method: 'DELETE' });
      },
    },
    stats(range: '7d' | '30d' | '90d' = '30d') {
      return request<StatsResponse>(`/api/stats?range=${range}`);
    },
    companion: {
      get() {
        return request<{ companion: CompanionState; achievements: AchievementStatus[] }>('/api/companion');
      },
      equip(accessory_id: string) {
        return request<{ companion: CompanionState }>('/api/companion/equip', { method: 'POST', body: { accessory_id } });
      },
      rename(name: string) {
        return request<{ companion: CompanionState }>('/api/companion/name', { method: 'POST', body: { name } });
      },
    },
    plans: {
      list() {
        return request<{ plans: MealPlan[] }>('/api/plans');
      },
      get(id: string) {
        return request<{ plan: MealPlan }>(`/api/plans/${id}`);
      },
      generate(preferences: PlanPreferences) {
        return request<{ plan: MealPlan }>('/api/plans', { method: 'POST', body: preferences });
      },
      update(
        id: string,
        patch: { title?: string; items?: Array<{ id: string; title: string; ingredients: string[]; instructions: string }> },
      ) {
        return request<{ plan: MealPlan }>(`/api/plans/${id}`, { method: 'PATCH', body: patch });
      },
      remove(id: string) {
        return request<{ ok: true }>(`/api/plans/${id}`, { method: 'DELETE' });
      },
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export type { SessionResponse, DailySummary, Meal, Food, StatsResponse, MealPlan, CompanionState };
