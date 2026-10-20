/**
 * Nutrition calculation engine.
 *
 * All nutrient values are stored per 100 g in the catalog and scaled linearly.
 * Totals are accumulated unrounded, then rounded once at the display boundary:
 *  - calories: nearest whole kcal
 *  - macros/fiber: one decimal gram
 * This keeps multi-item totals from drifting due to intermediate rounding.
 */

export interface NutritionFacts {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface RoundedNutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
}

export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

export const EMPTY_NUTRITION: NutritionFacts = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite, non-negative number`);
  }
}

/** Scale per-100 g facts to an arbitrary gram weight. */
export function scaleNutrition(per100g: NutritionFacts, grams: number): NutritionFacts {
  assertFiniteNonNegative(grams, 'grams');
  assertFiniteNonNegative(per100g.kcal, 'kcal');
  assertFiniteNonNegative(per100g.protein, 'protein');
  assertFiniteNonNegative(per100g.carbs, 'carbs');
  assertFiniteNonNegative(per100g.fat, 'fat');
  const factor = grams / 100;
  return {
    kcal: per100g.kcal * factor,
    protein: per100g.protein * factor,
    carbs: per100g.carbs * factor,
    fat: per100g.fat * factor,
    fiber: per100g.fiber === undefined ? undefined : per100g.fiber * factor,
  };
}

/** Sum any number of nutrition values. Fiber is summed only when at least one source reports it. */
export function sumNutrition(items: readonly NutritionFacts[]): NutritionFacts {
  const total: NutritionFacts = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let fiber = 0;
  let hasFiber = false;
  for (const item of items) {
    total.kcal += item.kcal;
    total.protein += item.protein;
    total.carbs += item.carbs;
    total.fat += item.fat;
    if (item.fiber !== undefined && item.fiber !== null) {
      fiber += item.fiber;
      hasFiber = true;
    }
  }
  if (hasFiber) total.fiber = fiber;
  return total;
}

export function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function roundNutrition(value: NutritionFacts): RoundedNutrition {
  return {
    kcal: Math.round(value.kcal),
    protein: round1(value.protein),
    carbs: round1(value.carbs),
    fat: round1(value.fat),
    fiber: value.fiber === undefined || value.fiber === null ? null : round1(value.fiber),
  };
}

/** Calories implied by macro grams, using Atwater 4/4/9. */
export function caloriesFromMacros(protein: number, carbs: number, fat: number): number {
  return (
    protein * KCAL_PER_GRAM.protein + carbs * KCAL_PER_GRAM.carbs + fat * KCAL_PER_GRAM.fat
  );
}

/**
 * Quick sanity check for imported nutrition: how far macro-implied calories drift
 * from the stated calories. Returns the relative drift (0.1 = 10%).
 */
export function macroDrift(kcal: number, protein: number, carbs: number, fat: number): number {
  const implied = caloriesFromMacros(protein, carbs, fat);
  if (kcal <= 0) return implied > 0 ? 1 : 0;
  return Math.abs(implied - kcal) / kcal;
}

/** Percentages of daily targets, clamped to a safe display range for progress rings. */
export function percentOfTarget(consumed: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(100, (consumed / target) * 100));
}

export interface MealItemLike {
  id: string;
  name: string;
  grams: number;
  quantity: number;
  unit: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  source: string;
  confidence: number | null;
  portion_uncertainty: 'low' | 'medium' | 'high' | null;
  food_id: string | null;
}

/** Sum stored meal items. Values are already portion-scaled at write time. */
export function mealTotals(items: readonly Pick<MealItemLike, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'>[]): RoundedNutrition {
  const total = sumNutrition(
    items.map((item) => ({
      kcal: item.kcal,
      protein: item.protein_g,
      carbs: item.carbs_g,
      fat: item.fat_g,
      fiber: item.fiber_g === null ? undefined : item.fiber_g,
    })),
  );
  return roundNutrition(total);
}
