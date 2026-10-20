import { expect, type Page } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  displayName: string;
}

const PASSWORD = 'correct horse battery';

export function newUser(label: string): TestUser {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    email: `${label}-${stamp}@example.test`,
    password: PASSWORD,
    displayName: 'Aline',
  };
}

const ONBOARDING_BODY = {
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
} as const;

/** Create a fully onboarded account through the real HTTP API on the browser's cookie jar. */
export async function createAccount(page: Page, user: TestUser): Promise<void> {
  const registered = await page.request.post('/api/auth/register', {
    data: { email: user.email, password: user.password, display_name: user.displayName },
  });
  expect(registered.ok(), `register failed: ${registered.status()} ${await registered.text()}`).toBeTruthy();

  const onboarded = await page.request.post('/api/me/onboarding', {
    data: { ...ONBOARDING_BODY, display_name: user.displayName },
  });
  expect(onboarded.ok(), `onboarding failed: ${onboarded.status()} ${await onboarded.text()}`).toBeTruthy();
}

/** Sign an existing account in through the login form. */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.fill('#login-email', user.email);
  await page.fill('#login-password', user.password);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await expect(page).toHaveURL(/\/app(\?|$)/);
}

export async function signOut(page: Page): Promise<void> {
  // Sign-out lives in Settings so it cannot float over content on small screens.
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/(welcome|login)?$/);
}

/** Add the first food from the catalog to today's lunch and save it. */
export async function logLunch(page: Page, foodName: RegExp | string): Promise<void> {
  await page.goto('/app/log');
  await page.getByRole('button', { name: foodName }).first().click();
  await page.getByRole('button', { name: 'Add to meal' }).click();
  await page.getByRole('button', { name: /^Save (Lunch|Breakfast|Dinner|Snack)/ }).click();
  await expect(page).toHaveURL(/\/app\?/);
}

export function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
  });
}
