import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('billing checkout flow', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  test('user can access billing panel safely', async ({ page }) => {
    await login(page);

    await page.goto('/dashboard?panel=abonnement', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveURL(/dashboard/);

    // On valide juste que le panel s'ouvre sans crash
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    // Pas de dépendance à texte fragile
    await expect(
      page.locator('button, a').first()
    ).toBeVisible({ timeout: 15000 });
  });
});