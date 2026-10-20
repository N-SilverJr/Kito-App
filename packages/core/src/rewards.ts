/**
 * Gamification rules. Everything here is deterministic so the same event always
 * produces the same grant. The server stores grants with a unique
 * (user_id, event_key) constraint, making repeated requests idempotent.
 */

export type RewardEvent =
  | { type: 'meal_logged'; mealId: string; mealType: string; scanned: boolean }
  | { type: 'water_goal'; dayKey: string }
  | { type: 'weight_logged'; dayKey: string }
  | { type: 'fast_completed'; sessionId: string; minutes: number }
  | { type: 'plan_created'; planId: string };

export interface RewardGrant {
  eventKey: string;
  quantity: number;
  label: string;
}

export function eventKeyFor(event: RewardEvent): string {
  switch (event.type) {
    case 'meal_logged':
      return `meal:${event.mealId}`;
    case 'water_goal':
      return `water_goal:${event.dayKey}`;
    case 'weight_logged':
      return `weight:${event.dayKey}`;
    case 'fast_completed':
      return `fast:${event.sessionId}`;
    case 'plan_created':
      return `plan:${event.planId}`;
  }
}

/** XP is for consistency, never for eating less or losing weight. */
export function rewardsFor(event: RewardEvent): RewardGrant[] {
  const key = eventKeyFor(event);
  switch (event.type) {
    case 'meal_logged': {
      const quantity = 10 + (event.scanned ? 3 : 0);
      return [{ eventKey: key, quantity, label: 'Meal logged' }];
    }
    case 'water_goal':
      return [{ eventKey: key, quantity: 25, label: 'Hydration goal reached' }];
    case 'weight_logged':
      return [{ eventKey: key, quantity: 10, label: 'Check-in recorded' }];
    case 'fast_completed': {
      const bonus = event.minutes >= 12 * 60 ? 5 : 0;
      return [{ eventKey: key, quantity: 20 + bonus, label: 'Fast completed' }];
    }
    case 'plan_created':
      return [{ eventKey: key, quantity: 15, label: 'Meal plan created' }];
  }
}

export const LEVEL_THRESHOLDS = [
  0, 120, 320, 640, 1080, 1640, 2320, 3120, 4040, 5080, 6240, 7520, 8920, 10440, 12120, 13960,
] as const;

export interface LevelInfo {
  level: number;
  xp: number;
  intoLevel: number;
  span: number;
  nextLevelAt: number | null;
  progress: number;
}

export function levelForXp(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp));
  let index = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    const threshold = LEVEL_THRESHOLDS[i];
    if (threshold !== undefined && safeXp >= threshold) index = i;
  }
  const current = LEVEL_THRESHOLDS[index] ?? 0;
  const next = LEVEL_THRESHOLDS[index + 1] ?? null;
  const span = next === null ? 1 : next - current;
  const intoLevel = safeXp - current;
  return {
    level: index + 1,
    xp: safeXp,
    intoLevel,
    span,
    nextLevelAt: next,
    progress: next === null ? 1 : Math.min(1, intoLevel / span),
  };
}

export type AccessorySlot = 'hat' | 'scarf' | 'face' | 'backdrop';

export interface Accessory {
  id: string;
  name: string;
  slot: AccessorySlot;
  unlockLevel: number;
  description: string;
}

export const ACCESSORIES: readonly Accessory[] = [
  { id: 'scarf_leaf', name: 'Leaf scarf', slot: 'scarf', unlockLevel: 1, description: 'A soft leaf-green scarf. Kito’s everyday look.' },
  { id: 'hat_acorn', name: 'Acorn cap', slot: 'hat', unlockLevel: 2, description: 'A tiny acorn cap, found on a good walk.' },
  { id: 'face_glasses', name: 'Round glasses', slot: 'face', unlockLevel: 3, description: 'For careful label reading.' },
  { id: 'scarf_sun', name: 'Sunrise scarf', slot: 'scarf', unlockLevel: 4, description: 'Woven in warm apricot tones.' },
  { id: 'backdrop_garden', name: 'Garden backdrop', slot: 'backdrop', unlockLevel: 5, description: 'A quiet garden for your companion page.' },
  { id: 'hat_sprout', name: 'Sprout crown', slot: 'hat', unlockLevel: 6, description: 'Two fresh leaves, still growing.' },
  { id: 'backdrop_night', name: 'Starlit sky', slot: 'backdrop', unlockLevel: 8, description: 'A calm night sky for late check-ins.' },
  { id: 'scarf_crown', name: 'Golden laurel', slot: 'scarf', unlockLevel: 10, description: 'For a long, steady streak of showing up.' },
] as const;

