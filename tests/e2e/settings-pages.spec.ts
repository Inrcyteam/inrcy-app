import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { attachRuntimeErrorTracking } from './helpers/runtime';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('settings pages', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('profil page loads', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard/settings/profil', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard\/settings\/profil/, { timeout: 30_000 });
    await expect(page.getByText(/Mon profil/i).first()).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });

  test('contact page loads', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard/settings/contact', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard\/settings\/contact/, { timeout: 30_000 });
    await expect(page.getByText(/Nous contacter/i).first()).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });

  test('activite page loads', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard/settings/activite', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard\/settings\/activite/, { timeout: 30_000 });
    await expect(page.getByText(/Mon activité/i).first()).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });

  test('abonnement settings page loads', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard/settings/abonnement', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard\/settings\/abonnement/, { timeout: 30_000 });
    await expect(page.getByText(/Mon abonnement/i).first()).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });
});