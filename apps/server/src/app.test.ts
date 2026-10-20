import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AnalyzeResponse, DailySummary, Meal, MealPlan, SessionResponse, StatsResponse } from '@nutripals/core';
import { localDateKey } from '@nutripals/core';
import { buildApp, type BuiltApp } from './app.js';
import type { Config } from './env.js';

const ORIGIN = 'http://localhost:5173';
const TZ = 'Africa/Kigali';

const apps: BuiltApp[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  while (apps.length > 0) {
    const instance = apps.pop();
    if (instance) await instance.app.close();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function testConfig(overrides: Partial<Config> = {}): Partial<Config> {
  return {
    databasePath: ':memory:',
    nodeEnv: 'test',
    exposeDevTokens: true,
    secureCookies: false,
    enableOpenFoodFacts: false,
    aiProvider: 'none',
    rateLimitMax: 100000,
    authRateLimitMax: 100000,
    aiHourlyLimit: 1000,
    allowedOrigins: [ORIGIN],
    ...overrides,
  };
}

async function makeApp(overrides: Partial<Config> = {}): Promise<BuiltApp> {
  const built = await buildApp({ config: testConfig(overrides) });
  apps.push(built);
  return built;
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') throw new Error('No session cookie returned');
  return value.split(';')[0] as string;
}

interface Registered {
  cookie: string;
  userId: string;
  email: string;
  password: string;
  verificationToken?: string;
}

async function register(app: FastifyInstance, email: string, password = 'correct horse battery'): Promise<Registered> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: ORIGIN },
    payload: { email, password, display_name: 'Aline', timezone: TZ },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { user: { id: string }; dev_verification_token?: string };
  return { cookie: cookieFrom(res), userId: body.user.id, email, password, verificationToken: body.dev_verification_token };
}

const onboardingPayload = {
  display_name: 'Aline',
  birth_year: 1994,
  height_cm: 165,
  weight_kg: 60,
  sex: 'female',
  activity_level: 'light',
  goal: 'maintain',
  unit_system: 'metric',
  timezone: TZ,
  calorie_tracking_enabled: true,
  show_weight: true,
  fasting_enabled: true,
  water_target_ml: 2000,
  dietary_preferences: [],
  allergies: [],
  companion_name: 'Kito',
};

async function onboard(app: FastifyInstance, user: Registered): Promise<SessionResponse> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/me/onboarding',
    headers: { cookie: user.cookie, origin: ORIGIN },
    payload: onboardingPayload,
  });
  expect(res.statusCode).toBe(200);
  return res.json() as SessionResponse;
}

async function getJson<T>(app: FastifyInstance, url: string, cookie: string): Promise<T> {
  const res = await app.inject({ method: 'GET', url, headers: { cookie, origin: ORIGIN } });
  expect(res.statusCode).toBe(200);
  return res.json() as T;
}

function authHeaders(cookie: string, extra: Record<string, string> = {}): Record<string, string> {
  return { cookie, origin: ORIGIN, ...extra };
}

