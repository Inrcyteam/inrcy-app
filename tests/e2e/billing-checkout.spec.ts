import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('billing checkout flow', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  test('user can access billing page', async ({ page }) => {
    await login(page);

    await page.goto('/dashboard?panel=billing', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveURL(/billing/);

    await expect(
      page.getByText(/abonnement|paiement|facturation/i).first()
    ).toBeVisible({ timeout: 15000 });
  });
});