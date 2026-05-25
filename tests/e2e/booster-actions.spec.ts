import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('booster actions', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  test('booster publish modal has actionable UI elements', async ({ page }) => {
    await login(page);

    // /dashboard/booster redirects intentionally to the dashboard modal layer.
    await page.goto('/dashboard?action=publish', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveURL(/\/dashboard(?:\?.*action=publish)?/);
    await expect(page.getByText(/Publier|Module Booster/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Phrase libre|Votre intention/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('button, a, textarea').first()).toBeVisible({ timeout: 15_000 });
  });
});
