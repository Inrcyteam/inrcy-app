import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { attachRuntimeErrorTracking } from './helpers/runtime';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('billing/account panel', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('billing panel loads from dashboard query param', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);

    await page.goto('/dashboard?panel=abonnement', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/panel=abonnement/, { timeout: 30_000 });

    await expect(
      page.getByText(/abonnement|billing|plan|facturation/i).first()
    ).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });
});