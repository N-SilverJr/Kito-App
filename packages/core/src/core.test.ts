import { describe, expect, it } from 'vitest';
import {
  ACCESSORIES,
  ACHIEVEMENTS,
  addDaysToDateKey,
  calculateGoals,
  caloriesFromMacros,
  companionReaction,
  computeStreak,
  dateKeyDiff,
  dateKeyRange,
  eventKeyFor,
  formatDuration,
  isValidDateKey,
  levelForXp,
  localDateKey,
  longestStreak,
  macroDrift,
  mealTotals,
  newlyEarnedAchievements,
  percentOfTarget,
  resolveGrams,
  rewardsFor,
  roundNutrition,
  sanitizeCompanionMessage,
  scaleNutrition,
  startOfLocalDayUtc,
  sumNutrition,
  unlockedAccessories,
  weightInputToKg,
  zonedDateTimeToUtc,
} from './index.js';
import { aiAnalysisSchema, mealInputSchema, onboardingSchema, per100gSchema } from './schemas.js';

describe('nutrition math', () => {
  const rice = { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 };

  it('scales per-100g values to a portion', () => {
    const portion = scaleNutrition(rice, 150);
    expect(portion.kcal).toBeCloseTo(195, 5);
    expect(portion.protein).toBeCloseTo(4.05, 5);
  });

  it('sums multiple components and rounds once', () => {
    const total = roundNutrition(sumNutrition([scaleNutrition(rice, 150), scaleNutrition({ kcal: 143, protein: 12.5, carbs: 1.1, fat: 9.5 }, 50)]));
    expect(total.kcal).toBe(267);
    expect(total.protein).toBe(10.3); // 4.05 + 6.25 = 10.3
  });

  it('preserves fiber only when a source provides it', () => {
    expect(sumNutrition([{ kcal: 10, protein: 0, carbs: 0, fat: 0 }]).fiber).toBeUndefined();
    expect(sumNutrition([{ kcal: 10, protein: 0, carbs: 0, fat: 0, fiber: 2 }]).fiber).toBe(2);
  });

  it('rejects negative or non-finite portions', () => {
    expect(() => scaleNutrition(rice, -1)).toThrow();
    expect(() => scaleNutrition(rice, Number.POSITIVE_INFINITY)).toThrow();
  });

  it('computes Atwater calories and macro drift', () => {
    expect(caloriesFromMacros(10, 20, 5)).toBe(40 + 80 + 45);
    expect(macroDrift(100, 10, 10, 4)).toBeCloseTo(0.16, 5);
    expect(macroDrift(0, 0, 0, 0)).toBe(0);
  });

  it('clamps progress percentages', () => {
    expect(percentOfTarget(500, 2000)).toBe(25);
    expect(percentOfTarget(3000, 2000)).toBe(100);
    expect(percentOfTarget(500, 0)).toBe(0);
  });

  it('totals stored meal items', () => {
    const totals = mealTotals([
      { kcal: 195, protein_g: 4.05, carbs_g: 42, fat_g: 0.45, fiber_g: 0.6 },
      { kcal: 71.5, protein_g: 6.25, carbs_g: 0.55, fat_g: 4.75, fiber_g: null },
    ]);
    expect(totals).toEqual({ kcal: 267, protein: 10.3, carbs: 42.6, fat: 5.2, fiber: 0.6 });
  });
});

describe('unit conversion', () => {
  it('resolves gram and kg units exactly', () => {
    expect(resolveGrams(150, 'g', [])).toEqual({ grams: 150, approximate: false });
    expect(resolveGrams(0.5, 'kg', [])).toEqual({ grams: 500, approximate: false });
  });

  it('resolves household servings and marks them approximate', () => {
    const result = resolveGrams(2, 'piece', [{ unit: 'piece', grams: 50, approximate: true }]);
    expect(result).toEqual({ grams: 100, approximate: true, note: 'Household portion — gram weight is approximate' });
  });

  it('returns null grams instead of inventing a conversion', () => {
    const result = resolveGrams(1, 'bowl', []);
    expect(result.grams).toBeNull();
    if (result.grams === null) expect(result.reason).toContain('bowl');
  });

  it('converts imperial input to canonical kg', () => {
    expect(weightInputToKg(154.3, 'imperial')).toBeCloseTo(69.99, 1);
    expect(() => weightInputToKg(5, 'metric')).toThrow(/supported range/);
  });
});

