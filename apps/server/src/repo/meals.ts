import type { Database } from '../db.js';
import { json } from '../db.js';
import { ApiError, newId, notFound } from '../http.js';
import {
  localDateKey,
  mealTotals,
  scaleNutrition,
  type Food,
  type Meal,
  type MealItem,
  type MealInput,
  type MealItemInput,
  type NutritionFacts,
  type ServingSize,
} from '@nutripals/core';

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

interface MealRow {
  id: string;
  user_id: string;
  local_date: string;
  meal_type: Meal['meal_type'];
  title: string | null;
  notes: string | null;
  eaten_at: string;
  source: Meal['source'];
  ai_analysis_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MealItemRow {
  id: string;
  meal_id: string;
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
  source: MealItem['source'];
  confidence: number | null;
  portion_uncertainty: MealItem['portion_uncertainty'];
  ingredients: string;
  sort_order: number;
}

export function rowToFood(row: FoodRow): Food {
  return {
    id: row.id,
    name: row.name,
    alt_names: json<string[]>(row.alt_names, []),
    locale: row.locale,
    brand: row.brand,
    category: row.category,
    per_100g: json<NutritionFacts>(row.per_100g, { kcal: 0, protein: 0, carbs: 0, fat: 0 }),
    serving_sizes: json<ServingSize[]>(row.serving_sizes, []),
    tags: json<string[]>(row.tags, []),
    allergens: json<string[]>(row.allergens, []),
    source: row.source,
    source_id: row.source_id,
    attribution: row.attribution,
    verified: Boolean(row.verified),
    is_custom: row.created_by !== null,
    created_by: row.created_by,
  };
}

export function getFood(db: Database, foodId: string, userId: string): Food | null {
  const row = db
    .prepare('SELECT * FROM foods WHERE id = ? AND (is_public = 1 OR created_by = ?)')
    .get(foodId, userId) as unknown as FoodRow | undefined;
  return row ? rowToFood(row) : null;
}

export function listCatalog(db: Database, userId: string, limit = 200): Food[] {
  const rows = db
    .prepare(
      `SELECT * FROM foods WHERE is_public = 1 OR created_by = ?
       ORDER BY CASE category WHEN 'protein' THEN 0 WHEN 'legume' THEN 1 WHEN 'vegetable' THEN 2 WHEN 'grain' THEN 3 ELSE 4 END, name
       LIMIT ?`,
    )
    .all(userId, limit) as unknown as FoodRow[];
  return rows.map(rowToFood);
}

export function searchLocalFoods(db: Database, userId: string, query: string, limit: number): Food[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    const rows = db
      .prepare(
        `SELECT * FROM foods WHERE is_public = 1 OR created_by = ?
         ORDER BY (CASE WHEN source = 'catalog' THEN 0 ELSE 1 END), name LIMIT ?`,
      )
      .all(userId, limit) as unknown as FoodRow[];
    return rows.map(rowToFood);
  }
  const like = `%${q}%`;
  const prefix = `${q}%`;
  const rows = db
    .prepare(
      `SELECT * FROM foods
        WHERE (is_public = 1 OR created_by = ?)
          AND (lower(name) LIKE ? OR lower(alt_names) LIKE ? OR lower(COALESCE(brand, '')) LIKE ?)
        ORDER BY CASE
            WHEN lower(name) = ? THEN 0
            WHEN lower(name) LIKE ? THEN 1
            WHEN lower(alt_names) LIKE ? THEN 2
            ELSE 3 END,
          verified DESC, name
        LIMIT ?`,
    )
    .all(userId, like, like, like, q, prefix, prefix, limit) as unknown as FoodRow[];
  return rows.map(rowToFood);
}

export function insertCustomFood(
  db: Database,
  userId: string,
  input: {
    name: string;
    alt_names: string[];
    brand?: string | null;
    category?: string | null;
    per_100g: NutritionFacts;
    serving_sizes: ServingSize[];
  },
): Food {
  const id = newId();
  db.prepare(
    `INSERT INTO foods (id, slug, name, alt_names, locale, brand, category, tags, allergens, per_100g, serving_sizes, source, source_id, attribution, verified, is_public, created_by, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, '[]', '[]', ?, ?, 'user_entered', NULL, 'Created by you', 0, 0, ?, ?)`,
  ).run(
    id,
    `custom-${id}`,
    input.name,
    JSON.stringify(input.alt_names),
    input.brand ?? null,
    input.category ?? null,
    JSON.stringify(input.per_100g),
    JSON.stringify(input.serving_sizes),
    userId,
    new Date().toISOString(),
  );
  return getFood(db, id, userId) as Food;
}

function mapMealItem(row: MealItemRow): MealItem {
  return {
    id: row.id,
    food_id: row.food_id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    grams: row.grams,
    kcal: row.kcal,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    fiber_g: row.fiber_g,
    source: row.source,
    confidence: row.confidence,
    portion_uncertainty: row.portion_uncertainty,
    ingredients: json<string[]>(row.ingredients, []),
    sort_order: row.sort_order,
  };
}

