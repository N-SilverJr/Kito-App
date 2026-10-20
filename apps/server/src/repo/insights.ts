import type { Database } from '../db.js';
import { json } from '../db.js';
import type {
  Accessory,
  AchievementDefinition,
  AchievementStats,
  AchievementStatus,
  CompanionState,
  DailyStat,
  RewardEvent,
  RewardHistoryItem,
  StatsResponse,
  WeightEntry,
} from '@nutripals/core';
import {
  ACHIEVEMENTS,
  achievementProgress,
  addDaysToDateKey,
  companionReaction,
  computeStreak,
  levelForXp,
  longestStreak,
  newlyEarnedAchievements,
  rewardsFor,
  unlockedAccessories,
} from '@nutripals/core';
import { getPreferences } from './users.js';

interface CompanionRow {
  name: string;
  xp: number;
  equipped: string;
  updated_at: string;
}

export interface RewardGrantResult {
  awarded: number;
  label: string | null;
}

export function activeDateKeys(db: Database, userId: string, from?: string, to?: string): string[] {
  const params: string[] = [userId, userId, userId, userId];
  let clause = '';
  if (from) {
    clause += ' AND local_date >= ?';
    params.push(from);
  }
  if (to) {
    clause += ' AND local_date <= ?';
    params.push(to);
  }
  const rows = db
    .prepare(
      `SELECT local_date FROM meals WHERE user_id = ?${clause}
       UNION SELECT local_date FROM hydration_entries WHERE user_id = ?${clause}
       UNION SELECT local_date FROM weight_entries WHERE user_id = ?${clause}
       UNION SELECT local_date FROM activity_entries WHERE user_id = ?${clause}
       ORDER BY 1`,
    )
    .all(...params) as { local_date: string }[];
  return rows.map((row) => row.local_date);
}

export function statsForAchievements(db: Database, userId: string, today: string): AchievementStats {
  const meals = db.prepare('SELECT COUNT(*) AS count FROM meals WHERE user_id = ?').get(userId) as { count: number };
  const scanned = db.prepare("SELECT COUNT(*) AS count FROM meals WHERE user_id = ? AND source = 'ai'").get(userId) as {
    count: number;
  };
  const fasts = db
    .prepare("SELECT COUNT(*) AS count FROM fasting_sessions WHERE user_id = ? AND status = 'completed'")
    .get(userId) as { count: number };
  const weights = db.prepare('SELECT COUNT(*) AS count FROM weight_entries WHERE user_id = ?').get(userId) as { count: number };
  const plans = db.prepare('SELECT COUNT(*) AS count FROM meal_plans WHERE user_id = ?').get(userId) as { count: number };
  const customFoods = db
    .prepare('SELECT COUNT(*) AS count FROM foods WHERE created_by = ?')
    .get(userId) as { count: number };
  const target = getPreferences(db, userId).water_target_ml;
  const hydratedRow = db
    .prepare(
      `SELECT COUNT(*) AS count FROM (
         SELECT local_date, SUM(amount_ml) AS total FROM hydration_entries
          WHERE user_id = ? GROUP BY local_date HAVING total >= ?
       )`,
    )
    .get(userId, target) as { count: number };
  const days = activeDateKeys(db, userId);
  return {
    mealsLogged: Number(meals.count),
    scannedMeals: Number(scanned.count),
    currentStreak: computeStreak(days, today),
    longestStreak: longestStreak(days),
    hydrationGoalDays: Number(hydratedRow.count),
    fastsCompleted: Number(fasts.count),
    weightEntries: Number(weights.count),
    plansCreated: Number(plans.count),
    manualFoodsCreated: Number(customFoods.count),
  };
}

function recalcXp(db: Database, userId: string): number {
  const total = db
    .prepare('SELECT COALESCE(SUM(xp), 0) AS total FROM companion_rewards WHERE user_id = ?')
    .get(userId) as { total: number };
  const xp = Number(total.total);
  db.prepare('UPDATE companion_profiles SET xp = ?, updated_at = ? WHERE user_id = ?').run(xp, new Date().toISOString(), userId);
  return xp;
}

function unlockInventory(db: Database, userId: string, level: number): void {
  const now = new Date().toISOString();
  const insert = db.prepare(
    'INSERT INTO companion_inventory (user_id, accessory_id, unlocked_at) VALUES (?, ?, ?) ON CONFLICT(user_id, accessory_id) DO NOTHING',
  );
  for (const accessory of unlockedAccessories(level)) insert.run(userId, accessory.id, now);
}

