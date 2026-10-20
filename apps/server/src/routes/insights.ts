import type { FastifyInstance } from 'fastify';
import {
  equipSchema,
  companionNameSchema,
  mealPlanPatchSchema,
  planPreferencesSchema,
  reminderPreferencesSchema,
  startOfLocalWeekUtc,
  type StatsResponse,
} from '@nutripals/core';
import { ApiError, parseWith } from '../http.js';
import { buildAchievementStatuses, awardEvent, buildStats, equipAccessory, getCompanionState } from '../repo/insights.js';
import { getPreferences, getProfile, updateCompanionName, updatePreferences } from '../repo/users.js';
import { deletePlan, generatePlan, getPlan, listPlans, updatePlan } from '../services/planner.js';
import { currentUser, todayFor, type AppContext } from './shared.js';

export function registerInsightRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/stats', async (request) => {
    const user = currentUser(ctx, request);
    const query = request.query as { range?: string };
    const range = query.range === '7d' || query.range === '90d' ? query.range : '30d';
    const profile = getProfile(ctx.db, user.id);
    const today = todayFor(user.id, ctx);
    const result: StatsResponse = buildStats(ctx.db, user.id, profile.timezone, range, today);
    return result;
  });

  app.get('/api/companion', async (request) => {
    const user = currentUser(ctx, request);
    const today = todayFor(user.id, ctx);
    return {
      companion: getCompanionState(ctx.db, user.id, today),
      achievements: buildAchievementStatuses(ctx.db, user.id, today),
    };
  });

  app.post('/api/companion/equip', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(equipSchema, request.body);
    const today = todayFor(user.id, ctx);
    try {
      return { companion: equipAccessory(ctx.db, user.id, today, input.accessory_id) };
    } catch (error) {
      if ((error as Error).message === 'ACCESSORY_LOCKED') {
        throw new ApiError(403, 'ACCESSORY_LOCKED', 'Keep logging to unlock this item.');
      }
      throw error;
    }
  });

  app.post('/api/companion/name', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(companionNameSchema, request.body);
    updateCompanionName(ctx.db, user.id, input.name);
    const today = todayFor(user.id, ctx);
    return { companion: getCompanionState(ctx.db, user.id, today) };
  });

  app.get('/api/plans', async (request) => {
    const user = currentUser(ctx, request);
    return { plans: listPlans(ctx.db, user.id) };
  });

  app.post(
    '/api/plans',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const user = currentUser(ctx, request);
      const input = parseWith(planPreferencesSchema, request.body);
      const profile = getProfile(ctx.db, user.id);
      const today = todayFor(user.id, ctx);
      const { weekStart } = startOfLocalWeekUtc(new Date(), profile.timezone, 1);
      const plan = generatePlan(ctx.db, user.id, weekStart || today, input);
      awardEvent(ctx.db, user.id, { type: 'plan_created', planId: plan.id }, today);
      reply.status(201);
      return { plan };
    },
  );

  app.get('/api/plans/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    return { plan: getPlan(ctx.db, user.id, id) };
  });

  app.patch('/api/plans/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    const input = parseWith(mealPlanPatchSchema, request.body);
    return { plan: updatePlan(ctx.db, user.id, id, input) };
  });

  app.delete('/api/plans/:id', async (request) => {
    const user = currentUser(ctx, request);
    const { id } = request.params as { id: string };
    deletePlan(ctx.db, user.id, id);
    return { ok: true as const };
  });

  app.get('/api/notifications', async (request) => {
    const user = currentUser(ctx, request);
    return { reminders: getPreferences(ctx.db, user.id).reminders };
  });

  app.put('/api/notifications', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(reminderPreferencesSchema, request.body);
    const preferences = updatePreferences(ctx.db, user.id, { reminders: input });
    return { reminders: preferences.reminders };
  });

  app.get('/api/health', async () => ({
    ok: true,
    version: '0.1.0',
    time: new Date().toISOString(),
  }));
}