describe('health and authentication', () => {
  it('reports health without authentication', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it('registers, persists a session, and rejects bad credentials', async () => {
    const { app } = await makeApp();
    const user = await register(app, 'aline@example.com');
    const session = await getJson<SessionResponse>(app, '/api/auth/session', user.cookie);
    expect(session.user.email).toBe('aline@example.com');
    expect(session.profile.onboarding_completed).toBe(false);
    expect(session.goals).toBeNull();

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'aline@example.com', password: 'wrong password here' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: authHeaders(user.cookie) });
    expect(logout.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: user.cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('verifies email and resets a password with one-time tokens', async () => {
    const { app } = await makeApp();
    const user = await register(app, 'reset@example.com');
    expect(user.verificationToken).toBeTruthy();

    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      headers: { origin: ORIGIN },
      payload: { token: user.verificationToken },
    });
    expect(verify.statusCode).toBe(200);
    const session = await getJson<SessionResponse>(app, '/api/auth/session', user.cookie);
    expect(session.user.email_verified).toBe(true);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      headers: { origin: ORIGIN },
      payload: { token: user.verificationToken },
    });
    expect(replay.statusCode).toBe(400);

    const forgot = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { origin: ORIGIN },
      payload: { email: 'reset@example.com' },
    });
    const resetToken = (forgot.json() as { dev_reset_token: string }).dev_reset_token;
    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { origin: ORIGIN },
      payload: { token: resetToken, password: 'a brand new password' },
    });
    expect(reset.statusCode).toBe(200);

    const oldSession = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: user.cookie } });
    expect(oldSession.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'reset@example.com', password: 'a brand new password' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('rejects unknown origins for mutations', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'a@b.co', password: 'whatever12345' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('onboarding, dashboard and meals', () => {
  it('completes onboarding and derives goals from the profile', async () => {
    const { app } = await makeApp();
    const user = await register(app, 'onboard@example.com');
    const session = await onboard(app, user);
    expect(session.profile.onboarding_completed).toBe(true);
    expect(session.goals?.calories).toBeGreaterThan(1200);
    expect(session.preferences.water_target_ml).toBe(2000);
    expect(session.companion.name).toBe('Kito');

    const dashboard = await getJson<DailySummary>(app, '/api/dashboard', user.cookie);
    expect(dashboard.date).toBe(localDateKey(new Date(), TZ));
    expect(dashboard.consumed.kcal).toBe(0);
    expect(dashboard.goals?.calories).toBe(session.goals?.calories);
    expect(dashboard.companion.name).toBe('Kito');
  });

  it('recomputes catalog nutrition on save, updates the dashboard, and is idempotent', async () => {
    const { app } = await makeApp();
    const user = await register(app, 'meals@example.com');
    await onboard(app, user);
    const search = await getJson<{ foods: Array<{ id: string; name: string; per_100g: { kcal: number } }> }>(
      app,
      '/api/foods/search?q=ubugari',
      user.cookie,
    );
    const ubugari = search.foods.find((food) => food.name.startsWith('Ubugari'));
    expect(ubugari).toBeTruthy();

    const payload = {
      meal_type: 'lunch',
      eaten_at: new Date().toISOString(),
      source: 'manual',
      items: [
        {
          food_id: ubugari!.id,
          name: 'Tampered name',
          quantity: 1,
          unit: 'cup',
          grams: 240,
          nutrition: { kcal: 5000, protein_g: 0, carbs_g: 0, fat_g: 0 },
        },
      ],
    };

    const first = await app.inject({
      method: 'POST',
      url: '/api/meals',
      headers: authHeaders(user.cookie, { 'idempotency-key': 'meal-key-000001' }),
      payload,
    });
    expect(first.statusCode).toBe(200);
    const meal = (first.json() as { meal: Meal }).meal;
    expect(meal.items[0]?.name).toBe('Ubugari (stiff maize meal)');
    expect(meal.items[0]?.kcal).toBeCloseTo(379.2, 1);
    expect(meal.items[0]?.source).toBe('catalog');

    const replay = await app.inject({
      method: 'POST',
      url: '/api/meals',
      headers: authHeaders(user.cookie, { 'idempotency-key': 'meal-key-000001' }),
      payload,
    });
    expect((replay.json() as { meal: Meal }).meal.id).toBe(meal.id);

    const dashboard = await getJson<DailySummary>(app, '/api/dashboard', user.cookie);
    expect(dashboard.meals).toHaveLength(1);
    expect(dashboard.consumed.kcal).toBe(379);
    expect(dashboard.remaining_kcal).toBe((dashboard.goals?.calories ?? 0) - 379);
    expect(dashboard.meal_totals_by_type.lunch?.kcal).toBe(379);

    const list = await getJson<{ meals: Meal[] }>(app, `/api/meals?date=${dashboard.date}`, user.cookie);
    expect(list.meals).toHaveLength(1);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/meals/${meal.id}`,
      headers: authHeaders(user.cookie),
      payload: {
        items: [
          {
            food_id: ubugari!.id,
            name: 'Ubugari',
            quantity: 120,
            unit: 'g',
            grams: 120,
            nutrition: { kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0 },
          },
        ],
      },
    });
    expect(patch.statusCode).toBe(200);
    const updated = (patch.json() as { meal: Meal }).meal;
    expect(updated.totals.kcal).toBe(190);
  });

  it('parses text logging and reports unmatched foods honestly', async () => {
    const { app } = await makeApp();
    const user = await register(app, 'text@example.com');
    await onboard(app, user);
    const res = await app.inject({
      method: 'POST',
      url: '/api/foods/parse',
      headers: authHeaders(user.cookie),
      payload: { text: '2 eggs and 150g rice and zorblax stew' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ name: string; grams: number | null }>; unmatched: string[] };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]?.grams).toBe(100);
    expect(body.items[1]?.grams).toBe(150);
    expect(body.unmatched).toEqual(['zorblax stew']);
  });
});

describe('ownership isolation', () => {
  it('never exposes one user’s records to another', async () => {
    const { app } = await makeApp();
    const alice = await register(app, 'alice@example.com');
    await onboard(app, alice);
    const bob = await register(app, 'bob@example.com');
    await onboard(app, bob);

    const foods = await getJson<{ foods: Array<{ id: string }> }>(app, '/api/foods/search?q=isombe', alice.cookie);
    const isombe = foods.foods[0]!;
    const mealRes = await app.inject({
      method: 'POST',
      url: '/api/meals',
      headers: authHeaders(alice.cookie),
      payload: {
        meal_type: 'dinner',
        eaten_at: new Date().toISOString(),
        items: [
          {
            food_id: isombe.id,
            name: 'Isombe',
            quantity: 200,
            unit: 'g',
            grams: 200,
            nutrition: { kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0 },
          },
        ],
      },
    });
    const meal = (mealRes.json() as { meal: Meal }).meal;

    const waterRes = await app.inject({
      method: 'POST',
      url: '/api/hydration',
      headers: authHeaders(alice.cookie),
      payload: { amount_ml: 250, logged_at: new Date().toISOString() },
    });
    const water = (waterRes.json() as { entry: { id: string } }).entry;

    const weightRes = await app.inject({
      method: 'POST',
      url: '/api/weight',
      headers: authHeaders(alice.cookie),
      payload: { weight_kg: 60.2, logged_at: new Date().toISOString() },
    });
    const weight = (weightRes.json() as { entry: { id: string } }).entry;

    const fastRes = await app.inject({
      method: 'POST',
      url: '/api/fasting',
      headers: authHeaders(alice.cookie),
      payload: { plan: '16:8', target_minutes: 960 },
    });
    const fast = (fastRes.json() as { session: { id: string } }).session;

    const planRes = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: authHeaders(alice.cookie),
      payload: { days: 1, meal_types: ['dinner'], servings: 1 },
    });
    expect(planRes.statusCode).toBe(201);
    const plan = (planRes.json() as { plan: MealPlan }).plan;

    const bobMealGet = await app.inject({ method: 'GET', url: `/api/meals/${meal.id}`, headers: { cookie: bob.cookie } });
    expect(bobMealGet.statusCode).toBe(404);
    const bobMealPatch = await app.inject({
      method: 'PATCH',
      url: `/api/meals/${meal.id}`,
      headers: authHeaders(bob.cookie),
      payload: { notes: 'hijacked' },
    });
    expect(bobMealPatch.statusCode).toBe(404);
    const bobMealDelete = await app.inject({
      method: 'DELETE',
      url: `/api/meals/${meal.id}`,
      headers: authHeaders(bob.cookie),
    });
    expect(bobMealDelete.statusCode).toBe(404);

    const bobWater = await app.inject({
      method: 'PATCH',
      url: `/api/hydration/${water.id}`,
      headers: authHeaders(bob.cookie),
      payload: { amount_ml: 300 },
    });
    expect(bobWater.statusCode).toBe(404);

    const bobWeight = await app.inject({
      method: 'DELETE',
      url: `/api/weight/${weight.id}`,
      headers: authHeaders(bob.cookie),
    });
    expect(bobWeight.statusCode).toBe(404);

    const bobFast = await app.inject({
      method: 'POST',
      url: `/api/fasting/${fast.id}/finish`,
      headers: authHeaders(bob.cookie),
    });
    expect(bobFast.statusCode).toBe(404);

    const bobPlan = await app.inject({ method: 'GET', url: `/api/plans/${plan.id}`, headers: { cookie: bob.cookie } });
    expect(bobPlan.statusCode).toBe(404);

    const bobDashboard = await getJson<DailySummary>(app, '/api/dashboard', bob.cookie);
    expect(bobDashboard.meals).toHaveLength(0);
    expect(bobDashboard.consumed.kcal).toBe(0);
    expect(bobDashboard.hydration.total_ml).toBe(0);
  });
});

describe('hydration, weight and rewards', () => {
  it('awards the hydration goal once per day and records weight history', async () => {
    const { app } = await makeApp();
    const user = await register(app, 'water@example.com');
    await onboard(app, user);

    const first = await app.inject({
      method: 'POST',
      url: '/api/hydration',
      headers: authHeaders(user.cookie),
      payload: { amount_ml: 500, logged_at: new Date().toISOString() },
    });
    expect(first.statusCode).toBe(200);
    expect((first.json() as { total_ml: number }).total_ml).toBe(500);

    const second = await app.inject({
      method: 'POST',
      url: '/api/hydration',
      headers: authHeaders(user.cookie),
      payload: { amount_ml: 1500, logged_at: new Date().toISOString() },
    });
    expect((second.json() as { total_ml: number; awarded_xp: number }).total_ml).toBe(2000);
    expect((second.json() as { awarded_xp: number }).awarded_xp).toBe(25);

    const third = await app.inject({
      method: 'POST',
      url: '/api/hydration',
      headers: authHeaders(user.cookie),
      payload: { amount_ml: 300, logged_at: new Date().toISOString() },
    });
    expect((third.json() as { awarded_xp: number }).awarded_xp).toBe(0);

    const companion = await getJson<{ companion: { recent_rewards: Array<{ event_key: string }>; xp: number } }>(
      app,
      '/api/companion',
      user.cookie,
    );
    expect(companion.companion.recent_rewards.filter((reward) => reward.event_key.startsWith('water_goal')).length).toBe(1);

    const weight = await app.inject({
      method: 'POST',
      url: '/api/weight',
      headers: authHeaders(user.cookie),
      payload: { weight_kg: 59.4, note: 'Morning', logged_at: new Date().toISOString() },
    });
    expect(weight.statusCode).toBe(200);
    const session = await getJson<SessionResponse>(app, '/api/auth/session', user.cookie);
    expect(session.profile.weight_kg).toBe(59.4);

    const weightList = await getJson<{ entries: Array<{ weight_kg: number }> }>(app, '/api/weight', user.cookie);
    expect(weightList.entries).toHaveLength(1);

    const stats = await getJson<StatsResponse>(app, '/api/stats?range=7d', user.cookie);
    expect(stats.days).toHaveLength(7);
    expect(stats.logging_days).toBeGreaterThanOrEqual(1);
    expect(stats.hydration_days_met).toBe(1);
    expect(stats.weight_series).toHaveLength(1);
    expect(stats.observations.length).toBeGreaterThan(0);
  });

  it('prevents duplicate fasting sessions and survives a restart with persisted timestamps', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'nutripals-'));
    tempDirs.push(dir);
    const dbPath = path.join(dir, 'test.db');
    const first = await makeApp({ databasePath: dbPath });
    const user = await register(first.app, 'fast@example.com');
    await onboard(first.app, user);

    const start = await first.app.inject({
      method: 'POST',
      url: '/api/fasting',
      headers: authHeaders(user.cookie),
      payload: { plan: '16:8', target_minutes: 960 },
    });
    expect(start.statusCode).toBe(201);
    const session = (start.json() as { session: { id: string; started_at: string } }).session;

    const duplicate = await first.app.inject({
      method: 'POST',
      url: '/api/fasting',
      headers: authHeaders(user.cookie),
      payload: { plan: '16:8', target_minutes: 960 },
    });
    expect(duplicate.statusCode).toBe(409);

    // Simulate a restart: close the app, reopen the same database file.
    await first.app.close();
    apps.splice(apps.indexOf(first), 1);
    const second = await makeApp({ databasePath: dbPath });
    const resumed = await getJson<{ active: { id: string; started_at: string } | null }>(second.app, '/api/fasting', user.cookie);
    expect(resumed.active?.id).toBe(session.id);
    expect(resumed.active?.started_at).toBe(session.started_at);

    const finish = await second.app.inject({
      method: 'POST',
      url: `/api/fasting/${session.id}/finish`,
      headers: authHeaders(user.cookie),
    });
    expect(finish.statusCode).toBe(200);
    expect((finish.json() as { session: { status: string } }).session.status).toBe('completed');
    expect((finish.json() as { awarded_xp: number }).awarded_xp).toBeGreaterThan(0);

    const after = await getJson<{ active: unknown }>(second.app, '/api/fasting', user.cookie);
    expect(after.active).toBeNull();
  });
});

describe('AI photo analysis', () => {
  const fakeImage = `data:image/jpeg;base64,${'A'.repeat(2400)}`;

  it('returns a clear setup state when no provider is configured', async () => {
    const { app } = await makeApp();
    const user = await register(app, 'ai-none@example.com');
    await onboard(app, user);
    const status = await getJson<{ configured: boolean; message: string }>(app, '/api/ai/status', user.cookie);
    expect(status.configured).toBe(false);
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/analyze',
      headers: authHeaders(user.cookie),
      payload: { image: fakeImage },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'AI_NOT_CONFIGURED' } });
  });

  it('validates provider output and replaces matched nutrition with catalog values', async () => {
    const analysis = {
      dish_name: 'Rice and beans',
      observation: 'Looks like a home-cooked plate.',
      clarifying_question: null,
      items: [
        {
          name: 'Rice',
          local_name: 'Umuceri',
          quantity: 1,
          unit: 'cup',
          grams: 150,
          kcal: 300,
          protein_g: 5,
          carbs_g: 60,
          fat_g: 1,
          confidence: 0.8,
          portion_uncertainty: 'medium',
        },
        {
          name: 'Mystery sauce',
          quantity: 2,
          unit: 'tbsp',
          grams: null,
          kcal: 60,
          protein_g: 1,
          carbs_g: 4,
          fat_g: 4,
          confidence: 0.3,
          portion_uncertainty: 'high',
        },
      ],
    };
    const aiFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\`` } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const { app } = await makeApp({ aiProvider: 'openai', openaiApiKey: 'test-key', openaiModel: 'test-model', aiFetch });
    const user = await register(app, 'ai@example.com');
    await onboard(app, user);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/analyze',
      headers: authHeaders(user.cookie),
      payload: { image: fakeImage },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AnalyzeResponse;
    expect(body.items[0]?.data_source).toBe('catalog');
    expect(body.items[0]?.kcal).toBe(195);
    expect(body.items[0]?.matched_food_name).toBe('Rice, cooked');
    expect(body.items[1]?.data_source).toBe('ai_estimate');
    expect(body.items[1]?.grams).toBeNull();
    expect(body.warnings.join(' ')).toMatch(/estimate/i);
  });

  it('rejects unusable model output and invalid uploads', async () => {
    const aiFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const { app } = await makeApp({ aiProvider: 'openai', openaiApiKey: 'test-key', aiFetch });
    const user = await register(app, 'ai-bad@example.com');
    await onboard(app, user);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/analyze',
      headers: authHeaders(user.cookie),
      payload: { image: `data:image/jpeg;base64,${'A'.repeat(2400)}` },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: { code: 'AI_INVALID_RESPONSE' } });

    const badImage = await app.inject({
      method: 'POST',
      url: '/api/ai/analyze',
      headers: authHeaders(user.cookie),
      payload: { image: 'data:text/plain;base64,AAAA' },
    });
    expect(badImage.statusCode).toBe(400);
  });
});