export function unlockedAccessories(level: number): Accessory[] {
  return ACCESSORIES.filter((a) => a.unlockLevel <= level);
}

export function accessoryById(id: string): Accessory | undefined {
  return ACCESSORIES.find((a) => a.id === id);
}

export interface AchievementStats {
  mealsLogged: number;
  scannedMeals: number;
  currentStreak: number;
  longestStreak: number;
  hydrationGoalDays: number;
  fastsCompleted: number;
  weightEntries: number;
  plansCreated: number;
  manualFoodsCreated: number;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  target: number;
  metric: keyof AchievementStats;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first_meal', title: 'First bite', description: 'Log your first meal', icon: '🍽️', xp: 20, target: 1, metric: 'mealsLogged' },
  { id: 'meals_10', title: 'Getting the hang of it', description: 'Log 10 meals', icon: '🥗', xp: 40, target: 10, metric: 'mealsLogged' },
  { id: 'meals_50', title: 'Kitchen regular', description: 'Log 50 meals', icon: '🍲', xp: 100, target: 50, metric: 'mealsLogged' },
  { id: 'scan_5', title: 'Photo foodie', description: 'Save 5 photo-scanned meals', icon: '📷', xp: 80, target: 5, metric: 'scannedMeals' },
  { id: 'streak_3', title: 'Three in a row', description: 'Log something 3 days running', icon: '🌱', xp: 30, target: 3, metric: 'longestStreak' },
  { id: 'streak_7', title: 'A full week', description: 'Keep a 7-day logging streak', icon: '🗓️', xp: 70, target: 7, metric: 'longestStreak' },
  { id: 'streak_30', title: 'Steady month', description: 'Keep a 30-day logging streak', icon: '🏅', xp: 200, target: 30, metric: 'longestStreak' },
  { id: 'hydration_7', title: 'Well watered', description: 'Reach your hydration goal on 7 days', icon: '💧', xp: 60, target: 7, metric: 'hydrationGoalDays' },
  { id: 'fast_5', title: 'Calm and steady', description: 'Complete 5 fasting sessions', icon: '⏳', xp: 50, target: 5, metric: 'fastsCompleted' },
  { id: 'plans_1', title: 'Plan ahead', description: 'Create a weekly meal plan', icon: '📝', xp: 40, target: 1, metric: 'plansCreated' },
  { id: 'custom_5', title: 'Local flavour', description: 'Add 5 foods to your personal catalog', icon: '🌍', xp: 50, target: 5, metric: 'manualFoodsCreated' },
] as const;

export function achievementProgress(stats: AchievementStats, achievement: AchievementDefinition): number {
  const value = stats[achievement.metric] ?? 0;
  return Math.max(0, Math.min(1, value / achievement.target));
}

export function newlyEarnedAchievements(
  stats: AchievementStats,
  earnedIds: ReadonlySet<string>,
): AchievementDefinition[] {
  return ACHIEVEMENTS.filter((a) => !earnedIds.has(a.id) && (stats[a.metric] ?? 0) >= a.target);
}

/**
 * Current streak in days, counting back from today (or yesterday if today has
 * no activity yet — we don't want the streak to look broken before the user
 * has had a chance to log).
 */
export function computeStreak(activeDateKeys: readonly string[], today: string): number {
  const unique = [...new Set(activeDateKeys)].sort();
  const set = new Set(unique);
  const parse = (key: string) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  const offset = (key: string, days: number) => {
    const d = new Date(parse(key) + days * 86_400_000);
    return d.toISOString().slice(0, 10);
  };
  let start = today;
  if (!set.has(start)) {
    start = offset(today, -1);
    if (!set.has(start)) return 0;
  }
  let streak = 0;
  let cursor = start;
  while (set.has(cursor)) {
    streak += 1;
    cursor = offset(cursor, -1);
  }
  return streak;
}

export function longestStreak(activeDateKeys: readonly string[]): number {
  const sorted = [...new Set(activeDateKeys)].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of sorted) {
    if (previous === null) {
      run = 1;
    } else {
      const prev = Date.UTC(+previous.slice(0, 4), +previous.slice(5, 7) - 1, +previous.slice(8, 10));
      const cur = Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
      run = cur - prev === 86_400_000 ? run + 1 : 1;
    }
    best = Math.max(best, run);
    previous = key;
  }
  return best;
}
