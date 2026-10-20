import { z } from 'zod';
import { isValidTimeZone } from './dates.js';

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'Password is too long');
export const displayNameSchema = z.string().trim().min(1, 'Add a name').max(60);
export const isoDateTimeSchema = z.string().datetime({ offset: true, message: 'Expected an ISO date-time' });
export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');
export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((tz) => isValidTimeZone(tz), 'Unknown timezone');

export const sexSchema = z.enum(['female', 'male', 'unspecified']);
export const activityLevelSchema = z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']);
export const goalSchema = z.enum(['lose', 'maintain', 'gain', 'habits']);
export const unitSystemSchema = z.enum(['metric', 'imperial']);
export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const themeSchema = z.enum(['light', 'dark', 'system']);
export const foodSourceSchema = z.enum(['catalog', 'open_food_facts', 'usda_fdc', 'ai_estimate', 'user_entered']);
export const portionUncertaintySchema = z.enum(['low', 'medium', 'high']);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  display_name: displayNameSchema.optional(),
  timezone: timezoneSchema.optional(),
});
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(200),
  new_password: passwordSchema,
});
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(200),
  confirmation: z.literal('DELETE'),
});

export const nutritionInputSchema = z.object({
  kcal: z.number().min(0).max(9000),
  protein_g: z.number().min(0).max(1000),
  carbs_g: z.number().min(0).max(1500),
  fat_g: z.number().min(0).max(1000),
  fiber_g: z.number().min(0).max(300).nullable().optional(),
});

export const servingSizeSchema = z.object({
  unit: z.string().trim().min(1).max(24),
  grams: z.number().positive().max(5000),
  approximate: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

export const per100gSchema = z.object({
  kcal: z.number().min(0).max(900),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  fiber: z.number().min(0).max(100).optional(),
});

export const mealItemInputSchema = z.object({
  food_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(10000),
  unit: z.string().trim().min(1).max(24),
  grams: z.number().positive().max(10000),
  /** Ignored by the server when food_id resolves to a catalog row. */
  nutrition: nutritionInputSchema,
  source: foodSourceSchema.default('user_entered'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  portion_uncertainty: portionUncertaintySchema.nullable().optional(),
  ingredients: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

export const mealInputSchema = z.object({
  meal_type: mealTypeSchema,
  title: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  eaten_at: isoDateTimeSchema,
  items: z.array(mealItemInputSchema).min(1, 'Add at least one food').max(30),
  source: z.enum(['manual', 'ai', 'plan']).default('manual'),
  ai_analysis_id: z.string().uuid().nullable().optional(),
});

export const customFoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  alt_names: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  brand: z.string().trim().max(80).nullable().optional(),
  category: z.string().trim().max(40).nullable().optional(),
  per_100g: per100gSchema,
  serving_sizes: z.array(servingSizeSchema).max(10).default([]),
});

export const hydrationInputSchema = z.object({
  amount_ml: z.number().int().min(10).max(5000),
  logged_at: isoDateTimeSchema,
});
export const weightInputSchema = z.object({
  weight_kg: z.number().min(20).max(400),
  logged_at: isoDateTimeSchema,
  note: z.string().trim().max(280).nullable().optional(),
});
export const activityInputSchema = z.object({
  type: z.string().trim().min(1).max(40),
  minutes: z.number().int().min(1).max(1440),
  steps: z.number().int().min(0).max(200000).nullable().optional(),
  kcal_burned: z.number().int().min(0).max(5000).nullable().optional(),
  logged_at: isoDateTimeSchema,
  note: z.string().trim().max(280).nullable().optional(),
});
export const fastingStartSchema = z.object({
  plan: z.string().trim().min(1).max(20).default('16:8'),
  target_minutes: z.number().int().min(60).max(1440).default(960),
  started_at: isoDateTimeSchema.optional(),
});

export const profileUpdateSchema = z.object({
  display_name: displayNameSchema.optional(),
  birth_year: z.number().int().min(1900).max(new Date().getUTCFullYear() - 13).nullable().optional(),
  height_cm: z.number().min(100).max(250).nullable().optional(),
  weight_kg: z.number().min(25).max(350).nullable().optional(),
  sex: sexSchema.optional(),
  activity_level: activityLevelSchema.optional(),
  goal: goalSchema.optional(),
  timezone: timezoneSchema.optional(),
});

const reminderSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  days: z.array(z.number().int().min(0).max(6)).max(7),
});
export const reminderPreferencesSchema = z.object({
  meals: reminderSchema,
  water: z.object({ enabled: z.boolean(), start: z.string(), end: z.string(), every_minutes: z.number().int().min(30).max(480) }),
  weight: reminderSchema,
  fasting: z.object({ enabled: z.boolean() }),
  quiet_hours: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
});

export const preferencesUpdateSchema = z.object({
  theme: themeSchema.optional(),
  unit_system: unitSystemSchema.optional(),
  calorie_tracking_enabled: z.boolean().optional(),
  show_weight: z.boolean().optional(),
  fasting_enabled: z.boolean().optional(),
  water_target_ml: z.number().int().min(500).max(6000).optional(),
  weight_target_kg: z.number().min(20).max(400).nullable().optional(),
  dietary_preferences: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  allergies: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  companion_name: z.string().trim().min(1).max(24).optional(),
  weekly_plan_budget: z.enum(['low', 'medium', 'high']).optional(),
  reminders: reminderPreferencesSchema.optional(),
});

export const onboardingSchema = z.object({
  display_name: displayNameSchema,
  birth_year: z.number().int().min(1900).max(new Date().getUTCFullYear() - 13),
  height_cm: z.number().min(100).max(250),
  weight_kg: z.number().min(25).max(350),
  sex: sexSchema.default('unspecified'),
  activity_level: activityLevelSchema,
  goal: goalSchema,
  unit_system: unitSystemSchema,
  timezone: timezoneSchema,
  calorie_tracking_enabled: z.boolean().default(true),
  show_weight: z.boolean().default(true),
  fasting_enabled: z.boolean().default(false),
  weight_target_kg: z.number().min(20).max(400).nullable().optional(),
  water_target_ml: z.number().int().min(500).max(6000).optional(),
  dietary_preferences: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  allergies: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  companion_name: z.string().trim().min(1).max(24).default('Kito'),
  time_format: z.enum(['12h', '24h']).default('24h'),
});

export const aiAnalysisItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  local_name: z.string().trim().max(120).nullable().optional(),
  quantity: z.coerce.number().positive().max(10000),
  unit: z.string().trim().min(1).max(24),
  grams: z.coerce.number().positive().max(10000).nullable().optional(),
  kcal: z.coerce.number().min(0).max(5000),
  protein_g: z.coerce.number().min(0).max(500),
  carbs_g: z.coerce.number().min(0).max(1000),
  fat_g: z.coerce.number().min(0).max(500),
  fiber_g: z.coerce.number().min(0).max(200).nullable().optional(),
  confidence: z.coerce.number().min(0).max(1),
  portion_uncertainty: portionUncertaintySchema,
  ingredients: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

export const aiAnalysisSchema = z.object({
  dish_name: z.string().trim().min(1).max(120),
  items: z.array(aiAnalysisItemSchema).min(1).max(12),
  observation: z.string().trim().max(300),
  clarifying_question: z.string().trim().max(200).nullable().optional(),
});

export const aiAnalyzeRequestSchema = z.object({
  image: z
    .string()
    .min(100)
    .max(8_000_000)
    .regex(/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'Upload a JPEG, PNG or WebP image'),
  meal_type: mealTypeSchema.optional(),
  locale: z.string().max(20).optional(),
});

export const foodSearchQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(40).default(20),
  include_external: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(true)
    .transform((value) => value === true || value === 'true'),
});