/**
 * Bring derived progress up to date: awards any newly met achievements
 * (idempotent), recalculates XP from the reward ledger and unlocks cosmetics.
 */
export function syncProgress(db: Database, userId: string, today: string): AchievementDefinition[] {
  const stats = statsForAchievements(db, userId, today);
  const earnedRows = db
    .prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?')
    .all(userId) as { achievement_id: string }[];
  const earned = new Set(earnedRows.map((row) => row.achievement_id));
  const newlyEarned = newlyEarnedAchievements(stats, earned);
  const now = new Date().toISOString();
  for (const achievement of newlyEarned) {
    const insert = db
      .prepare('INSERT INTO user_achievements (user_id, achievement_id, earned_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
      .run(userId, achievement.id, now);
    if (insert.changes > 0) {
      db.prepare(
        'INSERT INTO companion_rewards (id, user_id, event_key, label, xp, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, event_key) DO NOTHING',
      ).run(crypto.randomUUID(), userId, `achievement:${achievement.id}`, achievement.title, achievement.xp, now);
    }
  }
  const xp = recalcXp(db, userId);
  unlockInventory(db, userId, levelForXp(xp).level);
  return newlyEarned;
}

function insertReward(db: Database, userId: string, eventKey: string, label: string, xp: number): boolean {
  const result = db
    .prepare(
      'INSERT INTO companion_rewards (id, user_id, event_key, label, xp, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, event_key) DO NOTHING',
    )
    .run(crypto.randomUUID(), userId, eventKey, label, xp, new Date().toISOString());
  return result.changes > 0;
}

/** Grant XP for a real event. Duplicate event keys are silently ignored. */
export function awardEvent(db: Database, userId: string, event: RewardEvent, today: string): RewardGrantResult {
  const grants = rewardsFor(event);
  let awarded = 0;
  let label: string | null = null;
  for (const grant of grants) {
    if (insertReward(db, userId, grant.eventKey, grant.label, grant.quantity)) {
      awarded += grant.quantity;
      label = grant.label;
    }
  }
  syncProgress(db, userId, today);
  return { awarded, label };
}

export function buildAchievementStatuses(db: Database, userId: string, today: string): AchievementStatus[] {
  const stats = statsForAchievements(db, userId, today);
  const rows = db
    .prepare('SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = ?')
    .all(userId) as { achievement_id: string; earned_at: string }[];
  const earned = new Map(rows.map((row) => [row.achievement_id, row.earned_at]));
  return ACHIEVEMENTS.map((achievement) => ({
    id: achievement.id,
    title: achievement.title,
    description: achievement.description,
    icon: achievement.icon,
    xp: achievement.xp,
    target: achievement.target,
    progress: achievementProgress(stats, achievement),
    earned: earned.has(achievement.id),
    earned_at: earned.get(achievement.id) ?? null,
  }));
}

export function getCompanionState(db: Database, userId: string, today: string): CompanionState {
  syncProgress(db, userId, today);
  let row = db.prepare('SELECT * FROM companion_profiles WHERE user_id = ?').get(userId) as unknown as CompanionRow | undefined;
  if (!row) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO companion_profiles (user_id, name, xp, equipped, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)').run(
      userId,
      'Kito',
      '{}',
      now,
      now,
    );
    row = db.prepare('SELECT * FROM companion_profiles WHERE user_id = ?').get(userId) as unknown as CompanionRow;
  }
  const level = levelForXp(row.xp);
  const unlocked = unlockedAccessories(level.level);
  const unlockedIds = new Set(unlocked.map((item) => item.id));
  const storedEquipped = json<Record<string, string>>(row.equipped, {});
  const equipped: CompanionState['equipped'] = {};
  for (const slot of ['hat', 'scarf', 'face', 'backdrop'] as const) {
    const id = storedEquipped[slot];
    if (id && unlockedIds.has(id)) equipped[slot] = id;
  }

  const stats = statsForAchievements(db, userId, today);
  const mealsToday = db
    .prepare('SELECT COUNT(*) AS count FROM meals WHERE user_id = ? AND local_date = ?')
    .get(userId, today) as { count: number };
  const context = Number(mealsToday.count) === 0 ? 'empty_day' : stats.currentStreak >= 3 ? 'streak' : 'idle';
  const reaction = companionReaction(context, today);

  const rewards = db
    .prepare('SELECT id, event_key, label, xp, created_at FROM companion_rewards WHERE user_id = ? ORDER BY created_at DESC LIMIT 12')
    .all(userId) as unknown as RewardHistoryItem[];
  const achievementRows = db
    .prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?')
    .all(userId) as { achievement_id: string }[];

  return {
    name: row.name,
    xp: row.xp,
    level: level.level,
    xp_into_level: level.intoLevel,
    xp_for_next_level: level.nextLevelAt,
    level_progress: level.progress,
    unlocked,
    equipped,
    mood: reaction.mood,
    message: reaction.message,
    achievements: ACHIEVEMENTS.map((a) => ({ ...a })),
    earned_achievements: achievementRows.map((a) => a.achievement_id),
    streak: stats.currentStreak,
    longest_streak: stats.longestStreak,
    recent_rewards: rewards,
  };
}

