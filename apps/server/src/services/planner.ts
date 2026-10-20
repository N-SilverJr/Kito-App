import type { Database } from '../db.js';
import { json } from '../db.js';
import { ApiError, newId } from '../http.js';
import {
  roundNutrition,
  scaleNutrition,
  sumNutrition,
  type Food,
  type MealPlan,
  type MealPlanItem,
  type PlanPreferences,
  type RoundedNutrition,
} from '@nutripals/core';
import { rowToFood } from '../repo/meals.js';

interface FoodRow {
  id: string;
  slug: string;
  name: string;
  alt_names: string;
  locale: string | null;
  brand: string | null;
  category: string | null;
  tags: string;
  allergens: string;
  per_100g: string;
  serving_sizes: string;
  source: Food['source'];
  source_id: string | null;
  attribution: string | null;
  verified: number;
  is_public: number;
  created_by: string | null;
}

interface Template {
  id: string;
  title: string;
  meal_type: MealPlanItem['meal_type'];
  budget: 'low' | 'medium' | 'high';
  cook_minutes: number;
  tags: string[];
  allergens: string[];
  instructions: string;
  components: Array<{ slug: string; grams: number }>;
}

/**
 * Curated, affordable templates built from the local catalog. These are not AI
 * output: they are deterministic, reviewable and safe to filter by allergy.
 */