export const textParseSchema = z.object({ text: z.string().trim().min(2).max(400) });

export const planPreferencesSchema = z.object({
  days: z.number().int().min(1).max(7).default(7),
  meal_types: z.array(mealTypeSchema).min(1).max(4).default(['breakfast', 'lunch', 'dinner']),
  dietary_preferences: z.array(z.string().max(40)).max(20).default([]),
  allergies: z.array(z.string().max(40)).max(20).default([]),
  available_ingredients: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  budget: z.enum(['low', 'medium', 'high']).default('medium'),
  max_cook_minutes: z.number().int().min(5).max(240).default(45),
  servings: z.number().int().min(1).max(12).default(2),
  local_foods: z.boolean().default(true),
  notes: z.string().trim().max(300).default(''),
});

export const equipSchema = z.object({ accessory_id: z.string().min(1).max(60) });
export const companionNameSchema = z.object({ name: z.string().trim().min(1).max(24) });
export const mealPlanPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
        ingredients: z.array(z.string().trim().max(160)).max(30),
        instructions: z.string().trim().max(2000),
      }),
    )
    .optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type MealInput = z.infer<typeof mealInputSchema>;
export type MealItemInput = z.infer<typeof mealItemInputSchema>;
export type CustomFoodInput = z.infer<typeof customFoodSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PreferencesUpdateInput = z.infer<typeof preferencesUpdateSchema>;
export type HydrationInput = z.infer<typeof hydrationInputSchema>;
export type WeightInput = z.infer<typeof weightInputSchema>;
export type ActivityInput = z.infer<typeof activityInputSchema>;
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;
export type AiAnalysisItem = z.infer<typeof aiAnalysisItemSchema>;
export type PlanPreferences = z.infer<typeof planPreferencesSchema>;
export type ReminderPreferences = z.infer<typeof reminderPreferencesSchema>;
export type NutritionInput = z.infer<typeof nutritionInputSchema>;
export type Per100gInput = z.infer<typeof per100gSchema>;
export type AiAnalyzeRequest = z.infer<typeof aiAnalyzeRequestSchema>;
