export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const MEAL_TYPE_ICONS: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

export interface FastingPlan {
  id: string;
  label: string;
  fastingMinutes: number;
  eatingMinutes: number;
  description: string;
}

export const FASTING_PLANS: readonly FastingPlan[] = [
  { id: '12:12', label: '12:12', fastingMinutes: 720, eatingMinutes: 720, description: 'A gentle starting rhythm, often close to a normal overnight break.' },
  { id: '14:10', label: '14:10', fastingMinutes: 840, eatingMinutes: 600, description: 'A moderate window with a later breakfast or earlier dinner.' },
  { id: '16:8', label: '16:8', fastingMinutes: 960, eatingMinutes: 480, description: 'A common time-restricted window. Not suitable for everyone.' },
  { id: 'custom', label: 'Custom', fastingMinutes: 900, eatingMinutes: 540, description: 'Choose your own fasting and eating windows.' },
];

export const ACTIVITY_TYPES = [
  { id: 'walking', label: 'Walking', met: 3.5 },
  { id: 'running', label: 'Running', met: 8.3 },
  { id: 'cycling', label: 'Cycling', met: 6.8 },
  { id: 'strength', label: 'Strength training', met: 5.0 },
  { id: 'yoga', label: 'Yoga / mobility', met: 2.8 },
  { id: 'football', label: 'Football', met: 7.0 },
  { id: 'dancing', label: 'Dancing', met: 5.5 },
  { id: 'housework', label: 'Housework / farming', met: 4.0 },
  { id: 'other', label: 'Other', met: 4.0 },
] as const;

export type ActivityTypeId = (typeof ACTIVITY_TYPES)[number]['id'];

export const WATER_QUICK_ADDS_ML = [200, 250, 330, 500, 750] as const;

export const DEFAULT_PREFERENCES = {
  theme: 'system' as 'light' | 'dark' | 'system',
  unitSystem: 'metric' as 'metric' | 'imperial',
  calorieTrackingEnabled: true,
  showWeight: true,
  fastingEnabled: false,
  waterTargetMl: 2000,
  weeklyPlanBudget: 'medium' as 'low' | 'medium' | 'high',
  locale: 'en',
};

export const APP_NAME = 'NutriPals';

export const DISCLAIMER =
  'NutriPals offers general wellness estimates and is not medical advice, diagnosis or treatment. For medical conditions, pregnancy, or eating-disorder history, talk to a qualified health professional.';

/** MET-based burn estimate; clearly labelled as an estimate in the UI. */
export function estimateActivityKcal(met: number, weightKg: number, minutes: number): number {
  if (!Number.isFinite(met) || !Number.isFinite(weightKg) || !Number.isFinite(minutes)) return 0;
  if (met <= 0 || weightKg <= 0 || minutes <= 0) return 0;
  // kcal/min ≈ MET × 3.5 × kg / 200
  return Math.round(((met * 3.5 * weightKg) / 200) * minutes);
}
