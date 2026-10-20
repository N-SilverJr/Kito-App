import type { ActivityLevel, Goal, Sex } from './goals.js';
import type { NutritionFacts, RoundedNutrition } from './nutrition.js';
import type { ServingSize, UnitSystem } from './units.js';
import type { AchievementDefinition, Accessory } from './rewards.js';
import type { CompanionMood } from './companion.js';
import type { ReminderPreferences, AiAnalysisItem } from './schemas.js';
import type { ActivityTypeId, MealType } from './constants.js';

export type ThemePreference = 'light' | 'dark' | 'system';
export type FoodSource = 'catalog' | 'open_food_facts' | 'usda_fdc' | 'ai_estimate' | 'user_entered';
export type PortionUncertainty = 'low' | 'medium' | 'high';
export type MealSource = 'manual' | 'ai' | 'plan';

export interface User {
  id: string;
  email: string;
  email_verified: boolean;
  created_at: string;
}

export interface Profile {
  display_name: string;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  sex: Sex;
  activity_level: ActivityLevel;
  goal: Goal;
  timezone: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Preferences {
  theme: ThemePreference;
  unit_system: UnitSystem;
  calorie_tracking_enabled: boolean;
  show_weight: boolean;
  fasting_enabled: boolean;
  water_target_ml: number;
  weight_target_kg: number | null;
  dietary_preferences: string[];
  allergies: string[];
  companion_name: string;
  locale: string;
  weekly_plan_budget: 'low' | 'medium' | 'high';
  reminders: ReminderPreferences;
}

export interface Goals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
  method: string;
  assumptions: string[];
  updated_at: string;
}

export interface SessionResponse {
  user: User;
  profile: Profile;
  preferences: Preferences;
  goals: Goals | null;
  companion: CompanionState;
}

export interface Food {
  id: string;
  name: string;
  alt_names: string[];
  locale: string | null;
  brand: string | null;
  category: string | null;
  per_100g: NutritionFacts;
  serving_sizes: ServingSize[];
  tags?: string[];
  allergens?: string[];
  source: FoodSource;
  source_id: string | null;
  attribution: string | null;
  verified: boolean;
  is_custom: boolean;
  created_by?: string | null;
}

export interface MealItem {
  id: string;
  food_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  source: FoodSource;
  confidence: number | null;
  portion_uncertainty: PortionUncertainty | null;
  ingredients: string[];
  sort_order: number;
}

export interface Meal {
  id: string;
  date: string;
  meal_type: MealType;
  title: string | null;
  notes: string | null;
  eaten_at: string;
  source: MealSource;
  items: MealItem[];
  totals: RoundedNutrition;
  created_at: string;
  updated_at: string;
}

export interface HydrationEntry {
  id: string;
  date: string;
  amount_ml: number;
  logged_at: string;
}

export interface WeightEntry {
  id: string;
  date: string;
  weight_kg: number;
  note: string | null;
  logged_at: string;
}

export type FastingStatus = 'active' | 'completed' | 'cancelled';

export interface FastingSession {
  id: string;
  plan: string;
  target_minutes: number;
  started_at: string;
  ended_at: string | null;
  status: FastingStatus;
  elapsed_minutes: number | null;
  progress: number | null;
}

export interface ActivityEntry {
  id: string;
  date: string;
  type: ActivityTypeId | string;
  minutes: number;
  steps: number | null;
  kcal_burned: number | null;
  note: string | null;
  logged_at: string;
}

export interface DailySummary {
  date: string;
  goals: Goals | null;
  consumed: RoundedNutrition;
  remaining_kcal: number;
  meals: Meal[];
  meal_totals_by_type: Record<string, RoundedNutrition>;
  hydration: { total_ml: number; target_ml: number; entries: HydrationEntry[] };
  weight: { latest: WeightEntry | null; target_kg: number | null };
  activity: { entries: ActivityEntry[]; kcal_burned: number };
  fasting: { active: FastingSession | null; completed_today: FastingSession[]; enabled: boolean };
  companion: CompanionState;
  streak: number;
  logging_days: number;
}

export interface RewardHistoryItem {
  id: string;
  event_key: string;
  label: string;
  xp: number;
  created_at: string;
}

export interface CompanionState {
  name: string;
  xp: number;
  level: number;
  xp_into_level: number;
  xp_for_next_level: number | null;
  level_progress: number;
  unlocked: Accessory[];
  equipped: { hat?: string; scarf?: string; face?: string; backdrop?: string };
  mood: CompanionMood;
  message: string;
  achievements: AchievementDefinition[];
  earned_achievements: string[];
  streak: number;
  longest_streak: number;
  recent_rewards: RewardHistoryItem[];
}

export interface AchievementStatus {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  target: number;
  progress: number;
  earned: boolean;
  earned_at: string | null;
}

export interface DailyStat {
  date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
  meals: number;
  weight_kg: number | null;
}

export interface StatsResponse {
  range: '7d' | '30d' | '90d';
  start: string;
  end: string;
  days: DailyStat[];
  averages: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    water_ml: number;
    meals_per_day: number;
  };
  logging_days: number;
  hydration_days_met: number;
  fiber_days_met: number;
  goal_calories: number | null;
  weight_series: WeightEntry[];
  weight_change_kg: number | null;
  current_streak: number;
  longest_streak: number;
  observations: string[];
  achievements: AchievementStatus[];
}

export interface AiStatus {
  configured: boolean;
  provider: 'openai' | 'gemini' | 'anthropic' | 'none';
  model: string | null;
  message: string;
}

export interface AnalyzedItem extends AiAnalysisItem {
  data_source: FoodSource;
  matched_food_id: string | null;
  matched_food_name: string | null;
  grams: number | null;
}

export interface AnalyzeResponse {
  analysis_id: string;
  dish_name: string;
  items: AnalyzedItem[];
  observation: string;
  clarifying_question: string | null;
  provider: string;
  model: string;
  warnings: string[];
  latency_ms: number;
}

export interface TextParseResponse {
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    grams: number | null;
    food: Food | null;
    nutrition: RoundedNutrition | null;
    confidence: number;
    note: string | null;
  }>;
  unmatched: string[];
}

export interface MealPlanItem {
  id: string;
  day_index: number;
  meal_type: MealType;
  title: string;
  ingredients: string[];
  instructions: string;
  totals: RoundedNutrition;
  components: Array<{ name: string; grams: number; food_id: string | null }>;
}

export interface MealPlan {
  id: string;
  week_start: string;
  title: string;
  preferences: {
    days: number;
    meal_types: MealType[];
    dietary_preferences: string[];
    allergies: string[];
    budget: 'low' | 'medium' | 'high';
    max_cook_minutes: number;
    servings: number;
  };
  items: MealPlanItem[];
  shopping_list: Array<{ name: string; grams: number; category: string }>;
  created_at: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface SearchFoodsResponse {
  foods: Food[];
  external_error?: string | null;
}
