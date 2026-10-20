import type { FastifyInstance } from 'fastify';
import {
  MEAL_TYPES,
  aiAnalyzeRequestSchema,
  customFoodSchema,
  dateKeySchema,
  foodSearchQuerySchema,
  localDateKey,
  mealInputSchema,
  mealTotals,
  textParseSchema,
  type DailySummary,
  type MealType,
  type RoundedNutrition,
} from '@nutripals/core';
import { ApiError, parseWith } from '../http.js';
import {
  createMeal,
  deleteMeal,
  getMeal,
  insertCustomFood,
  listMeals,
  searchLocalFoods,
  updateMeal,
} from '../repo/meals.js';
import {
  activeFast,
  hydrationTotal,
  listActivity,
  listFasting,
  listHydration,
  latestWeight,
} from '../repo/habits.js';
import { activeDateKeys, awardEvent, getCompanionState } from '../repo/insights.js';
import { getLatestGoals, getPreferences, getProfile } from '../repo/users.js';
import { analyzeFoodImage, getAiStatus } from '../services/ai.js';
import { barcodeLookup, parseFoodText, searchExternalFoods } from '../services/foodSources.js';
import { currentUser, runIdempotent, todayFor, type AppContext } from './shared.js';

const EMPTY: RoundedNutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: null };

function validDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return parseWith(dateKeySchema, value);
}

function assertReasonableTimestamp(iso: string): void {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) throw new ApiError(400, 'INVALID_TIME', 'Enter a valid date and time.');
  const now = Date.now();
  if (time > now + 7 * 86_400_000) throw new ApiError(400, 'INVALID_TIME', 'You can log up to 7 days in the future.');
  if (time < Date.UTC(2000, 0, 1)) throw new ApiError(400, 'INVALID_TIME', 'That date is too far in the past.');
}

