import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { attachRuntimeErrorTracking } from './helpers/runtime';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('booster and fideliser pages', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('booster page loads', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard/booster', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard\/booster/, { timeout: 30_000 });
    await expect(page.getByText(/Booster|Aide Booster|Module Booster/i).first()).toBeVisible({
      timeout: 20_000,
    });

    await runtime.expectNoErrors();
  });

  test('fideliser page loads', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard/fideliser', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard\/fideliser/, { timeout: 30_000 });
    await expect(page.getByText(/Fidéliser|Informer|newsletter/i).first()).toBeVisible({
      timeout: 20_000,
    });

    await runtime.expectNoErrors();
  });

  test('stats page loads', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard/stats', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard\/stats/, { timeout: 30_000 });

    // On valide la page stats avec des signaux plus robustes que le simple texte "Stats"
    await expect(
      page.locator('main').getByText(/graphique|canaux|période|générateur|leads|ca/i).first()
    ).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });
});