export function getMeal(db: Database, userId: string, mealId: string): Meal {
  const row = db.prepare('SELECT * FROM meals WHERE id = ? AND user_id = ?').get(mealId, userId) as unknown as MealRow | undefined;
  if (!row) throw notFound('Meal not found');
  const itemRows = db
    .prepare('SELECT * FROM meal_items WHERE meal_id = ? ORDER BY sort_order ASC, name ASC')
    .all(mealId) as unknown as MealItemRow[];
  const items = itemRows.map(mapMealItem);
  return {
    id: row.id,
    date: row.local_date,
    meal_type: row.meal_type,
    title: row.title,
    notes: row.notes,
    eaten_at: row.eaten_at,
    source: row.source,
    items,
    totals: mealTotals(items),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listMeals(
  db: Database,
  userId: string,
  range: { date?: string; from?: string; to?: string; limit?: number },
): Meal[] {
  const params: (string | number)[] = [userId];
  let where = 'user_id = ?';
  if (range.date) {
    where += ' AND local_date = ?';
    params.push(range.date);
  } else {
    if (range.from) {
      where += ' AND local_date >= ?';
      params.push(range.from);
    }
    if (range.to) {
      where += ' AND local_date <= ?';
      params.push(range.to);
    }
  }
  const limit = Math.min(range.limit ?? 400, 5000);
  const rows = db
    .prepare(`SELECT id FROM meals WHERE ${where} ORDER BY eaten_at DESC, created_at DESC LIMIT ?`)
    .all(...params, limit) as { id: string }[];
  return rows.map((row) => getMeal(db, userId, row.id));
}

function resolveItem(db: Database, userId: string, item: MealItemInput): MealItem {
  if (item.food_id) {
    const food = getFood(db, item.food_id, userId);
    if (!food) throw new ApiError(400, 'FOOD_NOT_FOUND', `Food “${item.name}” is no longer available.`);
    const scaled = scaleNutrition(food.per_100g, item.grams);
    return {
      id: newId(),
      food_id: food.id,
      name: food.name,
      quantity: item.quantity,
      unit: item.unit,
      grams: item.grams,
      kcal: scaled.kcal,
      protein_g: scaled.protein,
      carbs_g: scaled.carbs,
      fat_g: scaled.fat,
      fiber_g: scaled.fiber ?? null,
      source: food.source === 'catalog' ? 'catalog' : 'user_entered',
      confidence: item.confidence ?? null,
      portion_uncertainty: item.portion_uncertainty ?? null,
      ingredients: item.ingredients ?? [],
      sort_order: 0,
    };
  }
  return {
    id: newId(),
    food_id: null,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    grams: item.grams,
    kcal: item.nutrition.kcal,
    protein_g: item.nutrition.protein_g,
    carbs_g: item.nutrition.carbs_g,
    fat_g: item.nutrition.fat_g,
    fiber_g: item.nutrition.fiber_g ?? null,
    source: item.source,
    confidence: item.confidence ?? null,
    portion_uncertainty: item.portion_uncertainty ?? null,
    ingredients: item.ingredients ?? [],
    sort_order: 0,
  };
}

function insertItems(db: Database, mealId: string, items: MealItem[]): void {
  const statement = db.prepare(
    `INSERT INTO meal_items
       (id, meal_id, food_id, name, quantity, unit, grams, kcal, protein_g, carbs_g, fat_g, fiber_g, source, confidence, portion_uncertainty, ingredients, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  items.forEach((item, index) => {
    statement.run(
      item.id,
      mealId,
      item.food_id,
      item.name,
      item.quantity,
      item.unit,
      item.grams,
      item.kcal,
      item.protein_g,
      item.carbs_g,
      item.fat_g,
      item.fiber_g,
      item.source,
      item.confidence,
      item.portion_uncertainty,
      JSON.stringify(item.ingredients),
      index,
    );
  });
}

export function createMeal(db: Database, userId: string, timezone: string, input: MealInput): Meal {
  const now = new Date().toISOString();
  const mealId = newId();
  const localDate = localDateKey(new Date(input.eaten_at), timezone);
  const items = input.items.map((item) => resolveItem(db, userId, item));
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO meals (id, user_id, local_date, meal_type, title, notes, eaten_at, source, ai_analysis_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      mealId,
      userId,
      localDate,
      input.meal_type,
      input.title || null,
      input.notes || null,
      input.eaten_at,
      input.source,
      input.ai_analysis_id ?? null,
      now,
      now,
    );
    insertItems(db, mealId, items);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getMeal(db, userId, mealId);
}

export function updateMeal(
  db: Database,
  userId: string,
  timezone: string,
  mealId: string,
  patch: Partial<MealInput>,
): Meal {
  const existingRow = db
    .prepare('SELECT * FROM meals WHERE id = ? AND user_id = ?')
    .get(mealId, userId) as unknown as MealRow | undefined;
  if (!existingRow) throw notFound('Meal not found');
  const now = new Date().toISOString();
  const eatenAt = patch.eaten_at ?? existingRow.eaten_at;
  const localDate = localDateKey(new Date(eatenAt), timezone);
  const items = patch.items ? patch.items.map((item) => resolveItem(db, userId, item)) : null;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `UPDATE meals SET local_date = ?, meal_type = ?, title = ?, notes = ?, eaten_at = ?, source = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      localDate,
      patch.meal_type ?? existingRow.meal_type,
      patch.title === undefined ? existingRow.title : patch.title || null,
      patch.notes === undefined ? existingRow.notes : patch.notes || null,
      eatenAt,
      patch.source ?? existingRow.source,
      now,
      mealId,
      userId,
    );
    if (items) {
      db.prepare('DELETE FROM meal_items WHERE meal_id = ?').run(mealId);
      insertItems(db, mealId, items);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getMeal(db, userId, mealId);
}

export function deleteMeal(db: Database, userId: string, mealId: string): void {
  const result = db.prepare('DELETE FROM meals WHERE id = ? AND user_id = ?').run(mealId, userId);
  if (result.changes === 0) throw notFound('Meal not found');
}
