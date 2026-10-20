import { expect, test } from '@playwright/test';
import { createAccount, logLunch, newUser, noHorizontalOverflow, signIn, signOut } from './helpers';

test.describe('account and onboarding', () => {
  test('a new visitor registers through the form, completes onboarding and sees real targets', async ({ page }) => {
    const user = newUser('register');

    await page.goto('/welcome');
    await page.getByRole('link', { name: /create|start|sign up|get started/i }).first().click();
    await expect(page).toHaveURL(/\/register/);

    await page.fill('#register-name', user.displayName);
    await page.fill('#register-email', user.email);
    await page.fill('#register-password', user.password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole('heading', { name: 'First, the basics' })).toBeVisible();

    await page.getByRole('button', { name: 'Metric (kg, cm)' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Your body, your numbers' })).toBeVisible();

    await expect(page.getByRole('button', { name: /Light activity/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Height (cm)').fill('168');
    await page.getByLabel('Current weight (kg)').fill('64');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Your starting estimate')).toBeVisible();
    const kcalText = await page.getByText('daily energy target').locator('..').innerText();
    expect(kcalText).toMatch(/\d{3,4}/);
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Companion name').fill('Kito');
    await page.getByRole('button', { name: 'Start using NutriPals' }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText(`Good `)).toBeVisible();
    await expect(page.getByText(/eaten of a [\d,]+ kcal estimate/)).toBeVisible();
  });

  test('signing out and back in keeps the saved data', async ({ page }) => {
    const user = newUser('session');
    await createAccount(page, user);
    await page.goto('/app');
    await logLunch(page, /^Isombe/);
    await expect(page.getByText(/Isombe \(cassava leaf stew\)/).first()).toBeVisible();

    await signOut(page);
    await signIn(page, user);

    await expect(page).toHaveURL(/\/app(\?|$)/);
    await expect(page.getByText(/Isombe \(cassava leaf stew\)/).first()).toBeVisible();
  });
});

test.describe('daily nutrition tracking', () => {
  test('a manual meal updates today’s totals, persists after reload and can be edited', async ({ page }) => {
    const user = newUser('meal');
    await createAccount(page, user);
    await page.goto('/app');

    await expect(page.getByText('0 eaten of a', { exact: false })).toBeVisible();
    await logLunch(page, /^Isombe/);

    await expect(page.getByText(/240 eaten of a/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/240 eaten of a/)).toBeVisible();

    // Edit the portion down to 100 g and confirm the totals follow.
    await page.getByRole('link', { name: /Isombe \(cassava leaf stew\)/ }).click();
    await expect(page).toHaveURL(/\/app\/meal\//);
    await page.getByLabel('Grams of Isombe (cassava leaf stew)').fill('100');
    await page.getByRole('button', { name: /Save changes|Save meal/i }).click();
    await page.goto('/app');
    await expect(page.getByText(/120 eaten of a/)).toBeVisible();
  });

  test('a failed save keeps the tray, reports the error and does not duplicate the meal', async ({ page }) => {
    const user = newUser('offline');
    await createAccount(page, user);

    await page.goto('/app/log');
    await page.getByRole('button', { name: /^Banana/ }).first().click();
    await page.getByRole('button', { name: 'Add to meal' }).click();

    await page.route('**/api/meals', (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
    );
    await page.getByRole('button', { name: /^Save Lunch/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(/server|connection|reach|try again/i);

    await page.unroute('**/api/meals');
    await page.getByRole('button', { name: /^Save Lunch/ }).click();
    await expect(page).toHaveURL(/\/app\?/);

    const meals = await page.request.get('/api/meals');
    const body = (await meals.json()) as { meals: Array<{ items: Array<{ name: string }> }> };
    const bananaMeals = body.meals.filter((meal) => meal.items.some((item) => item.name.startsWith('Banana')));
    expect(bananaMeals).toHaveLength(1);
  });
});

test.describe('habits', () => {
  test('water and weight entries are stored and derived from what the user recorded', async ({ page }) => {
    const user = newUser('habits');
    await createAccount(page, user);
    await page.goto('/app');

    await page.getByRole('button', { name: '+250 ml' }).click();
    await expect(page.getByText('250 ml', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: '+250 ml' }).click();

    await page.goto('/app/water');
    await expect(page.getByText(/500/).first()).toBeVisible();
    const entries = await page.request.get('/api/hydration');
    expect(((await entries.json()) as { total_ml: number }).total_ml).toBeGreaterThanOrEqual(500);

    await page.goto('/app/weight');
    await page.fill('#weight-add', '58.6');
    await page.fill('#weight-note', 'Morning');
    await page.getByRole('button', { name: 'Save check-in' }).click();
    await expect(page.getByText('58.6 kg').first()).toBeVisible();
    await page.reload();
    await expect(page.getByText('58.6 kg').first()).toBeVisible();
  });

  test('the fasting timer is computed from the stored start time, not a live-only counter', async ({ page }) => {
    const user = newUser('fasting');
    await createAccount(page, user);
    await page.goto('/app/fasting');

    await page.getByRole('button', { name: /^Start 16h fast/ }).click();
    await expect(page.getByText(/FASTING FOR/i)).toBeVisible();
    await expect(page.getByText(/16:8 plan/)).toBeVisible();
    const startedAt = await page.request.get('/api/fasting');
    const active = (await startedAt.json()) as { active: { started_at: string } | null };
    expect(active.active?.started_at).toBeTruthy();

    await page.reload();
    await expect(page.getByText(/FASTING FOR/i)).toBeVisible();
    await expect(page.getByText(/Started/)).toBeVisible();

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel fast' }).click();
    await expect(page.getByRole('button', { name: /^Start 16h fast/ })).toBeVisible();
  });

  test('the companion reacts to a real meal with XP and an achievement', async ({ page }) => {
    const user = newUser('companion');
    await createAccount(page, user);
    await logLunch(page, /^Chapati/);

    await page.goto('/app/companion');
    await expect(page.getByText(/XP total/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Wardrobe/i })).toBeVisible();
    await expect(page.getByText(/acorn cap/i).first()).toBeVisible();

    const state = await page.request.get('/api/companion');
    const body = (await state.json()) as {
      companion: { xp: number; earned_achievements: string[] };
      achievements: Array<{ id: string; earned: boolean }>;
    };
    expect(body.companion.xp).toBeGreaterThan(0);
    expect(body.achievements.some((achievement) => achievement.earned)).toBe(true);
  });
});

test.describe('privacy', () => {
  test('one account cannot read another account’s records', async ({ page, browser }) => {
    const alice = newUser('alice');
    await createAccount(page, alice);
    await page.goto('/app');
    await logLunch(page, /^Isombe/);
    const list = await page.request.get('/api/meals');
    const aliceMeal = ((await list.json()) as { meals: Array<{ id: string }> }).meals[0]!;

    const second = await browser.newContext();
    const otherPage = await second.newPage();
    await createAccount(otherPage, newUser('bob'));

    const foreign = await otherPage.request.get(`/api/meals/${aliceMeal.id}`);
    expect(foreign.status()).toBe(404);
    const exportBody = (await (await otherPage.request.get('/api/me/export')).json()) as {
      meals?: unknown[];
    };
    expect(exportBody.meals?.length ?? 0).toBe(0);
    await second.close();
  });
});

test.describe('responsive layout', () => {
  for (const viewport of [
    { width: 375, height: 812, name: 'phone' },
    { width: 820, height: 1180, name: 'tablet' },
    { width: 1440, height: 900, name: 'desktop' },
  ]) {
    test(`no horizontal overflow on ${viewport.name}`, async ({ page }) => {
      const user = newUser(`layout-${viewport.name}`);
      await createAccount(page, user);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const path of ['/app', '/app/log', '/app/water', '/app/weight', '/app/fasting', '/app/stats', '/app/companion', '/app/plans', '/app/settings']) {
        await page.goto(path);
        await expect(page.locator('h1, h2').first()).toBeVisible();
        expect(await noHorizontalOverflow(page), `${path} overflows at ${viewport.width}px`).toBe(true);
      }
    });
  }
});
