/**
 * Creates a throwaway account filled with realistic data. Used by the documentation and
 * store-asset scripts. Everything goes through the real HTTP API, so the screenshots show data
 * that the product actually stores.
 */

const ONBOARDING = {
  birth_year: 1995,
  height_cm: 165,
  weight_kg: 60,
  sex: 'unspecified',
  activity_level: 'light',
  goal: 'maintain',
  unit_system: 'metric',
  timezone: 'Africa/Kigali',
  calorie_tracking_enabled: true,
  show_weight: true,
  fasting_enabled: true,
  weight_target_kg: 56,
  water_target_ml: 2000,
  dietary_preferences: [],
  allergies: [],
  companion_name: 'Kito',
  time_format: '24h',
};

async function post(page, url, data, label) {
  const response = await page.request.post(url, { data });
  if (!response.ok()) {
    throw new Error(`${label ?? url} failed: ${response.status()} ${await response.text()}`);
  }
  return response;
}

export async function seedDemoAccount(page, options = {}) {
  const email = options.email ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;
  const password = options.password ?? 'correct horse battery';
  const now = new Date();

  await post(page, '/api/auth/register', { email, password, display_name: options.displayName ?? 'Aline' }, 'register');
  await post(
    page,
    '/api/me/onboarding',
    { ...ONBOARDING, display_name: options.displayName ?? 'Aline' },
    'onboarding',
  );

  await post(
    page,
    '/api/meals',
    {
      meal_type: 'breakfast',
      eaten_at: new Date(now.getTime() - 6 * 3600 * 1000).toISOString(),
      source: 'manual',
      items: [
        {
          name: 'Ikivuguto (fermented milk)',
          quantity: 250,
          unit: 'ml',
          grams: 250,
          nutrition: { kcal: 61, protein_g: 3.3, carbs_g: 4.7, fat_g: 3.3 },
          source: 'catalog',
        },
        {
          name: 'Chapati',
          quantity: 1,
          unit: 'piece',
          grams: 80,
          nutrition: { kcal: 330, protein_g: 8, carbs_g: 45, fat_g: 13 },
          source: 'catalog',
        },
      ],
    },
    'breakfast',
  );

  await post(
    page,
    '/api/meals',
    {
      meal_type: 'lunch',
      eaten_at: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
      source: 'manual',
      items: [
        {
          name: 'Isombe (cassava leaf stew)',
          quantity: 200,
          unit: 'g',
          grams: 200,
          nutrition: { kcal: 120, protein_g: 3.5, carbs_g: 12, fat_g: 6.5 },
          source: 'catalog',
        },
        {
          name: 'Ubugari (stiff maize meal)',
          quantity: 250,
          unit: 'g',
          grams: 250,
          nutrition: { kcal: 143, protein_g: 2.4, carbs_g: 32, fat_g: 0.4 },
          source: 'catalog',
        },
      ],
    },
    'lunch',
  );

  await post(page, '/api/hydration', { amount_ml: 500, logged_at: now.toISOString() }, 'water');
  await post(
    page,
    '/api/weight',
    { weight_kg: 59.4, logged_at: now.toISOString(), note: 'Morning, before breakfast' },
    'weight',
  );

  await post(
    page,
    '/api/plans',
    {
      days: 7,
      meals_per_day: ['breakfast', 'lunch', 'dinner'],
      budget: 'medium',
      max_minutes: 45,
      servings: 2,
      include_local: true,
      dietary_preference: 'none',
      allergies: [],
      pantry: [],
    },
    'plan',
  );

  return { email, password };
}
