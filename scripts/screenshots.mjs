/**
 * Capture documentation screenshots from a running dev server.
 *
 *   npm run dev            # in another terminal
 *   node scripts/screenshots.mjs
 *
 * Creates a throwaway account with realistic data and writes PNGs into screenshots/.
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { seedDemoAccount } from './demo-account.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('../screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

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

await seedDemoAccount(page);

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