describe('timezone-aware dates', () => {
  it('uses the user timezone for the calendar day', () => {
    const lateNightNewYork = new Date('2026-03-08T04:30:00Z');
    expect(localDateKey(lateNightNewYork, 'America/New_York')).toBe('2026-03-07');
    expect(localDateKey(lateNightNewYork, 'UTC')).toBe('2026-03-08');
  });

  it('handles DST transitions for local midnight', () => {
    expect(startOfLocalDayUtc('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(startOfLocalDayUtc('2026-11-01', 'America/New_York').toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('supports half-hour offsets', () => {
    expect(zonedDateTimeToUtc('2026-10-19', '12:00', 'Asia/Kathmandu').toISOString()).toBe('2026-10-19T06:15:00.000Z');
    expect(startOfLocalDayUtc('2026-10-19', 'Asia/Kathmandu').toISOString()).toBe('2026-10-18T18:15:00.000Z');
  });

  it('adds days and validates date keys', () => {
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(dateKeyDiff('2026-10-01', '2026-10-19')).toBe(18);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(dateKeyRange('2026-10-17', '2026-10-19')).toEqual(['2026-10-17', '2026-10-18', '2026-10-19']);
  });

  it('formats fasting durations from elapsed milliseconds', () => {
    expect(formatDuration(16 * 3600_000 + 4 * 60_000, 'clock')).toBe('16:04:00');
    expect(formatDuration(90 * 60_000)).toBe('1h 30m');
  });
});

describe('personalised goals', () => {
  it('computes Mifflin–St Jeor targets deterministically', () => {
    const result = calculateGoals({
      sex: 'male',
      birthYear: 1996,
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderate',
      goal: 'maintain',
      now: new Date('2026-06-01T00:00:00Z'),
    });
    expect(result.bmr).toBe(1780);
    expect(result.tdee).toBe(2759);
    expect(result.calories).toBe(2760);
    expect(result.protein_g).toBe(128);
    expect(result.fat_g).toBe(86);
    expect(result.carbs_g).toBe(369);
    expect(result.water_ml).toBe(2400);
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it('caps weight-loss deficits and enforces the intake floor', () => {
    const result = calculateGoals({
      sex: 'female',
      birthYear: 1996,
      heightCm: 150,
      weightKg: 45,
      activityLevel: 'sedentary',
      goal: 'lose',
      now: new Date('2026-06-01T00:00:00Z'),
    });
    expect(result.calories).toBeGreaterThanOrEqual(1200);
    expect(result.calories).toBeLessThan(result.tdee);
    expect(result.tdee - result.calories).toBeLessThanOrEqual(500);
  });

  it('never applies a deficit for minors', () => {
    const result = calculateGoals({
      sex: 'female',
      birthYear: 2012,
      heightCm: 160,
      weightKg: 55,
      activityLevel: 'light',
      goal: 'lose',
      now: new Date('2026-06-01T00:00:00Z'),
    });
    expect(result.safety.adjusted).toBe(true);
    expect(result.calories).toBeGreaterThanOrEqual(result.tdee - 10);
    expect(result.safety.reasons[0]).toMatch(/under-18/);
  });
});

describe('rewards and streaks', () => {
  it('produces stable event keys for idempotency', () => {
    const key = eventKeyFor({ type: 'meal_logged', mealId: 'm1', mealType: 'lunch', scanned: true });
    expect(key).toBe('meal:m1');
    expect(rewardsFor({ type: 'meal_logged', mealId: 'm1', mealType: 'lunch', scanned: true })[0]?.quantity).toBe(13);
    expect(rewardsFor({ type: 'water_goal', dayKey: '2026-10-19' })[0]?.eventKey).toBe('water_goal:2026-10-19');
  });

  it('never rewards eating less or losing weight', () => {
    const grants = [
      ...rewardsFor({ type: 'meal_logged', mealId: 'a', mealType: 'dinner', scanned: false }),
      ...rewardsFor({ type: 'weight_logged', dayKey: '2026-10-19' }),
    ];
    expect(grants.map((g) => g.label).join(' ')).not.toMatch(/calorie|loss|target|deficit/i);
  });

  it('maps XP onto levels with progress', () => {
    expect(levelForXp(0)).toMatchObject({ level: 1, intoLevel: 0, nextLevelAt: 120 });
    expect(levelForXp(120)).toMatchObject({ level: 2, progress: 0 });
    expect(levelForXp(220).progress).toBeCloseTo(0.5, 5);
    expect(levelForXp(999999).nextLevelAt).toBeNull();
  });

  it('unlocks accessories by level', () => {
    expect(unlockedAccessories(1).map((a) => a.id)).toEqual(['scarf_leaf']);
    expect(unlockedAccessories(4)).toHaveLength(4);
    expect(ACCESSORIES.every((a) => a.unlockLevel >= 1)).toBe(true);
  });

  it('computes streaks that tolerate an unlogged today', () => {
    expect(computeStreak(['2026-10-17', '2026-10-18', '2026-10-19'], '2026-10-19')).toBe(3);
    expect(computeStreak(['2026-10-17', '2026-10-18'], '2026-10-19')).toBe(2);
    expect(computeStreak(['2026-10-16'], '2026-10-19')).toBe(0);
    expect(longestStreak(['2026-10-01', '2026-10-02', '2026-10-04'])).toBe(2);
  });

  it('awards achievements only once thresholds are met', () => {
    const stats = {
      mealsLogged: 10,
      scannedMeals: 0,
      currentStreak: 3,
      longestStreak: 3,
      hydrationGoalDays: 0,
      fastsCompleted: 0,
      weightEntries: 0,
      plansCreated: 0,
      manualFoodsCreated: 0,
    };
    const earned = newlyEarnedAchievements(stats, new Set(['first_meal']));
    expect(earned.map((a) => a.id).sort()).toEqual(['meals_10', 'streak_3']);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
  });
});

describe('companion safety', () => {
  it('returns deterministic supportive lines per seed', () => {
    const a = companionReaction('meal_logged', '2026-10-19');
    const b = companionReaction('meal_logged', '2026-10-19');
    expect(a).toEqual(b);
    expect(a.message.length).toBeGreaterThan(5);
  });

  it('filters unsafe model output', () => {
    expect(sanitizeCompanionMessage('You are obese, stop eating.')).toMatch(/Small steps/);
    expect(sanitizeCompanionMessage('Nice work today!')).toBe('Nice work today!');
  });
});

describe('validation schemas', () => {
  it('accepts a valid meal and rejects empty or negative items', () => {
    const parsed = mealInputSchema.safeParse({
      meal_type: 'lunch',
      eaten_at: '2026-10-19T12:00:00.000Z',
      items: [
        {
          name: 'Rice',
          quantity: 150,
          unit: 'g',
          grams: 150,
          nutrition: { kcal: 195, protein_g: 4, carbs_g: 42, fat_g: 0.5 },
        },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(mealInputSchema.safeParse({ meal_type: 'lunch', eaten_at: 'nope', items: [] }).success).toBe(false);
  });

  it('rejects implausible per-100g values', () => {
    expect(per100gSchema.safeParse({ kcal: 9000, protein: 0, carbs: 0, fat: 0 }).success).toBe(false);
    expect(per100gSchema.safeParse({ kcal: 120, protein: 2, carbs: 20, fat: 2 }).success).toBe(true);
  });

  it('requires a plausible onboarding payload', () => {
    const base = {
      display_name: 'Aline',
      birth_year: 1994,
      height_cm: 165,
      weight_kg: 60,
      activity_level: 'light',
      goal: 'maintain',
      unit_system: 'metric',
      timezone: 'Africa/Kigali',
    };
    expect(onboardingSchema.safeParse(base).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...base, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, birth_year: 2020 }).success).toBe(false);
  });

  it('coerces numeric strings from model output and rejects malformed items', () => {
    const result = aiAnalysisSchema.safeParse({
      dish_name: 'Beans and rice',
      observation: 'Two components visible.',
      items: [
        {
          name: 'Beans',
          quantity: '1',
          unit: 'bowl',
          kcal: '180',
          protein_g: '10',
          carbs_g: '25',
          fat_g: '3',
          confidence: '0.6',
          portion_uncertainty: 'high',
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(aiAnalysisSchema.safeParse({ dish_name: 'x', observation: '', items: [] }).success).toBe(false);
  });
});
