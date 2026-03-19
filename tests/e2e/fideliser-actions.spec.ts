import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('fideliser actions', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  test('fideliser page loads campaign UI', async ({ page }) => {
    await login(page);

    await page.goto('/dashboard/fideliser', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveURL(/fideliser/);

    await expect(
      page.getByText(/email|campagne|newsletter/i).first()
    ).toBeVisible({ timeout: 15000 });
  });
});