export function equipAccessory(db: Database, userId: string, today: string, accessoryId: string): CompanionState {
  const state = getCompanionState(db, userId, today);
  const accessory: Accessory | undefined = state.unlocked.find((item) => item.id === accessoryId);
  if (!accessory) {
    throw new Error('ACCESSORY_LOCKED');
  }
  const equipped: Record<string, string> = { ...state.equipped };
  if (equipped[accessory.slot] === accessoryId) delete equipped[accessory.slot];
  else equipped[accessory.slot] = accessoryId;
  db.prepare('UPDATE companion_profiles SET equipped = ?, updated_at = ? WHERE user_id = ?').run(
    JSON.stringify(equipped),
    new Date().toISOString(),
    userId,
  );
  return getCompanionState(db, userId, today);
}

// ------------------------------------------------------------------- stats

interface MealAggRow {
  local_date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  meals: number;
}
interface WaterAggRow {
  local_date: string;
  total: number;
}

export function buildStats(
  db: Database,
  userId: string,
  timezone: string,
  range: '7d' | '30d' | '90d',
  today: string,
): StatsResponse {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = addDaysToDateKey(today, -(days - 1));
  const end = today;

  const mealRows = db
    .prepare(
      `SELECT m.local_date AS local_date,
              COALESCE(SUM(i.kcal), 0) AS kcal,
              COALESCE(SUM(i.protein_g), 0) AS protein,
              COALESCE(SUM(i.carbs_g), 0) AS carbs,
              COALESCE(SUM(i.fat_g), 0) AS fat,
              COALESCE(SUM(i.fiber_g), 0) AS fiber,
              COUNT(DISTINCT m.id) AS meals
         FROM meals m JOIN meal_items i ON i.meal_id = m.id
        WHERE m.user_id = ? AND m.local_date BETWEEN ? AND ?
        GROUP BY m.local_date`,
    )
    .all(userId, start, end) as unknown as MealAggRow[];
  const waterRows = db
    .prepare(
      `SELECT local_date, SUM(amount_ml) AS total FROM hydration_entries
        WHERE user_id = ? AND local_date BETWEEN ? AND ? GROUP BY local_date`,
    )
    .all(userId, start, end) as unknown as WaterAggRow[];
  const weightRows = db
    .prepare('SELECT * FROM weight_entries WHERE user_id = ? AND local_date BETWEEN ? AND ? ORDER BY logged_at ASC')
    .all(userId, start, end) as {
    id: string;
    local_date: string;
    weight_kg: number;
    note: string | null;
    logged_at: string;
  }[];
  const activityRows = db
    .prepare(
      `SELECT local_date, COUNT(*) AS count, COALESCE(SUM(minutes), 0) AS minutes, COALESCE(SUM(kcal_burned), 0) AS kcal
         FROM activity_entries WHERE user_id = ? AND local_date BETWEEN ? AND ? GROUP BY local_date`,
    )
    .all(userId, start, end) as { local_date: string; count: number; minutes: number; kcal: number }[];

  const mealByDate = new Map(mealRows.map((row) => [row.local_date, row]));
  const waterByDate = new Map(waterRows.map((row) => [row.local_date, Number(row.total)]));
  const weightByDate = new Map<string, { id: string; weight_kg: number; note: string | null; logged_at: string }>();
  for (const row of weightRows) weightByDate.set(row.local_date, row);

  const preferences = getPreferences(db, userId);
  const goals = db
    .prepare('SELECT * FROM nutrition_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(userId) as { calories: number; fiber_g: number; protein_g: number } | undefined;

  const daily: DailyStat[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDaysToDateKey(start, offset);
    const meal = mealByDate.get(date);
    const weight = weightByDate.get(date);
    daily.push({
      date,
      kcal: Math.round(Number(meal?.kcal ?? 0)),
      protein_g: Math.round(Number(meal?.protein ?? 0) * 10) / 10,
      carbs_g: Math.round(Number(meal?.carbs ?? 0) * 10) / 10,
      fat_g: Math.round(Number(meal?.fat ?? 0) * 10) / 10,
      fiber_g: Math.round(Number(meal?.fiber ?? 0) * 10) / 10,
      water_ml: waterByDate.get(date) ?? 0,
      meals: Number(meal?.meals ?? 0),
      weight_kg: weight ? weight.weight_kg : null,
    });
  }

  const mealDays = daily.filter((day) => day.meals > 0);
  const waterDays = daily.filter((day) => day.water_ml > 0);
  const avg = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);
  const rounded = (value: number) => Math.round(value * 10) / 10;

  const loggingDays = daily.filter((day) => day.meals > 0 || day.water_ml > 0 || day.weight_kg !== null).length;
  const hydrationDaysMet = daily.filter((day) => day.water_ml >= preferences.water_target_ml).length;
  const fiberDaysMet = goals ? daily.filter((day) => day.fiber_g >= goals.fiber_g).length : 0;
  const weightSeries: WeightEntry[] = weightRows.map((row) => ({
    id: row.id,
    date: row.local_date,
    weight_kg: row.weight_kg,
    note: row.note,
    logged_at: row.logged_at,
  }));
  const weightChange =
    weightSeries.length >= 2 && weightSeries[0] && weightSeries[weightSeries.length - 1]
      ? Math.round((weightSeries[weightSeries.length - 1]!.weight_kg - weightSeries[0].weight_kg) * 10) / 10
      : null;

  const observations: string[] = [];
  if (loggingDays === 0) {
    observations.push('No entries in this period yet. Log a meal or some water to start seeing patterns.');
  } else {
    observations.push(
      `${loggingDays} of the last ${days} days ${loggingDays === 1 ? 'has' : 'have'} a check-in.`,
    );
    if (mealDays.length > 0) {
      observations.push(
        `Meals averaged about ${Math.round(avg(mealDays.map((day) => day.kcal)))} kcal on the ${mealDays.length} day${mealDays.length === 1 ? '' : 's'} you logged food.`,
      );
      const proteinAvg = avg(mealDays.map((day) => day.protein_g));
      if (goals) {
        observations.push(
          `Protein averaged ${Math.round(proteinAvg)} g per logged day (your target is ${Math.round(goals.protein_g)} g).`,
        );
        if (mealDays.length >= 3 && proteinAvg < goals.protein_g * 0.8) {
          observations.push('Protein has been below your target on average. This is an observation about logged meals, not a recommendation.');
        }
      }
    }
    if (waterDays.length > 0) {
      observations.push(
        `Hydration goal met on ${hydrationDaysMet} of ${days} days; average intake on logged days was ${Math.round(avg(waterDays.map((day) => day.water_ml)))} ml.`,
      );
    }
    if (weightChange !== null) {
      observations.push(
        `Recorded weight changed by ${weightChange > 0 ? '+' : ''}${weightChange} kg between your first and last entry in this period. Daily fluctuations are normal; this is not a prediction.`,
      );
    }
    if (fiberDaysMet > 0) observations.push(`Fiber target reached on ${fiberDaysMet} day${fiberDaysMet === 1 ? '' : 's'}.`);
    if (activityRows.length > 0) {
      const totalMinutes = activityRows.reduce((sum, row) => sum + Number(row.minutes), 0);
      observations.push(
        `Activity logged on ${activityRows.length} day${activityRows.length === 1 ? '' : 's'} (${totalMinutes} minutes in total). Burn estimates are approximate and are not added to your calorie target.`,
      );
    }
    if (mealDays.length < 3) observations.push('A few more logged days will make these averages more meaningful.');
  }

  const todayStats = statsForAchievements(db, userId, today);
  return {
    range,
    start,
    end,
    days: daily,
    averages: {
      kcal: Math.round(avg(mealDays.map((day) => day.kcal))),
      protein_g: rounded(avg(mealDays.map((day) => day.protein_g))),
      carbs_g: rounded(avg(mealDays.map((day) => day.carbs_g))),
      fat_g: rounded(avg(mealDays.map((day) => day.fat_g))),
      water_ml: Math.round(avg(waterDays.map((day) => day.water_ml))),
      meals_per_day: rounded(avg(mealDays.map((day) => day.meals))),
    },
    logging_days: loggingDays,
    hydration_days_met: hydrationDaysMet,
    fiber_days_met: fiberDaysMet,
    goal_calories: goals?.calories ?? null,
    weight_series: weightSeries,
    weight_change_kg: weightChange,
    current_streak: todayStats.currentStreak,
    longest_streak: todayStats.longestStreak,
    observations,
    achievements: buildAchievementStatuses(db, userId, today),
  };
}