export function registerNutritionRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/dashboard', async (request) => {
    const user = currentUser(ctx, request);
    const profile = getProfile(ctx.db, user.id);
    const today = todayFor(user.id, ctx);
    const query = request.query as { date?: string };
    const date = validDate(query.date, today);

    const meals = listMeals(ctx.db, user.id, { date });
    const allItems = meals.flatMap((meal) => meal.items);
    const consumed = mealTotals(allItems);
    const byType = Object.fromEntries(MEAL_TYPES.map((type) => [type, EMPTY])) as Record<MealType, RoundedNutrition>;
    for (const type of MEAL_TYPES) {
      const typeItems = meals.filter((meal) => meal.meal_type === type).flatMap((meal) => meal.items);
      if (typeItems.length > 0) byType[type] = mealTotals(typeItems);
    }

    const hydrationEntries = listHydration(ctx.db, user.id, date);
    const waterTotal = hydrationTotal(ctx.db, user.id, date);
    const preferences = getPreferences(ctx.db, user.id);
    const goals = getLatestGoals(ctx.db, user.id);
    const weight = latestWeight(ctx.db, user.id, date);
    const activityEntries = listActivity(ctx.db, user.id, date);
    const fastingSessions = listFasting(ctx.db, user.id, 40);
    const completedToday = fastingSessions.filter(
      (session) =>
        session.status === 'completed' &&
        session.ended_at !== null &&
        localDateKey(new Date(session.ended_at), profile.timezone) === date,
    );
    const days = activeDateKeys(ctx.db, user.id);
    const activeNow = activeFast(ctx.db, user.id);
    const companion = getCompanionState(ctx.db, user.id, today);
    const summary: DailySummary = {
      date,
      goals,
      consumed,
      remaining_kcal: goals ? Math.max(0, goals.calories - consumed.kcal) : 0,
      meals,
      meal_totals_by_type: byType,
      hydration: { total_ml: waterTotal, target_ml: preferences.water_target_ml, entries: hydrationEntries },
      weight: { latest: weight, target_kg: preferences.weight_target_kg },
      activity: {
        entries: activityEntries,
        kcal_burned: activityEntries.reduce((sum, entry) => sum + (entry.kcal_burned ?? 0), 0),
      },
      fasting: { active: activeNow, completed_today: completedToday, enabled: preferences.fasting_enabled },
      companion,
      streak: companion.streak,
      logging_days: days.length,
    };

    return summary;
  });

  app.get('/api/meals', async (request) => {
    const user = currentUser(ctx, request);
    const query = request.query as { date?: string; from?: string; to?: string };
    const today = todayFor(user.id, ctx);
    if (query.date) {
      return { meals: listMeals(ctx.db, user.id, { date: validDate(query.date, today) }) };
    }
    const from = query.from ? validDate(query.from, today) : undefined;
    const to = query.to ? validDate(query.to, today) : undefined;
    return { meals: listMeals(ctx.db, user.id, { from, to }) };
  });

  app.post('/api/meals', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(mealInputSchema, request.body);
    assertReasonableTimestamp(input.eaten_at);
    const profile = getProfile(ctx.db, user.id);
    return runIdempotent(ctx, request, user.id, 'POST /api/meals', () => {
      const meal = createMeal(ctx.db, user.id, profile.timezone, input);
      const today = localDateKey(new Date(), profile.timezone);
      awardEvent(
        ctx.db,
        user.id,
        { type: 'meal_logged', mealId: meal.id, mealType: meal.meal_type, scanned: meal.source === 'ai' },
        today,
      );
      return { meal };
    });
  });

  app.patch('/api/meals/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    const input = parseWith(mealInputSchema.partial(), request.body);
    if (input.eaten_at) assertReasonableTimestamp(input.eaten_at);
    const profile = getProfile(ctx.db, user.id);
    return { meal: updateMeal(ctx.db, user.id, profile.timezone, id, input) };
  });

  app.get('/api/meals/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    return { meal: getMeal(ctx.db, user.id, id) };
  });

  app.delete('/api/meals/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    deleteMeal(ctx.db, user.id, id);
    return { ok: true as const };
  });

  app.get('/api/foods/search', async (request) => {
    const user = currentUser(ctx, request);
    const query = parseWith(foodSearchQuerySchema, request.query);
    const local = searchLocalFoods(ctx.db, user.id, query.q, query.limit);
    let external: Awaited<ReturnType<typeof searchExternalFoods>> = { foods: [], error: null };
    if (query.include_external && query.q.trim().length >= 2 && local.length < query.limit) {
      external = await searchExternalFoods(ctx.config, query.q);
    }
    const seen = new Set(local.map((food) => food.name.toLowerCase()));
    const combined = [...local, ...external.foods.filter((food) => !seen.has(food.name.toLowerCase()))].slice(0, query.limit);
    return { foods: combined, external_error: external.error };
  });

  app.get('/api/foods/barcode/:code', async (request) => {
    const { code } = request.params as { code: string };
    currentUser(ctx, request);
    return { food: await barcodeLookup(ctx.config, code) };
  });

  app.post('/api/foods', async (request, reply) => {
    const user = currentUser(ctx, request);
    const input = parseWith(customFoodSchema, request.body);
    const food = insertCustomFood(ctx.db, user.id, input);
    reply.status(201);
    return { food };
  });

  app.post('/api/foods/parse', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(textParseSchema, request.body);
    return parseFoodText(ctx.db, user.id, input.text);
  });

  app.get('/api/ai/status', async (request) => {
    currentUser(ctx, request);
    return getAiStatus(ctx.config);
  });

  app.post(
    '/api/ai/analyze',
    {
      bodyLimit: 10 * 1024 * 1024,
      config: { rateLimit: { max: ctx.config.aiHourlyLimit, timeWindow: '1 hour' } },
    },
    async (request) => {
      const user = currentUser(ctx, request);
      const input = parseWith(aiAnalyzeRequestSchema, request.body);
      const today = todayFor(user.id, ctx);
      return analyzeFoodImage(ctx.config, ctx.db, user.id, input.image, today);
    },
  );

}
