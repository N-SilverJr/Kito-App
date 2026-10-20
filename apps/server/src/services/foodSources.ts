import type { Database } from '../db.js';
import type { Config } from '../env.js';
import { ApiError } from '../http.js';
import { searchLocalFoods } from '../repo/meals.js';
import {
  resolveGrams,
  roundNutrition,
  scaleNutrition,
  type Food,
  type NutritionFacts,
  type ServingSize,
  type TextParseResponse,
} from '@nutripals/core';

const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown): void {
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, unknown>;
  allergens_tags?: string[];
  categories_tags?: string[];
  labels_tags?: string[];
}

function mapOffProduct(product: OffProduct): Food | null {
  const name = (product.product_name ?? product.product_name_en ?? '').trim();
  const code = product.code?.trim();
  if (!name || !code) return null;
  const nutriments = product.nutriments ?? {};
  const kcal = num(nutriments['energy-kcal_100g']) ?? (num(nutriments.energy_100g) ? Number(num(nutriments.energy_100g)) / 4.184 : null);
  const protein = num(nutriments.proteins_100g);
  const carbs = num(nutriments.carbohydrates_100g);
  const fat = num(nutriments.fat_100g);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  if (kcal < 1 || kcal > 900) return null;
  const fiber = num(nutriments.fiber_100g);
  const per100g: NutritionFacts = {
    kcal,
    protein,
    carbs,
    fat,
    fiber: fiber !== null && fiber >= 0 ? fiber : undefined,
  };
  const servingGrams = num(product.serving_quantity) ?? num(product.quantity);
  const servingSizes: ServingSize[] = servingGrams && servingGrams > 0 ? [{ unit: 'serving', grams: servingGrams, approximate: true }] : [];
  const allergens = (product.allergens_tags ?? [])
    .map((tag) => tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '))
    .slice(0, 8);
  const labels = (product.labels_tags ?? []).map((tag) => tag.replace(/^[a-z]{2}:/, ''));
  return {
    id: `ext:off:${code}`,
    name,
    alt_names: product.quantity ? [product.quantity] : [],
    locale: null,
    brand: product.brands ?? null,
    category: 'packaged',
    per_100g: per100g,
    serving_sizes: servingSizes,
    tags: ['packaged', ...labels.slice(0, 3)],
    allergens,
    source: 'open_food_facts',
    source_id: code,
    attribution: 'Open Food Facts (openfoodfacts.org), ODbL licence',
    verified: false,
    is_custom: false,
  };
}

async function offFetch(config: Config, path: string): Promise<unknown> {
  const fetchImpl = config.foodFetch ?? fetch;
  const response = await fetchImpl(`${config.offBaseUrl}${path}`, {
    headers: { 'User-Agent': config.offUserAgent, Accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`Open Food Facts responded ${response.status}`);
  return response.json();
}

export async function barcodeLookup(config: Config, code: string): Promise<Food> {
  if (!config.enableOpenFoodFacts) throw new ApiError(503, 'BARCODE_UNAVAILABLE', 'Barcode lookup is disabled on this server.');
  if (!/^\d{8,14}$/.test(code)) throw new ApiError(400, 'INVALID_BARCODE', 'Enter a valid 8–14 digit barcode.');
  const cacheKey = `off-product:${code}`;
  const cached = cacheGet<Food>(cacheKey);
  if (cached) return cached;
  try {
    const payload = (await offFetch(config, `/api/v2/product/${encodeURIComponent(code)}.json`)) as {
      status?: number;
      product?: OffProduct;
    };
    if (!payload.product || payload.status === 0) {
      throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'That barcode is not in the Open Food Facts database yet.');
    }
    const food = mapOffProduct(payload.product);
    if (!food) throw new ApiError(422, 'PRODUCT_INCOMPLETE', 'This product has incomplete nutrition data on Open Food Facts.');
    cacheSet(cacheKey, food);
    return food;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'BARCODE_SERVICE_ERROR', 'Could not reach the barcode database. Please try again.');
  }
}

async function searchOff(config: Config, query: string): Promise<Food[]> {
  const cacheKey = `off-search:${query.toLowerCase()}`;
  const cached = cacheGet<Food[]>(cacheKey);
  if (cached) return cached;
  const fields = 'code,product_name,product_name_en,brands,quantity,serving_size,serving_quantity,nutriments,allergens_tags,categories_tags,labels_tags';
  const payload = (await offFetch(
    config,
    `/api/v2/search?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15&fields=${encodeURIComponent(fields)}`,
  )) as { products?: OffProduct[] };
  const foods = (payload.products ?? []).map(mapOffProduct).filter((food): food is Food => food !== null).slice(0, 12);
  cacheSet(cacheKey, foods);
  return foods;
}

async function searchUsda(config: Config, query: string): Promise<Food[]> {
  if (!config.usdaApiKey) return [];
  const cacheKey = `usda:${query.toLowerCase()}`;
  const cached = cacheGet<Food[]>(cacheKey);
  if (cached) return cached;
  const fetchImpl = config.foodFetch ?? fetch;
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=8&dataType=Foundation,SR%20Legacy&api_key=${encodeURIComponent(config.usdaApiKey)}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`USDA responded ${response.status}`);
  const payload = (await response.json()) as {
    foods?: Array<{
      fdcId: number;
      description: string;
      foodNutrients?: Array<{ nutrientId?: number; nutrientNumber?: string; value?: number; nutrientName?: string }>;
    }>;
  };
  const foods: Food[] = [];
  for (const item of payload.foods ?? []) {
    const nutrients = item.foodNutrients ?? [];
    const byId = (id: number) => num(nutrients.find((n) => n.nutrientId === id)?.value);
    const kcal = byId(1008);
    const protein = byId(1003);
    const carbs = byId(1005);
    const fat = byId(1004);
    const fiber = byId(1079);
    if (kcal === null || protein === null || carbs === null || fat === null) continue;
    foods.push({
      id: `ext:usda:${item.fdcId}`,
      name: item.description.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
      alt_names: [],
      locale: null,
      brand: null,
      category: 'reference',
      per_100g: { kcal, protein, carbs, fat, fiber: fiber ?? undefined },
      serving_sizes: [],
      tags: ['reference'],
      allergens: [],
      source: 'usda_fdc',
      source_id: String(item.fdcId),
      attribution: 'USDA FoodData Central',
      verified: true,
      is_custom: false,
    });
  }
  cacheSet(cacheKey, foods);
  return foods;
}

