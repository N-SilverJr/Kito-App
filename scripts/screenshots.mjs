/**
 * Capture documentation screenshots from a running dev server.
 *
 *   npm run dev            # in another terminal
 *   node scripts/screenshots.mjs
 *
 * Creates a throwaway account, logs a little data so the screens are not empty,
 * and writes PNGs into screenshots/.
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('../screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const email = `shots-${Date.now()}@example.test`;
const password = 'correct horse battery';

const shots = [
  { name: 'dashboard-desktop', path: '/app', width: 1280, height: 900 },
  { name: 'dashboard-phone', path: '/app', width: 390, height: 844 },
  { name: 'dashboard-dark', path: '/app', width: 1280, height: 900, dark: true },
  { name: 'log-food', path: '/app/log', width: 1280, height: 900 },
  { name: 'insights', path: '/app/stats', width: 1280, height: 900 },
  { name: 'companion', path: '/app/companion', width: 1280, height: 900 },
  { name: 'meal-plan', path: '/app/plans', width: 1280, height: 900 },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const register = await page.request.post('/api/auth/register', {
  data: { email, password, display_name: 'Aline' },
});
if (!register.ok()) throw new Error(`register failed: ${register.status()} ${await register.text()}`);

const onboard = await page.request.post('/api/me/onboarding', {
  data: {
    display_name: 'Aline',
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
  },
});
if (!onboard.ok()) throw new Error(`onboarding failed: ${onboard.status()} ${await onboard.text()}`);

// A little real data so the screens show something honest.
const now = new Date();
const eatenAt = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
await page.request.post('/api/meals', {
  data: {
    meal_type: 'lunch',
    eaten_at: eatenAt,
    source: 'manual',
    items: [
      { name: 'Isombe (cassava leaf stew)', quantity: 200, unit: 'g', grams: 200, nutrition: { kcal: 120, protein_g: 3.5, carbs_g: 12, fat_g: 6.5 }, source: 'catalog' },
      { name: 'Ubugari (stiff maize meal)', quantity: 250, unit: 'g', grams: 250, nutrition: { kcal: 143, protein_g: 2.4, carbs_g: 32, fat_g: 0.4 }, source: 'catalog' },
    ],
  },
});
await page.request.post('/api/hydration', { data: { amount_ml: 500, logged_at: now.toISOString() } });
await page.request.post('/api/meals', {
  data: {
    meal_type: 'breakfast',
    eaten_at: new Date(now.getTime() - 6 * 3600 * 1000).toISOString(),
    source: 'manual',
    items: [
      { name: 'Ikivuguto (fermented milk)', quantity: 250, unit: 'ml', grams: 250, nutrition: { kcal: 61, protein_g: 3.3, carbs_g: 4.7, fat_g: 3.3 }, source: 'catalog' },
      { name: 'Chapati', quantity: 1, unit: 'piece', grams: 80, nutrition: { kcal: 330, protein_g: 8, carbs_g: 45, fat_g: 13 }, source: 'catalog' },
    ],
  },
});
const weight = await page.request.post('/api/weight', {
  data: { weight_kg: 59.4, logged_at: now.toISOString(), note: 'Morning, before breakfast' },
});
if (!weight.ok()) throw new Error(`weight failed: ${weight.status()} ${await weight.text()}`);
await page.request.post('/api/plans', {
  data: { days: 7, meals_per_day: ['breakfast', 'lunch', 'dinner'], budget: 'medium', max_minutes: 45, servings: 2, include_local: true, dietary_preference: 'none', allergies: [], pantry: [] },
});

for (const shot of shots) {
  await page.setViewportSize({ width: shot.width, height: shot.height });
  if (shot.dark) await page.emulateMedia({ colorScheme: 'dark' });
  else await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${shot.name}.png`, fullPage: false });
  console.log(`wrote screenshots/${shot.name}.png`);
}

await browser.close();
