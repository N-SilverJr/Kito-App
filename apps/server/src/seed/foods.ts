import { createHash } from 'node:crypto';
import type { Database } from '../db.js';
import type { NutritionFacts, ServingSize } from '@nutripals/core';

export interface SeedFood {
  slug: string;
  name: string;
  alt_names: string[];
  locale: string;
  category: string;
  tags: string[];
  allergens: string[];
  per_100g: NutritionFacts;
  serving_sizes: ServingSize[];
}

const ATTRIBUTION =
  'NutriPals curated reference values, compiled from USDA FoodData Central and FAO/INFOODS food composition tables. Approximate values for cooked food per 100 g edible portion.';

const cup = (grams: number): ServingSize => ({ unit: 'cup', grams, approximate: true });
const piece = (grams: number): ServingSize => ({ unit: 'piece', grams, approximate: true });
const tbsp = (grams: number): ServingSize => ({ unit: 'tbsp', grams, approximate: true });

/**
 * A deliberately small, human-curated catalog of everyday East African and
 * international foods. It is extensible: users can add their own foods, and
 * external databases (Open Food Facts, USDA) extend search at runtime.
 * Values are per 100 g of the food as usually eaten.
 */
export const CATALOG: SeedFood[] = [
  { slug: 'ubugari', name: 'Ubugari (stiff maize meal)', alt_names: ['ugali', 'sima', 'posho', 'maize meal porridge'], locale: 'rw', category: 'grain', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget'], allergens: [], per_100g: { kcal: 158, protein: 3.4, carbs: 34, fat: 1.1, fiber: 1.6 }, serving_sizes: [cup(240), piece(150)] },
  { slug: 'isombe', name: 'Isombe (cassava leaf stew)', alt_names: ['cassava leaves', 'sombe', 'pounded cassava leaves'], locale: 'rw', category: 'vegetable', tags: ['vegetarian', 'local', 'budget'], allergens: [], per_100g: { kcal: 120, protein: 3.5, carbs: 12, fat: 6.5, fiber: 4.2 }, serving_sizes: [cup(200)] },
  { slug: 'ibishyimbo', name: 'Ibishyimbo (bean stew)', alt_names: ['beans stew', 'beans', 'bishyimbo', 'maharagwe'], locale: 'rw', category: 'legume', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget', 'high_protein'], allergens: [], per_100g: { kcal: 127, protein: 8.5, carbs: 18, fat: 2.5, fiber: 6.5 }, serving_sizes: [cup(200)] },
  { slug: 'rice-cooked', name: 'Rice, cooked', alt_names: ['umuceri', 'white rice', 'steamed rice'], locale: 'rw', category: 'grain', tags: ['vegetarian', 'vegan', 'gluten_free', 'budget'], allergens: [], per_100g: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 }, serving_sizes: [cup(180)] },
  { slug: 'sweet-potato', name: 'Sweet potato, boiled', alt_names: ['ibirayi biryohereye', 'kandolo', 'viazi vitamu'], locale: 'rw', category: 'vegetable', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget'], allergens: [], per_100g: { kcal: 90, protein: 2, carbs: 20.7, fat: 0.2, fiber: 3.3 }, serving_sizes: [piece(130)] },
  { slug: 'matoke', name: 'Matoke (cooked plantain)', alt_names: ['igitoki', 'cooking banana', 'plantain'], locale: 'rw', category: 'vegetable', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget'], allergens: [], per_100g: { kcal: 122, protein: 1.3, carbs: 32, fat: 0.4, fiber: 2.3 }, serving_sizes: [cup(200)] },
  { slug: 'chapati', name: 'Chapati', alt_names: ['chapatis', 'flatbread'], locale: 'rw', category: 'grain', tags: ['vegetarian', 'local'], allergens: ['gluten'], per_100g: { kcal: 330, protein: 9, carbs: 45, fat: 12, fiber: 2.8 }, serving_sizes: [piece(80)] },
  { slug: 'mandazi', name: 'Mandazi', alt_names: ['mandazis', 'fried dough'], locale: 'rw', category: 'snack', tags: ['vegetarian', 'local'], allergens: ['gluten', 'eggs', 'milk'], per_100g: { kcal: 390, protein: 6, carbs: 48, fat: 19, fiber: 1.5 }, serving_sizes: [piece(45)] },
  { slug: 'egg-boiled', name: 'Egg, boiled', alt_names: ['amagi', 'eggs'], locale: 'global', category: 'protein', tags: ['vegetarian', 'gluten_free', 'high_protein', 'budget'], allergens: ['eggs'], per_100g: { kcal: 155, protein: 12.6, carbs: 1.1, fat: 10.6, fiber: 0 }, serving_sizes: [piece(50)] },
  { slug: 'ikivuguto', name: 'Ikivuguto (fermented milk)', alt_names: ['fermented milk', 'yogurt drink', 'amata yasavye'], locale: 'rw', category: 'dairy', tags: ['vegetarian', 'local', 'budget'], allergens: ['milk'], per_100g: { kcal: 61, protein: 3.3, carbs: 4.8, fat: 3.3, fiber: 0 }, serving_sizes: [cup(240)] },
  { slug: 'milk-whole', name: 'Milk, whole', alt_names: ['amata', 'fresh milk'], locale: 'rw', category: 'dairy', tags: ['vegetarian', 'local'], allergens: ['milk'], per_100g: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0 }, serving_sizes: [cup(244)] },
  { slug: 'avocado', name: 'Avocado', alt_names: ['avoka', 'ovacado'], locale: 'rw', category: 'fruit', tags: ['vegetarian', 'vegan', 'gluten_free', 'local'], allergens: [], per_100g: { kcal: 160, protein: 2, carbs: 8.5, fat: 14.7, fiber: 6.7 }, serving_sizes: [piece(100)] },
  { slug: 'banana', name: 'Banana', alt_names: ['umuneke', 'igitoke', 'bananas'], locale: 'rw', category: 'fruit', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget'], allergens: [], per_100g: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6 }, serving_sizes: [piece(118)] },
  { slug: 'plantain-raw', name: 'Plantain, raw', alt_names: ['cooking banana raw', 'igitoki kibisi'], locale: 'rw', category: 'fruit', tags: ['vegetarian', 'vegan', 'gluten_free', 'local'], allergens: [], per_100g: { kcal: 122, protein: 1.3, carbs: 31.9, fat: 0.4, fiber: 2.3 }, serving_sizes: [piece(200)] },
  { slug: 'cassava-boiled', name: 'Cassava, boiled', alt_names: ['imyumbati', 'manioc', 'muhogo'], locale: 'rw', category: 'vegetable', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget'], allergens: [], per_100g: { kcal: 191, protein: 1.4, carbs: 45, fat: 0.3, fiber: 1.8 }, serving_sizes: [piece(150)] },
  { slug: 'potato-boiled', name: 'Potato, boiled', alt_names: ['ibirayi', 'viazi', 'irish potato'], locale: 'rw', category: 'vegetable', tags: ['vegetarian', 'vegan', 'gluten_free', 'budget'], allergens: [], per_100g: { kcal: 87, protein: 1.9, carbs: 20, fat: 0.1, fiber: 1.8 }, serving_sizes: [piece(150)] },
  { slug: 'tilapia', name: 'Tilapia, cooked', alt_names: ['isamaki', 'fish', 'nile tilapia'], locale: 'rw', category: 'protein', tags: ['pescatarian', 'gluten_free', 'local', 'high_protein'], allergens: ['fish'], per_100g: { kcal: 128, protein: 26, carbs: 0, fat: 2.7, fiber: 0 }, serving_sizes: [piece(150)] },
  { slug: 'beef-stew', name: 'Beef stew', alt_names: ['inyama y’inka', 'beef and sauce'], locale: 'rw', category: 'protein', tags: ['gluten_free', 'local', 'high_protein'], allergens: [], per_100g: { kcal: 190, protein: 16, carbs: 5, fat: 11.5, fiber: 0.5 }, serving_sizes: [cup(220)] },
  { slug: 'chicken-stew', name: 'Chicken stew', alt_names: ['inkoko', 'chicken sauce'], locale: 'rw', category: 'protein', tags: ['gluten_free', 'local', 'high_protein'], allergens: [], per_100g: { kcal: 160, protein: 18, carbs: 4, fat: 8, fiber: 0.4 }, serving_sizes: [cup(240)] },
  { slug: 'lentils-cooked', name: 'Lentils, cooked', alt_names: ['lentil stew', 'ibishyimbo by’ubwoko'], locale: 'global', category: 'legume', tags: ['vegetarian', 'vegan', 'gluten_free', 'budget', 'high_protein'], allergens: [], per_100g: { kcal: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9 }, serving_sizes: [cup(198)] },
  { slug: 'kidney-beans-cooked', name: 'Kidney beans, cooked', alt_names: ['red beans', 'ibishyimbo bitukura'], locale: 'global', category: 'legume', tags: ['vegetarian', 'vegan', 'gluten_free', 'budget', 'high_protein'], allergens: [], per_100g: { kcal: 127, protein: 8.7, carbs: 22.8, fat: 0.5, fiber: 6.4 }, serving_sizes: [cup(177)] },
  { slug: 'maize-boiled', name: 'Maize, boiled', alt_names: ['corn on the cob', 'ibigori'], locale: 'rw', category: 'grain', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget'], allergens: [], per_100g: { kcal: 96, protein: 3.4, carbs: 21, fat: 1.5, fiber: 2.4 }, serving_sizes: [piece(90)] },
  { slug: 'sorghum-porridge', name: 'Sorghum porridge', alt_names: ['amasaka', 'sorghum ugali', 'porridge'], locale: 'rw', category: 'grain', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget'], allergens: [], per_100g: { kcal: 90, protein: 2.5, carbs: 19, fat: 0.6, fiber: 1.8 }, serving_sizes: [cup(250)] },
  { slug: 'millet-porridge', name: 'Millet porridge with milk', alt_names: ['uburo', 'millet ugali'], locale: 'rw', category: 'grain', tags: ['vegetarian', 'local', 'budget'], allergens: ['milk'], per_100g: { kcal: 105, protein: 3, carbs: 21, fat: 1.2, fiber: 1.5 }, serving_sizes: [cup(250)] },
  { slug: 'spinach-cooked', name: 'Spinach, cooked', alt_names: ['imvune', 'greens', 'amaranth leaves'], locale: 'rw', category: 'vegetable', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget'], allergens: [], per_100g: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 }, serving_sizes: [cup(180)] },
  { slug: 'amaranth-greens', name: 'Amaranth greens (dodo)', alt_names: ['dodo', 'imbwija', 'green amaranth'], locale: 'rw', category: 'vegetable', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget'], allergens: [], per_100g: { kcal: 23, protein: 2.5, carbs: 4, fat: 0.3, fiber: 2.1 }, serving_sizes: [cup(130)] },
  { slug: 'cabbage-cooked', name: 'Cabbage, cooked', alt_names: ['amashu', 'cabbage'], locale: 'rw', category: 'vegetable', tags: ['vegetarian', 'vegan', 'gluten_free', 'budget'], allergens: [], per_100g: { kcal: 23, protein: 1.3, carbs: 5.5, fat: 0.1, fiber: 1.9 }, serving_sizes: [cup(150)] },
  { slug: 'carrot', name: 'Carrot', alt_names: ['karoti', 'carrots'], locale: 'global', category: 'vegetable', tags: ['vegetarian', 'vegan', 'gluten_free', 'budget'], allergens: [], per_100g: { kcal: 41, protein: 0.9, carbs: 9.6, fat: 0.2, fiber: 2.8 }, serving_sizes: [piece(61)] },
  { slug: 'tomato', name: 'Tomato', alt_names: ['inyanya', 'tomatoes'], locale: 'global', category: 'vegetable', tags: ['vegetarian', 'vegan', 'gluten_free', 'budget'], allergens: [], per_100g: { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 }, serving_sizes: [piece(123)] },
  { slug: 'onion', name: 'Onion', alt_names: ['igitunguru', 'onions'], locale: 'global', category: 'vegetable', tags: ['vegetarian', 'vegan', 'gluten_free', 'budget'], allergens: [], per_100g: { kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1, fiber: 1.7 }, serving_sizes: [piece(110)] },
  { slug: 'green-peas', name: 'Green peas, cooked', alt_names: ['peas', 'amananasi y’ubushyuhe'], locale: 'global', category: 'legume', tags: ['vegetarian', 'vegan', 'gluten_free', 'budget'], allergens: [], per_100g: { kcal: 81, protein: 5.4, carbs: 14.5, fat: 0.4, fiber: 5.7 }, serving_sizes: [cup(160)] },
  { slug: 'groundnuts', name: 'Groundnuts (peanuts)', alt_names: ['peanuts', 'ubunyobwa', 'groundnut'], locale: 'rw', category: 'protein', tags: ['vegetarian', 'vegan', 'gluten_free', 'local', 'budget'], allergens: ['peanuts'], per_100g: { kcal: 567, protein: 25.8, carbs: 16.1, fat: 49.2, fiber: 8.5 }, serving_sizes: [{ unit: 'handful', grams: 30, approximate: true }] },
  { slug: 'groundnut-sauce', name: 'Groundnut sauce', alt_names: ['peanut sauce', 'isosi y’ubunyobwa'], locale: 'rw', category: 'fat', tags: ['vegetarian', 'vegan', 'gluten_free', 'local'], allergens: ['peanuts'], per_100g: { kcal: 250, protein: 8, carbs: 10, fat: 20, fiber: 3 }, serving_sizes: [cup(200)] },
  { slug: 'mango', name: 'Mango', alt_names: ['umwembe', 'mangoes'], locale: 'rw', category: 'fruit', tags: ['vegetarian', 'vegan', 'gluten_free', 'local'], allergens: [], per_100g: { kcal: 60, protein: 0.8, carbs: 15, fat: 0.4, fiber: 1.6 }, serving_sizes: [piece(200)] },
  { slug: 'pineapple', name: 'Pineapple', alt_names: ['inanasi'], locale: 'rw', category: 'fruit', tags: ['vegetarian', 'vegan', 'gluten_free', 'local'], allergens: [], per_100g: { kcal: 50, protein: 0.5, carbs: 13, fat: 0.1, fiber: 1.4 }, serving_sizes: [cup(165)] },
  { slug: 'papaya', name: 'Papaya', alt_names: ['ipapayi'], locale: 'rw', category: 'fruit', tags: ['vegetarian', 'vegan', 'gluten_free', 'local'], allergens: [], per_100g: { kcal: 43, protein: 0.5, carbs: 10.8, fat: 0.3, fiber: 1.7 }, serving_sizes: [cup(145)] },
  { slug: 'orange', name: 'Orange', alt_names: ['icunga', 'oranges'], locale: 'global', category: 'fruit', tags: ['vegetarian', 'vegan', 'gluten_free'], allergens: [], per_100g: { kcal: 47, protein: 0.9, carbs: 11.8, fat: 0.1, fiber: 2.4 }, serving_sizes: [piece(131)] },
  { slug: 'passion-fruit', name: 'Passion fruit', alt_names: ['amaracuja', 'passionfruit'], locale: 'rw', category: 'fruit', tags: ['vegetarian', 'vegan', 'gluten_free', 'local'], allergens: [], per_100g: { kcal: 97, protein: 2.2, carbs: 23, fat: 0.7, fiber: 10.4 }, serving_sizes: [{ unit: 'piece', grams: 18, approximate: true }] },
  { slug: 'bread-white', name: 'Bread, white', alt_names: ['umugati', 'bread'], locale: 'global', category: 'grain', tags: ['vegetarian'], allergens: ['gluten'], per_100g: { kcal: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7 }, serving_sizes: [{ unit: 'slice', grams: 28, approximate: true }] },
  { slug: 'yogurt-plain', name: 'Yogurt, plain', alt_names: ['yoghurt'], locale: 'global', category: 'dairy', tags: ['vegetarian', 'gluten_free', 'high_protein'], allergens: ['milk'], per_100g: { kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0 }, serving_sizes: [cup(245)] },
  { slug: 'soya-pieces', name: 'Soya pieces, cooked', alt_names: ['soya', 'textured soy protein'], locale: 'global', category: 'protein', tags: ['vegetarian', 'vegan', 'high_protein', 'budget'], allergens: ['soy'], per_100g: { kcal: 170, protein: 20, carbs: 12, fat: 4, fiber: 5 }, serving_sizes: [cup(150)] },
  { slug: 'cooking-oil', name: 'Cooking oil', alt_names: ['vegetable oil', 'amavuta'], locale: 'global', category: 'fat', tags: ['vegetarian', 'vegan', 'gluten_free'], allergens: [], per_100g: { kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 }, serving_sizes: [tbsp(13.5)] },
  { slug: 'sugar', name: 'Sugar', alt_names: ['isukari', 'table sugar'], locale: 'global', category: 'sweetener', tags: ['vegetarian', 'vegan', 'gluten_free'], allergens: [], per_100g: { kcal: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 }, serving_sizes: [{ unit: 'tsp', grams: 4.2, approximate: true }] },
  { slug: 'tea-milk', name: 'Tea with milk, unsweetened', alt_names: ['icyayi', 'chai'], locale: 'rw', category: 'beverage', tags: ['vegetarian', 'local'], allergens: ['milk'], per_100g: { kcal: 20, protein: 1, carbs: 2.2, fat: 0.7, fiber: 0 }, serving_sizes: [cup(240)] },
  { slug: 'samosa', name: 'Samosa', alt_names: ['sambusa'], locale: 'rw', category: 'snack', tags: ['local'], allergens: ['gluten'], per_100g: { kcal: 300, protein: 6, carbs: 30, fat: 17, fiber: 1.2 }, serving_sizes: [piece(60)] },
];

export function stableFoodId(slug: string): string {
  const hex = createHash('sha1').update(`nutripals:food:${slug}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function seedCatalog(db: Database): number {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO foods (id, slug, name, alt_names, locale, brand, category, tags, allergens, per_100g, serving_sizes, source, source_id, attribution, verified, is_public, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'catalog', NULL, ?, 1, 1, NULL, ?)
     ON CONFLICT(slug) DO UPDATE SET
       name = excluded.name, alt_names = excluded.alt_names, category = excluded.category,
       tags = excluded.tags, allergens = excluded.allergens, per_100g = excluded.per_100g,
       serving_sizes = excluded.serving_sizes, attribution = excluded.attribution`,
  );
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const food of CATALOG) {
      insert.run(
        stableFoodId(food.slug),
        food.slug,
        food.name,
        JSON.stringify(food.alt_names),
        food.locale,
        food.category,
        JSON.stringify(food.tags),
        JSON.stringify(food.allergens),
        JSON.stringify(food.per_100g),
        JSON.stringify(food.serving_sizes),
        ATTRIBUTION,
        now,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return CATALOG.length;
}
