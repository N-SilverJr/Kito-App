import { expect, test } from '@playwright/test';
import { createAccount, newUser } from './helpers';

/**
 * Exercises the real browser → API → provider → review → save path.
 *
 * Requires a server whose AI_PROVIDER is configured. Point it at the local test double:
 *   node scripts/ai-stub.mjs
 *   AI_PROVIDER=openai OPENAI_API_KEY=stub OPENAI_BASE_URL=http://localhost:8899/v1 \
 *   OPENAI_MODEL=stub-vision npm run dev
 * and set E2E_AI_ENABLED=1 when running Playwright.
 */
test.describe('photo analysis', () => {
  test.skip(!process.env.E2E_AI_ENABLED, 'Set E2E_AI_ENABLED=1 with a configured AI provider');

  test('a photo becomes an editable, multi-component meal that updates the day', async ({ page }) => {
    const user = newUser('scan');
    await createAccount(page, user);

    await page.goto('/app/scan');
    await expect(page.getByText('Meal photo')).toBeVisible();

    // Draw a photo in the page so the test needs no binary fixture on disk.
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#f4efe6';
      context.fillRect(0, 0, 640, 480);
      context.fillStyle = '#e8e2d2';
      context.beginPath();
      context.arc(320, 240, 180, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#3f6b4a';
      context.fillRect(200, 200, 140, 90);
      context.fillStyle = '#f6f1e2';
      context.fillRect(340, 180, 140, 120);
      for (let index = 0; index < 400; index += 1) {
        context.fillStyle = `rgba(${180 + (index % 60)}, ${140 + (index % 40)}, 90, 0.35)`;
        context.fillRect(180 + ((index * 37) % 300), 160 + ((index * 53) % 200), 6, 6);
      }
      return canvas.toDataURL('image/jpeg', 0.9);
    });

    await page.setInputFiles('#meal-photo-input', {
      name: 'meal.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64'),
    });
    await expect(page.getByRole('button', { name: 'Analyse this photo' })).toBeVisible();
    await page.getByRole('button', { name: 'Analyse this photo' }).click();

    // The review screen must expose every component separately, with confidence and portion caveats.
    await expect(page.getByRole('button', { name: 'Save reviewed meal' })).toBeVisible({ timeout: 20_000 });
    const reviewedNames = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main input')).map((input) => (input as HTMLInputElement).value),
    );
    expect(reviewedNames).toContain('Isombe (cassava leaf stew)');
    expect(reviewedNames).toContain('Ubugari (stiff maize meal)');
    await expect(page.getByText(/\d+% ID/).first()).toBeVisible();
    await expect(page.getByText(/estimate, not a laboratory measurement/i)).toBeVisible();

    // Edit a portion before saving — the user stays in control of the numbers.
    const grams = page.locator('input[id^="scan-grams-"]').first();
    await expect(grams).toHaveValue('200');
    await grams.fill('100');
    await page.getByRole('button', { name: 'Save reviewed meal' }).click();

    await expect(page).toHaveURL(/\/app\?/);
    const meals = await page.request.get('/api/meals');
    const body = (await meals.json()) as {
      meals: Array<{ source: string; items: Array<{ name: string; grams: number }> }>;
    };
    const scanned = body.meals.find((meal) => meal.source === 'ai');
    expect(scanned, 'photo meal should be stored with source=ai').toBeTruthy();
    expect(scanned!.items).toHaveLength(2);
    expect(scanned!.items[0]!.grams).toBeCloseTo(100, 0);
  });

});

// This one runs in the normal suite: the default configuration has no provider key.
test.describe('photo analysis without a provider', () => {
  test('the scan screen explains the missing configuration instead of failing silently', async ({ page }) => {
    const user = newUser('scan-off');
    await createAccount(page, user);

    const status = await page.request.get('/api/ai/status');
    const body = (await status.json()) as { configured: boolean };
    test.skip(body.configured, 'a provider is configured in this environment');

    await page.goto('/app/scan');
    await expect(page.getByText(/Photo analysis isn’t configured/)).toBeVisible();
    await expect(page.getByText('AI_PROVIDER=openai')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log manually instead' })).toBeVisible();
  });
});
