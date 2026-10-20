import type { Database } from '../db.js';
import { json } from '../db.js';
import { ApiError, newId } from '../http.js';
import type { Goals, Preferences, Profile, User } from '@nutripals/core';
import { calculateGoals, localDateKey, type GoalInput } from '@nutripals/core';
import type { ReminderPreferences } from '@nutripals/core';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  user_id: string;
  display_name: string;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  sex: Profile['sex'];
  activity_level: Profile['activity_level'];
  goal: Profile['goal'];
  timezone: string;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreferencesRow {
  user_id: string;
  theme: Preferences['theme'];
  unit_system: Preferences['unit_system'];
  calorie_tracking_enabled: number;
  show_weight: number;
  fasting_enabled: number;
  water_target_ml: number;
  weight_target_kg: number | null;
  dietary_preferences: string;
  allergies: string;
  companion_name: string;
  locale: string;
  weekly_plan_budget: Preferences['weekly_plan_budget'];
  reminders: string | null;
  updated_at: string;
}

export function defaultReminders(): ReminderPreferences {
  return {
    meals: { enabled: false, time: '12:30', days: [0, 1, 2, 3, 4, 5, 6] },
    water: { enabled: false, start: '08:00', end: '20:00', every_minutes: 120 },
    weight: { enabled: false, time: '07:30', days: [1] },
    fasting: { enabled: false },
    quiet_hours: { enabled: true, start: '21:30', end: '07:00' },
  };
}

export function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    email_verified: Boolean(row.email_verified_at),
    created_at: row.created_at,
  };
}

export function rowToProfile(row: ProfileRow): Profile {
  return {
    display_name: row.display_name,
    birth_year: row.birth_year,
    height_cm: row.height_cm,
    weight_kg: row.weight_kg,
    sex: row.sex,
    activity_level: row.activity_level,
    goal: row.goal,
    timezone: row.timezone,
    onboarding_completed: Boolean(row.onboarding_completed_at),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function rowToPreferences(row: PreferencesRow): Preferences {
  return {
    theme: row.theme,
    unit_system: row.unit_system,
    calorie_tracking_enabled: Boolean(row.calorie_tracking_enabled),
    show_weight: Boolean(row.show_weight),
    fasting_enabled: Boolean(row.fasting_enabled),
    water_target_ml: row.water_target_ml,
    weight_target_kg: row.weight_target_kg,
    dietary_preferences: json<string[]>(row.dietary_preferences, []),
    allergies: json<string[]>(row.allergies, []),
    companion_name: row.companion_name,
    locale: row.locale,
    weekly_plan_budget: row.weekly_plan_budget,
    reminders: { ...defaultReminders(), ...json<Partial<ReminderPreferences>>(row.reminders, {}) },
  };
}

interface GoalRow {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
  method: string;
  assumptions: string;
  created_at: string;
}

export function rowToGoals(row: GoalRow): Goals {
  return {
    calories: row.calories,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    fiber_g: row.fiber_g,
    water_ml: row.water_ml,
    method: row.method,
    assumptions: json<string[]>(row.assumptions, []),
    updated_at: row.created_at,
  };
}

export function getUserById(db: Database, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
}

export function getUserByEmail(db: Database, email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email.toLowerCase()) as unknown as UserRow | undefined;
}

export function getProfileRow(db: Database, userId: string): ProfileRow {
  const row = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) as unknown as ProfileRow | undefined;
  if (!row) throw new ApiError(500, 'PROFILE_MISSING', 'Profile is missing for this account.');
  return row;
}

export function getProfile(db: Database, userId: string): Profile {
  return rowToProfile(getProfileRow(db, userId));
}

export function getPreferencesRow(db: Database, userId: string): PreferencesRow {
  const row = db.prepare('SELECT * FROM preferences WHERE user_id = ?').get(userId) as unknown as PreferencesRow | undefined;
  if (!row) throw new ApiError(500, 'PREFERENCES_MISSING', 'Preferences are missing for this account.');
  return row;
}

export function getPreferences(db: Database, userId: string): Preferences {
  return rowToPreferences(getPreferencesRow(db, userId));
}

