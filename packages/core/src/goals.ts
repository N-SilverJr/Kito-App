/**
 * Personalised energy and macro targets.
 *
 * Method: Mifflin–St Jeor BMR × activity factor (TDEE), then a modest goal
 * adjustment. This is an *estimate* intended for general wellness tracking,
 * never a prescription. Safeguards:
 *  - under-18 accounts never receive a calorie deficit target
 *  - deficits are capped at 20% of TDEE and 500 kcal
 *  - intake floors are applied by sex
 *  - protein is capped at 2.2 g/kg
 * Users can always use habit-only mode instead.
 */

export type Sex = 'female' | 'male' | 'unspecified';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain' | 'habits';

export interface GoalInput {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  now?: Date;
}

export interface GoalResult {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
  bmr: number;
  tdee: number;
  ageYears: number;
  method: 'mifflin-st-jeor';
  assumptions: string[];
  safety: { adjusted: boolean; reasons: string[] };
}

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Mostly sitting',
  light: 'Light activity (1–3 days/week)',
  moderate: 'Moderately active (3–5 days/week)',
  active: 'Very active (6–7 days/week)',
  very_active: 'Athlete / physical job',
};

export const GOAL_LABELS: Record<Goal, string> = {
  lose: 'Lose weight gently',
  maintain: 'Maintain weight',
  gain: 'Gain weight',
  habits: 'Build healthier habits',
};

const INTAKE_FLOOR: Record<Sex, number> = { female: 1200, male: 1500, unspecified: 1400 };

export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return Math.max(0, now.getUTCFullYear() - birthYear);
}

export function calculateGoals(input: GoalInput): GoalResult {
  const now = input.now ?? new Date();
  const ageYears = ageFromBirthYear(input.birthYear, now);
  const assumptions: string[] = [];
  const safety = { adjusted: false, reasons: [] as string[] };
  const sexTerm = input.sex === 'male' ? 5 : input.sex === 'female' ? -161 : -78;

  if (input.weightKg <= 0 || input.heightCm <= 0) throw new Error('Height and weight must be positive');
  if (input.weightKg > 400 || input.heightCm > 260) throw new Error('Height or weight is outside the supported range');

  const bmr = 10 * input.weightKg + 6.25 * input.heightCm - 5 * ageYears + sexTerm;
  const tdee = bmr * ACTIVITY_FACTORS[input.activityLevel];

  let goal = input.goal;
  if (ageYears < 18 && goal !== 'maintain' && goal !== 'habits') {
    const original = goal;
    goal = 'maintain';
    safety.adjusted = true;
    safety.reasons.push(
      `Calorie reduction or gain targets are not set for under-18 accounts (requested: ${original}). We use an estimated maintenance range instead.`,
    );
  }
  if (ageYears >= 18 && ageYears < 21 && goal === 'lose') {
    safety.reasons.push('For adults under 21 we keep the deficit modest. Consider checking with a clinician before intentional weight loss.');
  }
  if (input.sex === 'unspecified') {
    assumptions.push('Sex was not provided, so the BMR estimate uses a neutral average.');
  }

  let target = tdee;
  if (goal === 'lose') {
    const maxDeficit = Math.min(500, tdee * 0.2);
    target = tdee - maxDeficit;
    assumptions.push('Weight-loss target uses a moderate deficit (max 20% of estimated needs or 500 kcal).');
  } else if (goal === 'gain') {
    target = tdee + 250;
    assumptions.push('Weight-gain target adds a small 250 kcal surplus.');
  } else if (goal === 'habits') {
    target = tdee;
    assumptions.push('Habit mode focuses on consistency, not calorie restriction.');
  } else {
    assumptions.push('Maintenance target derived from estimated daily energy expenditure.');
  }

  const floor = INTAKE_FLOOR[input.sex];
  if (target < floor) {
    target = floor;
    safety.adjusted = true;
    safety.reasons.push(`Target raised to the ${floor} kcal safety floor.`);
  }
  const calories = Math.round(target / 10) * 10;

  const proteinPerKg = goal === 'lose' ? 1.8 : goal === 'gain' ? 1.7 : goal === 'habits' ? 1.2 : 1.6;
  const protein_g = Math.min(Math.round(input.weightKg * Math.min(proteinPerKg, 2.2)), Math.round((calories * 0.35) / 4));
  const fat_g = Math.max(30, Math.round((calories * 0.28) / 9));
  const carbs_g = Math.max(50, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));
  const fiber_g = Math.min(40, Math.max(20, Math.round((calories / 1000) * 14)));
  const water_ml = Math.min(4000, Math.max(1500, Math.round((input.weightKg * 30) / 50) * 50));

  assumptions.push('Water target is a starting estimate (~30 ml per kg); adjust it to thirst, climate and activity.');
  assumptions.push('These numbers are estimates for general wellness, not medical advice.');

  return {
    calories,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g,
    water_ml,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    ageYears,
    method: 'mifflin-st-jeor',
    assumptions,
    safety,
  };
}

/** "Calories remaining" — never negative; going over is shown separately. */
export function remainingCalories(consumed: number, target: number): number {
  return Math.max(0, Math.round(target - consumed));
}