describe('external food data and meal plans', () => {
  it('merges Open Food Facts results and reports provider failures', async () => {
    const product = {
      code: '1234567890123',
      product_name: 'Peanut Butter',
      brands: 'Test Brand',
      nutriments: {
        'energy-kcal_100g': 600,
        proteins_100g: 25,
        carbohydrates_100g: 20,
        fat_100g: 50,
        fiber_100g: 6,
      },
      serving_quantity: 30,
      allergens_tags: ['en:peanuts'],
    };
    const foodFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const payload = url.includes('/api/v2/product/') ? { status: 1, product } : { products: [product] };
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const { app } = await makeApp({ enableOpenFoodFacts: true, foodFetch });
    const user = await register(app, 'off@example.com');
    await onboard(app, user);
    const res = await getJson<{ foods: Array<{ name: string; source: string; per_100g: { kcal: number } }> }>(
      app,
      '/api/foods/search?q=peanut',
      user.cookie,
    );
    const external = res.foods.find((food) => food.name === 'Peanut Butter');
    expect(external?.source).toBe('open_food_facts');
    expect(external?.per_100g.kcal).toBe(600);

    const barcode = await getJson<{ food: { name: string } }>(app, '/api/foods/barcode/1234567890123', user.cookie);
    expect(barcode.food.name).toBe('Peanut Butter');
  });

  it('generates an editable weekly plan that respects allergies and dietary filters', async () => {
    const { app } = await makeApp();
    const user = await register(app, 'planner@example.com');
    await onboard(app, user);
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: authHeaders(user.cookie),
      payload: {
        days: 3,
        meal_types: ['breakfast', 'lunch', 'dinner'],
        dietary_preferences: ['vegetarian'],
        allergies: ['milk'],
        budget: 'low',
        max_cook_minutes: 60,
        servings: 2,
        local_foods: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const plan = (res.json() as { plan: MealPlan }).plan;
    expect(plan.items).toHaveLength(9);
    expect(plan.shopping_list.length).toBeGreaterThan(3);
    expect(plan.items.every((item) => item.totals.kcal > 0)).toBe(true);
    const shopping = plan.shopping_list.map((item) => item.name.toLowerCase()).join(' ');
    expect(shopping).not.toMatch(/milk|yogurt|ikivuguto|mandazi/);
    expect(plan.items.every((item) => item.instructions.length > 10)).toBe(true);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan.id}`,
      headers: authHeaders(user.cookie),
      payload: { title: 'My local week' },
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as { plan: MealPlan }).plan.title).toBe('My local week');

    const allergyImpossible = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: authHeaders(user.cookie),
      payload: {
        days: 1,
        meal_types: ['breakfast'],
        dietary_preferences: ['vegan'],
        allergies: ['peanuts', 'milk', 'eggs', 'gluten'],
        max_cook_minutes: 5,
        servings: 1,
      },
    });
    expect(allergyImpossible.statusCode).toBe(422);
    expect(allergyImpossible.json()).toMatchObject({ error: { code: 'PLAN_NO_MATCH' } });
  });
});

describe('export and account deletion', () => {
  it('exports only the caller’s data and deletes an account cleanly', async () => {
    const { app } = await makeApp();
    const alice = await register(app, 'export-a@example.com');
    await onboard(app, alice);
    const bob = await register(app, 'export-b@example.com');
    await onboard(app, bob);
    await app.inject({
      method: 'POST',
      url: '/api/hydration',
      headers: authHeaders(alice.cookie),
      payload: { amount_ml: 500, logged_at: new Date().toISOString() },
    });

    const exportRes = await app.inject({ method: 'GET', url: '/api/me/export', headers: { cookie: alice.cookie } });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-disposition']).toContain('attachment');
    const exported = exportRes.json() as { account: { email: string }; hydration_entries: Array<{ amount_ml: number }>; meals: unknown[] };
    expect(exported.account.email).toBe('export-a@example.com');
    expect(exported.hydration_entries).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain('export-b@example.com');

    const wrongPassword = await app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: authHeaders(alice.cookie),
      payload: { password: 'not the right one', confirmation: 'DELETE' },
    });
    expect(wrongPassword.statusCode).toBe(401);

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: authHeaders(alice.cookie),
      payload: { password: alice.password, confirmation: 'DELETE' },
    });
    expect(deleted.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: alice.email, password: alice.password },
    });
    expect(login.statusCode).toBe(401);

    const bobSession = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: bob.cookie } });
    expect(bobSession.statusCode).toBe(200);
  });
});