export async function searchExternalFoods(
  config: Config,
  query: string,
): Promise<{ foods: Food[]; error: string | null }> {
  const errors: string[] = [];
  const tasks: Array<Promise<Food[]>> = [];
  if (config.enableOpenFoodFacts) tasks.push(searchOff(config, query).catch((error) => {
    errors.push(`Open Food Facts: ${(error as Error).message}`);
    return [];
  }));
  if (config.usdaApiKey) tasks.push(searchUsda(config, query).catch((error) => {
    errors.push(`USDA: ${(error as Error).message}`);
    return [];
  }));
  if (tasks.length === 0) return { foods: [], error: null };
  const results = await Promise.all(tasks);
  const seen = new Set<string>();
  const foods: Food[] = [];
  for (const food of results.flat()) {
    const key = food.name.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    foods.push(food);
  }
  return { foods: foods.slice(0, 20), error: errors.length > 0 ? errors.join('; ') : null };
}

// --------------------------------------------------------------- text parsing

interface FoodRowLike {
  id: string;
  name: string;
}

function stripUnit(token: string): { quantity: number; unit: string | null; name: string } | null {
  const cleaned = token.trim().replace(/^[-•*]\s*/, '');
  if (!cleaned) return null;
  const match = /^([0-9]+(?:[.,][0-9]+)?)\s*(g|gram|grams|kg|ml|cups?|pieces?|slices?|bowls?|plates?|tbsp|tsp|handfuls?)?\s*(?:of\s+)?(.+)$/i.exec(
    cleaned,
  );
  if (!match || !match[3]) {
    return { quantity: 1, unit: null, name: cleaned };
  }
  const quantity = Number((match[1] ?? '1').replace(',', '.'));
  return { quantity: Number.isFinite(quantity) ? quantity : 1, unit: (match[2] ?? null)?.toLowerCase() ?? null, name: match[3].trim() };
}

const UNIT_ALIASES: Record<string, string> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  ml: 'ml',
  cup: 'cup',
  cups: 'cup',
  piece: 'piece',
  pieces: 'piece',
  slice: 'slice',
  slices: 'slice',
  bowl: 'bowl',
  bowls: 'bowl',
  plate: 'plate',
  plates: 'plate',
  handful: 'handful',
  handfuls: 'handful',
};

export function parseFoodText(db: Database, userId: string, text: string): TextParseResponse {
  const tokens = text
    .split(/[,;\n]|\s+and\s+/i)
    .map((token) => token.trim())
    .filter(Boolean);
  const items: TextParseResponse['items'] = [];
  const unmatched: string[] = [];

  for (const token of tokens) {
    const parsed = stripUnit(token);
    if (!parsed) continue;
    const candidates = searchLocalFoods(db, userId, parsed.name, 5);
    const exact = candidates.find((food) => {
      const names = [food.name, ...food.alt_names].map((name) => name.toLowerCase());
      return names.includes(parsed.name.toLowerCase());
    });
    const food = exact ?? candidates[0] ?? null;
    if (!food) {
      unmatched.push(parsed.name);
      continue;
    }
    const unit = parsed.unit ? UNIT_ALIASES[parsed.unit] ?? parsed.unit : null;
    let resolved = unit
      ? resolveGrams(parsed.quantity, unit, food.serving_sizes)
      : { grams: null, reason: 'no unit' };
    if (!unit) {
      const pieceServing = food.serving_sizes.find((serving) => serving.unit.toLowerCase() === 'piece');
      if (pieceServing) {
        resolved = resolveGrams(parsed.quantity, 'piece', food.serving_sizes);
      } else if (parsed.quantity >= 10) {
        resolved = { grams: parsed.quantity, approximate: false };
      }
    }
    const grams = resolved.grams;
    const nutrition = grams === null ? null : roundNutrition(scaleNutrition(food.per_100g, grams));
    items.push({
      name: food.name,
      quantity: parsed.quantity,
      unit: unit ?? (grams !== null && parsed.quantity >= 10 ? 'g' : 'serving'),
      grams,
      food,
      nutrition,
      confidence: exact ? 0.9 : 0.55,
      note: grams === null ? resolved.reason ?? 'Add a gram weight before saving.' : null,
    });
  }

  return { items, unmatched };
}

export function searchLocalWithCount(db: Database, userId: string, query: string, limit: number): Food[] {
  return searchLocalFoods(db, userId, query, limit);
}

export type { FoodRowLike };