const TEMPLATES: Template[] = [
  {
    id: 'b-porridge',
    title: 'Millet porridge with banana',
    meal_type: 'breakfast',
    budget: 'low',
    cook_minutes: 15,
    tags: ['vegetarian', 'local'],
    allergens: ['milk'],
    instructions: 'Simmer millet flour in water for 10 minutes, stirring. Add milk and sliced banana just before serving.',
    components: [{ slug: 'millet-porridge', grams: 250 }, { slug: 'banana', grams: 118 }],
  },
  {
    id: 'b-eggs-bread',
    title: 'Boiled eggs with avocado and bread',
    meal_type: 'breakfast',
    budget: 'medium',
    cook_minutes: 12,
    tags: ['vegetarian', 'high_protein'],
    allergens: ['eggs', 'gluten'],
    instructions: 'Boil eggs for 8 minutes. Serve with sliced avocado and toasted bread. Add tomato if you have it.',
    components: [{ slug: 'egg-boiled', grams: 100 }, { slug: 'avocado', grams: 100 }, { slug: 'bread-white', grams: 56 }],
  },
  {
    id: 'b-sweet-potato',
    title: 'Sweet potato and tea',
    meal_type: 'breakfast',
    budget: 'low',
    cook_minutes: 25,
    tags: ['vegetarian', 'local'],
    allergens: ['milk'],
    instructions: 'Boil sweet potatoes until tender. Serve with unsweetened tea or water.',
    components: [{ slug: 'sweet-potato', grams: 260 }, { slug: 'tea-milk', grams: 240 }],
  },
  {
    id: 'b-yogurt-fruit',
    title: 'Yogurt with papaya and groundnuts',
    meal_type: 'breakfast',
    budget: 'medium',
    cook_minutes: 5,
    tags: ['vegetarian', 'local', 'high_protein'],
    allergens: ['milk', 'peanuts'],
    instructions: 'Spoon yogurt into a bowl, top with diced papaya and a small handful of groundnuts.',
    components: [
      { slug: 'yogurt-plain', grams: 200 },
      { slug: 'papaya', grams: 145 },
      { slug: 'groundnuts', grams: 15 },
    ],
  },
  {
    id: 'b-ikivuguto',
    title: 'Ikivuguto with chapati',
    meal_type: 'breakfast',
    budget: 'low',
    cook_minutes: 5,
    tags: ['vegetarian', 'local'],
    allergens: ['milk', 'gluten'],
    instructions: 'Warm or serve the fermented milk as is, alongside a fresh chapati. Add fruit if available.',
    components: [{ slug: 'ikivuguto', grams: 240 }, { slug: 'chapati', grams: 80 }],
  },
  {
    id: 'l-rice-beans-isombe',
    title: 'Rice, beans and isombe',
    meal_type: 'lunch',
    budget: 'low',
    cook_minutes: 40,
    tags: ['vegetarian', 'vegan', 'local', 'high_protein'],
    allergens: [],
    instructions: 'Cook rice and beans. Simmer cassava leaves with onion and a little oil until soft. Serve together.',
    components: [
      { slug: 'rice-cooked', grams: 180 },
      { slug: 'ibishyimbo', grams: 200 },
      { slug: 'isombe', grams: 150 },
      { slug: 'cooking-oil', grams: 5 },
    ],
  },
  {
    id: 'l-ubugari-fish',
    title: 'Ubugari with tilapia and greens',
    meal_type: 'lunch',
    budget: 'medium',
    cook_minutes: 35,
    tags: ['pescatarian', 'local', 'high_protein'],
    allergens: ['fish'],
    instructions: 'Prepare ubugari and steam the fish with tomato and onion. Serve with cooked greens.',
    components: [
      { slug: 'ubugari', grams: 240 },
      { slug: 'tilapia', grams: 150 },
      { slug: 'spinach-cooked', grams: 130 },
      { slug: 'tomato', grams: 80 },
    ],
  },
  {
    id: 'l-matoke-beans',
    title: 'Matoke with bean stew',
    meal_type: 'lunch',
    budget: 'low',
    cook_minutes: 45,
    tags: ['vegetarian', 'vegan', 'local'],
    allergens: [],
    instructions: 'Steam matoke until soft. Simmer beans with onion and tomato. Serve hot.',
    components: [
      { slug: 'matoke', grams: 250 },
      { slug: 'ibishyimbo', grams: 180 },
      { slug: 'cabbage-cooked', grams: 100 },
    ],
  },
  {
    id: 'l-chicken-rice',
    title: 'Chicken stew with rice and carrots',
    meal_type: 'lunch',
    budget: 'high',
    cook_minutes: 50,
    tags: ['local', 'high_protein'],
    allergens: [],
    instructions: 'Simmer chicken with tomato and onion. Serve over rice with steamed carrots.',
    components: [
      { slug: 'chicken-stew', grams: 220 },
      { slug: 'rice-cooked', grams: 180 },
      { slug: 'carrot', grams: 80 },
    ],
  },
  {
    id: 'l-lentils-ugali',
    title: 'Ubugari with lentils and greens',
    meal_type: 'lunch',
    budget: 'low',
    cook_minutes: 30,
    tags: ['vegetarian', 'vegan', 'local', 'high_protein'],
    allergens: [],
    instructions: 'Cook lentils with tomato and onion. Serve with ubugari and sautéed greens.',
    components: [
      { slug: 'lentils-cooked', grams: 220 },
      { slug: 'ubugari', grams: 220 },
      { slug: 'amaranth-greens', grams: 120 },
    ],
  },
  {
    id: 'l-egg-salad',
    title: 'Egg and vegetable plate',
    meal_type: 'lunch',
    budget: 'low',
    cook_minutes: 15,
    tags: ['vegetarian', 'high_protein'],
    allergens: ['eggs'],
    instructions: 'Boil eggs, slice tomato and avocado, and serve with bread or potatoes.',
    components: [
      { slug: 'egg-boiled', grams: 100 },
      { slug: 'tomato', grams: 120 },
      { slug: 'avocado', grams: 80 },
      { slug: 'potato-boiled', grams: 150 },
    ],
  },
  {
    id: 'd-beans-potato',
    title: 'Bean stew with sweet potato',
    meal_type: 'dinner',
    budget: 'low',
    cook_minutes: 35,
    tags: ['vegetarian', 'vegan', 'local'],
    allergens: [],
    instructions: 'Simmer beans with onion and tomato. Boil sweet potatoes and serve alongside.',
    components: [
      { slug: 'ibishyimbo', grams: 200 },
      { slug: 'sweet-potato', grams: 200 },
      { slug: 'cabbage-cooked', grams: 120 },
    ],
  },
  {
    id: 'd-ubugari-isombe',
    title: 'Ubugari with isombe and groundnut sauce',
    meal_type: 'dinner',
    budget: 'low',
    cook_minutes: 40,
    tags: ['vegetarian', 'vegan', 'local'],
    allergens: ['peanuts'],
    instructions: 'Prepare cassava leaves with a spoon of groundnut sauce. Serve with hot ubugari.',
    components: [
      { slug: 'ubugari', grams: 220 },
      { slug: 'isombe', grams: 180 },
      { slug: 'groundnut-sauce', grams: 40 },
    ],
  },
  {
    id: 'd-beef-matoke',
    title: 'Beef stew with matoke',
    meal_type: 'dinner',
    budget: 'medium',
    cook_minutes: 55,
    tags: ['local', 'high_protein'],
    allergens: [],
    instructions: 'Slow-cook beef with tomato and onion. Steam matoke and serve with the stew.',
    components: [
      { slug: 'beef-stew', grams: 220 },
      { slug: 'matoke', grams: 220 },
      { slug: 'spinach-cooked', grams: 100 },
    ],
  },
  {
    id: 'd-fish-potato',
    title: 'Tilapia with potatoes and greens',
    meal_type: 'dinner',
    budget: 'medium',
    cook_minutes: 35,
    tags: ['pescatarian', 'local', 'high_protein'],
    allergens: ['fish'],
    instructions: 'Pan-cook tilapia with tomato. Boil potatoes and serve with greens.',
    components: [
      { slug: 'tilapia', grams: 150 },
      { slug: 'potato-boiled', grams: 200 },
      { slug: 'amaranth-greens', grams: 120 },
    ],
  },
  {
    id: 'd-soya-rice',
    title: 'Soya pieces with rice and peas',
    meal_type: 'dinner',
    budget: 'low',
    cook_minutes: 25,
    tags: ['vegetarian', 'vegan', 'high_protein'],
    allergens: ['soy'],
    instructions: 'Simmer soya pieces in tomato sauce. Serve with rice and green peas.',
    components: [
      { slug: 'soya-pieces', grams: 150 },
      { slug: 'rice-cooked', grams: 160 },
      { slug: 'green-peas', grams: 100 },
    ],
  },
  {
    id: 'd-chapati-beans',
    title: 'Chapati with bean stew',
    meal_type: 'dinner',
    budget: 'low',
    cook_minutes: 30,
    tags: ['vegetarian', 'local'],
    allergens: ['gluten'],
    instructions: 'Warm chapatis and serve with a thick bean stew.',
    components: [{ slug: 'chapati', grams: 160 }, { slug: 'ibishyimbo', grams: 200 }],
  },
  {
    id: 's-fruit',
    title: 'Seasonal fruit plate',
    meal_type: 'snack',
    budget: 'low',
    cook_minutes: 5,
    tags: ['vegetarian', 'vegan', 'local'],
    allergens: [],
    instructions: 'Slice whatever fruit is in season and serve fresh.',
    components: [{ slug: 'mango', grams: 150 }, { slug: 'banana', grams: 118 }],
  },
  {
    id: 's-mandazi-tea',
    title: 'Mandazi and tea',
    meal_type: 'snack',
    budget: 'low',
    cook_minutes: 5,
    tags: ['vegetarian', 'local'],
    allergens: ['gluten', 'eggs', 'milk'],
    instructions: 'Serve a small mandazi with unsweetened tea.',
    components: [{ slug: 'mandazi', grams: 45 }, { slug: 'tea-milk', grams: 240 }],
  },
  {
    id: 's-groundnuts-fruit',
    title: 'Groundnuts with passion fruit',
    meal_type: 'snack',
    budget: 'low',
    cook_minutes: 3,
    tags: ['vegetarian', 'vegan', 'local'],
    allergens: ['peanuts'],
    instructions: 'A small handful of groundnuts with fresh passion fruit.',
    components: [{ slug: 'groundnuts', grams: 20 }, { slug: 'passion-fruit', grams: 36 }],
  },
  {
    id: 's-ikivuguto',
    title: 'Ikivuguto',
    meal_type: 'snack',
    budget: 'low',
    cook_minutes: 2,
    tags: ['vegetarian', 'local', 'high_protein'],
    allergens: ['milk'],
    instructions: 'Serve a cup of fermented milk, plain or with a little fruit.',
    components: [{ slug: 'ikivuguto', grams: 240 }],
  },
];

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase().replace(/s$/, '');
}

