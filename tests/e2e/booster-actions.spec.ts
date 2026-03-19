import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('booster actions', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  test('booster page has actionable UI elements', async ({ page }) => {
    await login(page);

    await page.goto('/dashboard/booster', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveURL(/booster/);

    await expect(
      page.locator('button, a').first()
    ).toBeVisible({ timeout: 15000 });
  });
});