import type { FastifyInstance } from 'fastify';
import {
  deleteAccountSchema,
  onboardingSchema,
  preferencesUpdateSchema,
  profileUpdateSchema,
} from '@nutripals/core';
import { hashPassword, verifyPassword, destroyAllSessions } from '../auth.js';
import { ApiError, parseWith } from '../http.js';
import {
  computeGoalsForProfile,
  deleteUser,
  getLatestGoals,
  getPreferences,
  getProfile,
  getUserById,
  updateCompanionName,
  updatePreferences,
  updateProfileFields,
} from '../repo/users.js';
import { getCompanionState } from '../repo/insights.js';
import { listMeals } from '../repo/meals.js';
import { listActivity, listFasting, listHydrationRange, listWeight } from '../repo/habits.js';
import { listPlans } from '../services/planner.js';
import { clearSessionCookie, currentUser, sessionPayload, todayFor, type AppContext } from './shared.js';

export function registerMeRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/me/onboarding', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(onboardingSchema, request.body);
    const now = new Date().toISOString();
    updateProfileFields(ctx.db, user.id, {
      display_name: input.display_name,
      birth_year: input.birth_year,
      height_cm: input.height_cm,
      weight_kg: input.weight_kg,
      sex: input.sex,
      activity_level: input.activity_level,
      goal: input.goal,
      timezone: input.timezone,
      onboarding_completed_at: now,
    });
    const goals = computeGoalsForProfile(ctx.db, user.id);
    updatePreferences(ctx.db, user.id, {
      unit_system: input.unit_system,
      calorie_tracking_enabled: input.calorie_tracking_enabled,
      show_weight: input.show_weight,
      fasting_enabled: input.fasting_enabled,
      weight_target_kg: input.weight_target_kg ?? null,
      water_target_ml: input.water_target_ml ?? goals?.water_ml ?? 2000,
      dietary_preferences: input.dietary_preferences,
      allergies: input.allergies,
      companion_name: input.companion_name,
      reminders: undefined,
    });
    updateCompanionName(ctx.db, user.id, input.companion_name);
    return sessionPayload(ctx, user.id);
  });

  app.patch('/api/me/profile', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(profileUpdateSchema, request.body);
    const fields: Record<string, string | number | null> = {};
    for (const key of [
      'display_name',
      'birth_year',
      'height_cm',
      'weight_kg',
      'sex',
      'activity_level',
      'goal',
      'timezone',
    ] as const) {
      const value = input[key];
      if (value !== undefined) fields[key] = value;
    }
    updateProfileFields(ctx.db, user.id, fields);
    const recompute =
      input.birth_year !== undefined ||
      input.height_cm !== undefined ||
      input.weight_kg !== undefined ||
      input.sex !== undefined ||
      input.activity_level !== undefined ||
      input.goal !== undefined;
    let goals = getLatestGoals(ctx.db, user.id);
    if (recompute) goals = computeGoalsForProfile(ctx.db, user.id) ?? goals;
    return { profile: getProfile(ctx.db, user.id), goals };
  });

  app.put('/api/me/preferences', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(preferencesUpdateSchema, request.body);
    if (input.companion_name) updateCompanionName(ctx.db, user.id, input.companion_name);
    const preferences = updatePreferences(ctx.db, user.id, input as Record<string, unknown>);
    return { preferences };
  });

  app.post('/api/me/goals/recalculate', async (request) => {
    const user = currentUser(ctx, request);
    const goals = computeGoalsForProfile(ctx.db, user.id);
    if (!goals) throw new ApiError(422, 'PROFILE_INCOMPLETE', 'Add your birth year, height and weight first.');
    return { goals };
  });

  app.get('/api/me/export', async (request, reply) => {
    const user = currentUser(ctx, request);
    const profile = getProfile(ctx.db, user.id);
    const preferences = getPreferences(ctx.db, user.id);
    const meals = listMeals(ctx.db, user.id, { from: '2000-01-01', to: '2999-12-31', limit: 5000 });
    const weight = listWeight(ctx.db, user.id, { limit: 5000 });
    const hydration = listHydrationRange(ctx.db, user.id);
    const fasting = listFasting(ctx.db, user.id, 5000);
    const activity = listActivity(ctx.db, user.id);
    const plans = listPlans(ctx.db, user.id);
    const today = todayFor(user.id, ctx);
    const data = {
      exported_at: new Date().toISOString(),
      app: 'NutriPals',
      account: { id: user.id, email: user.email, created_at: user.created_at, email_verified: Boolean(user.email_verified_at) },
      profile,
      preferences,
      goals: getLatestGoals(ctx.db, user.id),
      companion: getCompanionState(ctx.db, user.id, today),
      meals,
      hydration_entries: hydration,
      weight_entries: weight,
      fasting_sessions: fasting,
      activity_entries: activity,
      meal_plans: plans,
      notes: 'Nutrition values are estimates. Photos are not retained by NutriPals.',
    };
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="nutripals-export-${today}.json"`);
    return data;
  });

  app.delete('/api/me', async (request, reply) => {
    const user = currentUser(ctx, request);
    const input = parseWith(deleteAccountSchema, request.body);
    const row = getUserById(ctx.db, user.id);
    if (!row || !(await verifyPassword(input.password, row.password_hash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Password is incorrect.');
    }
    destroyAllSessions(ctx.db, user.id);
    deleteUser(ctx.db, user.id);
    clearSessionCookie(ctx, reply);
    return { ok: true as const };
  });

  app.post('/api/me/password', async (request) => {
    const user = currentUser(ctx, request);
    const body = request.body as { password?: unknown };
    if (typeof body?.password !== 'string' || body.password.length < 10) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Use at least 10 characters.');
    }
    ctx.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      await hashPassword(body.password),
      new Date().toISOString(),
      user.id,
    );
    return { ok: true as const };
  });
}