function dietaryAllowed(template: Template, preferences: PlanPreferences): boolean {
  const diets = preferences.dietary_preferences.map(normalizeTerm);
  const tags = template.tags.map(normalizeTerm);
  for (const diet of diets) {
    if (diet === 'vegan' && !tags.includes('vegan')) return false;
    if (diet === 'vegetarian' && !tags.includes('vegetarian')) return false;
    if (diet === 'pescatarian' && !tags.includes('pescatarian') && !tags.includes('vegetarian')) return false;
    if (diet === 'gluten free' || diet === 'gluten_free' || diet === 'gluten-free') {
      if (template.allergens.includes('gluten')) return false;
    }
    if (diet === 'dairy free' || diet === 'dairy_free' || diet === 'dairy-free') {
      if (template.allergens.includes('milk')) return false;
    }
    if (diet === 'nut free' || diet === 'nut_free' || diet === 'nut-free') {
      if (template.allergens.includes('peanuts')) return false;
    }
  }
  return true;
}

function allergensAllowed(template: Template, allergies: string[]): boolean {
  const normalized = allergies.map(normalizeTerm);
  return template.allergens.every((allergen) => !normalized.includes(normalizeTerm(allergen)));
}

function templateScore(template: Template, preferences: PlanPreferences, foodsBySlug: Map<string, Food>): number {
  let score = 0;
  const available = preferences.available_ingredients.map(normalizeTerm);
  for (const component of template.components) {
    const food = foodsBySlug.get(component.slug);
    if (!food) continue;
    const haystack = `${food.name} ${food.alt_names.join(' ')}`.toLowerCase();
    if (available.some((item) => item.length > 2 && haystack.includes(item))) score += 5;
    if (preferences.local_foods && food.tags?.includes('local')) score += 1;
  }
  if (preferences.budget === 'low' && template.budget === 'low') score += 2;
  if (preferences.budget === 'high' && template.budget === 'high') score += 1;
  if (template.cook_minutes <= preferences.max_cook_minutes) score += 2;
  return score;
}

