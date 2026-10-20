import type { FastifyInstance } from 'fastify';
import {
  ACTIVITY_TYPES,
  activityInputSchema,
  dateKeySchema,
  estimateActivityKcal,
  fastingStartSchema,
  hydrationInputSchema,
  localDateKey,
  weightInputSchema,
} from '@nutripals/core';
import { ApiError, parseWith } from '../http.js';
import {
  addActivity,
  addHydration,
  addWeight,
  activeFast,
  deleteActivity,
  deleteHydration,
  deleteWeight,
  finishFast,
  hydrationTotal,
  listActivity,
  listFasting,
  listHydration,
  listWeight,
  startFast,
  updateHydration,
  updateWeight,
} from '../repo/habits.js';
import { awardEvent } from '../repo/insights.js';
import { getPreferences, getProfile } from '../repo/users.js';
import { currentUser, runIdempotent, todayFor, type AppContext } from './shared.js';

function assertTime(iso: string): void {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) throw new ApiError(400, 'INVALID_TIME', 'Enter a valid date and time.');
  if (time > Date.now() + 7 * 86_400_000) throw new ApiError(400, 'INVALID_TIME', 'You can log up to 7 days ahead.');
  if (time < Date.UTC(2000, 0, 1)) throw new ApiError(400, 'INVALID_TIME', 'That date is too far in the past.');
}

function validDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return parseWith(dateKeySchema, value);
}

export function registerHabitRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ------------------------------------------------------------- hydration
  app.get('/api/hydration', async (request) => {
    const user = currentUser(ctx, request);
    const query = request.query as { date?: string };
    const date = validDate(query.date, todayFor(user.id, ctx));
    const entries = listHydration(ctx.db, user.id, date);
    return { entries, total_ml: entries.reduce((sum, entry) => sum + entry.amount_ml, 0) };
  });

  app.post('/api/hydration', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(hydrationInputSchema, request.body);
    assertTime(input.logged_at);
    const profile = getProfile(ctx.db, user.id);
    const preferences = getPreferences(ctx.db, user.id);
    const date = localDateKey(new Date(input.logged_at), profile.timezone);
    const before = hydrationTotal(ctx.db, user.id, date);
    return runIdempotent(ctx, request, user.id, 'POST /api/hydration', () => {
      const entry = addHydration(ctx.db, user.id, profile.timezone, input);
      const total = hydrationTotal(ctx.db, user.id, date);
      let awarded = 0;
      if (before < preferences.water_target_ml && total >= preferences.water_target_ml) {
        const grant = awardEvent(ctx.db, user.id, { type: 'water_goal', dayKey: date }, todayFor(user.id, ctx));
        awarded = grant.awarded;
      }
      return { entry, total_ml: total, awarded_xp: awarded };
    });
  });

  app.patch('/api/hydration/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    const body = request.body as { amount_ml?: unknown };
    if (typeof body?.amount_ml !== 'number' || !Number.isInteger(body.amount_ml) || body.amount_ml < 10 || body.amount_ml > 5000) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Enter an amount between 10 and 5000 ml.');
    }
    return { entry: updateHydration(ctx.db, user.id, id, body.amount_ml) };
  });

  app.delete('/api/hydration/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    deleteHydration(ctx.db, user.id, id);
    return { ok: true as const };
  });

  // ---------------------------------------------------------------- weight
  app.get('/api/weight', async (request) => {
    const user = currentUser(ctx, request);
    const query = request.query as { from?: string; to?: string; limit?: string };
    const from = query.from ? parseWith(dateKeySchema, query.from) : undefined;
    const to = query.to ? parseWith(dateKeySchema, query.to) : undefined;
    const limit = query.limit ? Number(query.limit) : undefined;
    return { entries: listWeight(ctx.db, user.id, { from, to, limit }) };
  });

  app.post('/api/weight', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(weightInputSchema, request.body);
    assertTime(input.logged_at);
    const profile = getProfile(ctx.db, user.id);
    return runIdempotent(ctx, request, user.id, 'POST /api/weight', () => {
      const entry = addWeight(ctx.db, user.id, profile.timezone, input);
      const award = awardEvent(ctx.db, user.id, { type: 'weight_logged', dayKey: entry.date }, todayFor(user.id, ctx));
      return { entry, awarded_xp: award.awarded };
    });
  });

  app.patch('/api/weight/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    const body = request.body as { weight_kg?: unknown; note?: unknown; logged_at?: unknown };
    const input: { weight_kg?: number; note?: string | null; logged_at?: string } = {};
    if (body.weight_kg !== undefined) {
      if (typeof body.weight_kg !== 'number' || body.weight_kg < 20 || body.weight_kg > 400) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Weight must be between 20 and 400 kg.');
      }
      input.weight_kg = body.weight_kg;
    }
    if (body.note !== undefined) input.note = typeof body.note === 'string' ? body.note.slice(0, 280) : null;
    if (body.logged_at !== undefined) {
      if (typeof body.logged_at !== 'string') throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid timestamp.');
      assertTime(body.logged_at);
      input.logged_at = body.logged_at;
    }
    const profile = getProfile(ctx.db, user.id);
    return { entry: updateWeight(ctx.db, user.id, id, input, profile.timezone) };
  });

  app.delete('/api/weight/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    deleteWeight(ctx.db, user.id, id);
    return { ok: true as const };
  });

  // --------------------------------------------------------------- fasting
  app.get('/api/fasting', async (request) => {
    const user = currentUser(ctx, request);
    return { active: activeFast(ctx.db, user.id), sessions: listFasting(ctx.db, user.id, 30) };
  });

  app.post('/api/fasting', async (request, reply) => {
    const user = currentUser(ctx, request);
    const input = parseWith(fastingStartSchema, request.body);
    const session = startFast(ctx.db, user.id, input);
    reply.status(201);
    return { session };
  });

  app.post('/api/fasting/:id/finish', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    const session = finishFast(ctx.db, user.id, id, false);
    const award = awardEvent(
      ctx.db,
      user.id,
      { type: 'fast_completed', sessionId: session.id, minutes: session.elapsed_minutes ?? 0 },
      todayFor(user.id, ctx),
    );
    return { session, awarded_xp: award.awarded };
  });

  app.post('/api/fasting/:id/cancel', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    return { session: finishFast(ctx.db, user.id, id, true) };
  });

  // -------------------------------------------------------------- activity
  app.get('/api/activity', async (request) => {
    const user = currentUser(ctx, request);
    const query = request.query as { date?: string };
    const date = validDate(query.date, todayFor(user.id, ctx));
    return { entries: listActivity(ctx.db, user.id, date) };
  });

  app.post('/api/activity', async (request, reply) => {
    const user = currentUser(ctx, request);
    const input = parseWith(activityInputSchema, request.body);
    assertTime(input.logged_at);
    const profile = getProfile(ctx.db, user.id);
    const met = ACTIVITY_TYPES.find((item) => item.id === input.type)?.met ?? 4;
    const kcalBurned =
      input.kcal_burned ?? (profile.weight_kg ? estimateActivityKcal(met, profile.weight_kg, input.minutes) : null);
    const entry = addActivity(ctx.db, user.id, profile.timezone, { ...input, kcal_burned: kcalBurned });
    reply.status(201);
    return { entry };
  });

  app.delete('/api/activity/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    deleteActivity(ctx.db, user.id, id);
    return { ok: true as const };
  });
}