export function getLatestGoals(db: Database, userId: string): Goals | null {
  const row = db
    .prepare('SELECT * FROM nutrition_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(userId) as unknown as GoalRow | undefined;
  return row ? rowToGoals(row) : null;
}

export function createUser(
  db: Database,
  input: { email: string; passwordHash: string; displayName: string; timezone: string },
): UserRow {
  const now = new Date().toISOString();
  const id = newId();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      'INSERT INTO users (id, email, password_hash, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)',
    ).run(id, input.email.toLowerCase(), input.passwordHash, now, now);
    db.prepare(
      `INSERT INTO profiles (user_id, display_name, sex, activity_level, goal, timezone, created_at, updated_at)
       VALUES (?, ?, 'unspecified', 'light', 'maintain', ?, ?, ?)`,
    ).run(id, input.displayName, input.timezone, now, now);
    db.prepare(
      `INSERT INTO preferences (user_id, dietary_preferences, allergies, companion_name, reminders, updated_at)
       VALUES (?, '[]', '[]', 'Kito', ?, ?)`,
    ).run(id, JSON.stringify(defaultReminders()), now);
    db.prepare(
      'INSERT INTO companion_profiles (user_id, name, xp, equipped, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)',
    ).run(id, 'Kito', '{}', now, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (/UNIQUE constraint failed: users.email/i.test((error as Error).message)) {
      throw new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
    }
    throw error;
  }
  return getUserById(db, id) as unknown as UserRow;
}

const PROFILE_COLUMNS = new Set([
  'display_name',
  'birth_year',
  'height_cm',
  'weight_kg',
  'sex',
  'activity_level',
  'goal',
  'timezone',
  'onboarding_completed_at',
]);

export function updateProfileFields(db: Database, userId: string, fields: Record<string, string | number | null>): void {
  const entries = Object.entries(fields).filter(([key]) => PROFILE_COLUMNS.has(key));
  if (entries.length === 0) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  db.prepare(`UPDATE profiles SET ${assignments}, updated_at = ? WHERE user_id = ?`).run(
    ...entries.map(([, value]) => value),
    new Date().toISOString(),
    userId,
  );
}

export function saveGoals(db: Database, userId: string, result: ReturnType<typeof calculateGoals>, dateKey: string): Goals {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO nutrition_goals
       (id, user_id, effective_from, calories, protein_g, carbs_g, fat_g, fiber_g, water_ml, method, assumptions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    userId,
    dateKey,
    result.calories,
    result.protein_g,
    result.carbs_g,
    result.fat_g,
    result.fiber_g,
    result.water_ml,
    result.method,
    JSON.stringify(result.assumptions),
    now,
  );
  return getLatestGoals(db, userId) as Goals;
}

export function computeGoalsForProfile(db: Database, userId: string, now = new Date()): Goals | null {
  const profile = getProfileRow(db, userId);
  if (profile.birth_year === null || profile.height_cm === null || profile.weight_kg === null) return null;
  const input: GoalInput = {
    sex: profile.sex,
    birthYear: profile.birth_year,
    heightCm: profile.height_cm,
    weightKg: profile.weight_kg,
    activityLevel: profile.activity_level,
    goal: profile.goal,
    now,
  };
  const result = calculateGoals(input);
  return saveGoals(db, userId, result, localDateKey(now, profile.timezone));
}

export function updatePreferences(
  db: Database,
  userId: string,
  patch: Record<string, unknown>,
): Preferences {
  const merged: Record<string, string | number | null> = {};
  const mapping: Record<string, string> = {
    theme: 'theme',
    unit_system: 'unit_system',
    calorie_tracking_enabled: 'calorie_tracking_enabled',
    show_weight: 'show_weight',
    fasting_enabled: 'fasting_enabled',
    water_target_ml: 'water_target_ml',
    weight_target_kg: 'weight_target_kg',
    companion_name: 'companion_name',
    weekly_plan_budget: 'weekly_plan_budget',
  };
  for (const [key, column] of Object.entries(mapping)) {
    const value = patch[key];
    if (value === undefined) continue;
    merged[column] = typeof value === 'boolean' ? (value ? 1 : 0) : (value as string | number | null);
  }
  if (patch.dietary_preferences !== undefined) merged.dietary_preferences = JSON.stringify(patch.dietary_preferences);
  if (patch.allergies !== undefined) merged.allergies = JSON.stringify(patch.allergies);
  if (patch.reminders !== undefined) merged.reminders = JSON.stringify(patch.reminders);
  const entries = Object.entries(merged);
  if (entries.length > 0) {
    const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
    db.prepare(`UPDATE preferences SET ${assignments}, updated_at = ? WHERE user_id = ?`).run(
      ...entries.map(([, value]) => value),
      new Date().toISOString(),
      userId,
    );
  }
  return getPreferences(db, userId);
}

export function updateCompanionName(db: Database, userId: string, name: string): void {
  db.prepare('UPDATE companion_profiles SET name = ?, updated_at = ? WHERE user_id = ?').run(
    name,
    new Date().toISOString(),
    userId,
  );
  db.prepare('UPDATE preferences SET companion_name = ?, updated_at = ? WHERE user_id = ?').run(
    name,
    new Date().toISOString(),
    userId,
  );
}

export function deleteUser(db: Database, userId: string): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