export function generatePlan(db: Database, userId: string, today: string, preferences: PlanPreferences): MealPlan {
  const slugs = [...new Set(TEMPLATES.flatMap((template) => template.components.map((component) => component.slug)))];
  const placeholders = slugs.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM foods WHERE slug IN (${placeholders})`).all(...slugs) as unknown as FoodRow[];
  const foodsBySlug = new Map<string, Food>(rows.map((row) => [row.slug, rowToFood(row)]));
  if (foodsBySlug.size !== slugs.length) {
    throw new ApiError(500, 'CATALOG_INCOMPLETE', 'The food catalog is incomplete. Re-run the seed script.');
  }

  const eligible = TEMPLATES.filter(
    (template) =>
      template.cook_minutes <= preferences.max_cook_minutes &&
      dietaryAllowed(template, preferences) &&
      allergensAllowed(template, preferences.allergies),
  );
  const eligibleByType = new Map<string, Template[]>();
  for (const type of preferences.meal_types) {
    const options = eligible.filter((template) => template.meal_type === type);
    if (options.length === 0) {
      throw new ApiError(
        422,
        'PLAN_NO_MATCH',
        `No ${type} recipe matches these restrictions. Try removing a filter or allowing a longer cooking time.`,
      );
    }
    options.sort(
      (a, b) =>
        templateScore(b, preferences, foodsBySlug) - templateScore(a, preferences, foodsBySlug) ||
        a.title.localeCompare(b.title),
    );
    eligibleByType.set(type, options);
  }

  const usedRecently = new Map<string, number>();
  const items: MealPlanItem[] = [];
  const shopping = new Map<string, { name: string; grams: number; category: string }>();

  for (let day = 1; day <= preferences.days; day += 1) {
    for (const mealType of preferences.meal_types) {
      const options = eligibleByType.get(mealType) ?? [];
      const sorted = [...options].sort((a, b) => {
        const aUsed = usedRecently.get(a.id) ?? 0;
        const bUsed = usedRecently.get(b.id) ?? 0;
        if (aUsed !== bUsed) return aUsed - bUsed;
        return templateScore(b, preferences, foodsBySlug) - templateScore(a, preferences, foodsBySlug);
      });
      const chosen = sorted[0];
      if (!chosen) continue;
      usedRecently.set(chosen.id, (usedRecently.get(chosen.id) ?? 0) + 1);

      const components = chosen.components.map((component) => {
        const food = foodsBySlug.get(component.slug) as Food;
        return {
          name: food.name,
          grams: Math.round(component.grams * preferences.servings),
          food_id: food.id,
          per100g: food.per_100g,
          category: food.category ?? 'other',
        };
      });
      const totals = roundNutrition(
        sumNutrition(
          components.map((component) =>
            scaleNutrition(component.per100g, component.grams / preferences.servings),
          ),
        ),
      );
      const ingredientLabels = components.map(
        (component) => `${component.name} — ${Math.round(component.grams)} g (${preferences.servings} serving${preferences.servings === 1 ? '' : 's'})`,
      );
      const item: MealPlanItem = {
        id: newId(),
        day_index: day,
        meal_type: mealType,
        title: chosen.title,
        ingredients: ingredientLabels,
        instructions: chosen.instructions,
        totals,
        components: components.map((component) => ({ name: component.name, grams: component.grams, food_id: component.food_id })),
      };
      items.push(item);
      for (const component of components) {
        const existing = shopping.get(component.name);
        if (existing) existing.grams += component.grams;
        else shopping.set(component.name, { name: component.name, grams: component.grams, category: component.category });
      }
    }
  }

  const weekStart = today;
  const planId = newId();
  const now = new Date().toISOString();
  const shoppingList = [...shopping.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const storedPreferences = {
    days: preferences.days,
    meal_types: preferences.meal_types,
    dietary_preferences: preferences.dietary_preferences,
    allergies: preferences.allergies,
    budget: preferences.budget,
    max_cook_minutes: preferences.max_cook_minutes,
    servings: preferences.servings,
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      'INSERT INTO meal_plans (id, user_id, week_start, title, preferences, shopping_list, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      planId,
      userId,
      weekStart,
      `Meal plan from ${weekStart}`,
      JSON.stringify(storedPreferences),
      JSON.stringify(shoppingList),
      now,
    );
    const insertItem = db.prepare(
      `INSERT INTO meal_plan_items (id, plan_id, day_index, meal_type, title, ingredients, instructions, totals, components, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    items.forEach((item, index) => {
      insertItem.run(
        item.id,
        planId,
        item.day_index,
        item.meal_type,
        item.title,
        JSON.stringify(item.ingredients),
        item.instructions,
        JSON.stringify(item.totals),
        JSON.stringify(item.components),
        index,
      );
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getPlan(db, userId, planId);
}

export function getPlan(db: Database, userId: string, planId: string): MealPlan {
  const planRow = db.prepare('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, userId) as
    | {
        id: string;
        week_start: string;
        title: string;
        preferences: string;
        shopping_list: string;
        created_at: string;
      }
    | undefined;
  if (!planRow) throw new ApiError(404, 'NOT_FOUND', 'Meal plan not found');
  const itemRows = db
    .prepare('SELECT * FROM meal_plan_items WHERE plan_id = ? ORDER BY sort_order ASC')
    .all(planId) as Array<{
    id: string;
    day_index: number;
    meal_type: MealPlanItem['meal_type'];
    title: string;
    ingredients: string;
    instructions: string;
    totals: string;
    components: string;
  }>;
  const stored = json<Record<string, unknown>>(planRow.preferences, {});
  return {
    id: planRow.id,
    week_start: planRow.week_start,
    title: planRow.title,
    preferences: {
      days: Number(stored.days ?? 7),
      meal_types: (stored.meal_types as MealPlanItem['meal_type'][]) ?? ['breakfast', 'lunch', 'dinner'],
      dietary_preferences: (stored.dietary_preferences as string[]) ?? [],
      allergies: (stored.allergies as string[]) ?? [],
      budget: (stored.budget as 'low' | 'medium' | 'high') ?? 'medium',
      max_cook_minutes: Number(stored.max_cook_minutes ?? 45),
      servings: Number(stored.servings ?? 2),
    },
    items: itemRows.map((row) => ({
      id: row.id,
      day_index: row.day_index,
      meal_type: row.meal_type,
      title: row.title,
      ingredients: json<string[]>(row.ingredients, []),
      instructions: row.instructions,
      totals: json<RoundedNutrition>(row.totals, { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: null }),
      components: json<MealPlanItem['components']>(row.components, []),
    })),
    shopping_list: json<MealPlan['shopping_list']>(planRow.shopping_list, []),
    created_at: planRow.created_at,
  };
}

export function listPlans(db: Database, userId: string): MealPlan[] {
  const rows = db
    .prepare('SELECT id FROM meal_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(userId) as { id: string }[];
  return rows.map((row) => getPlan(db, userId, row.id));
}

export function updatePlan(
  db: Database,
  userId: string,
  planId: string,
  patch: {
    title?: string;
    items?: Array<{ id: string; title: string; ingredients: string[]; instructions: string }>;
  },
): MealPlan {
  const existing = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, userId);
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Meal plan not found');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (patch.title) db.prepare('UPDATE meal_plans SET title = ? WHERE id = ? AND user_id = ?').run(patch.title, planId, userId);
    for (const item of patch.items ?? []) {
      db.prepare(
        `UPDATE meal_plan_items SET title = ?, ingredients = ?, instructions = ?
          WHERE id = ? AND plan_id = ?`,
      ).run(item.title, JSON.stringify(item.ingredients), item.instructions, item.id, planId);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getPlan(db, userId, planId);
}

export function deletePlan(db: Database, userId: string, planId: string): void {
  const result = db.prepare('DELETE FROM meal_plans WHERE id = ? AND user_id = ?').run(planId, userId);
  if (result.changes === 0) throw new ApiError(404, 'NOT_FOUND', 'Meal plan not found');
}
