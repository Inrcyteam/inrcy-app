import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { attachRuntimeErrorTracking } from './helpers/runtime';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('authenticated flows', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('user can sign in and reach dashboard', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);

    await expect(page).toHaveURL(/\/dashboard/);

    await expect(
      page.getByText(/Votre cockpit iNrCy|Le Générateur est lancé|Générateur/i).first()
    ).toBeVisible({ timeout: 30_000 });

    await runtime.expectNoErrors();
  });

  test('session survives refresh on dashboard', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);

    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await expect(
      page.getByText(/Votre cockpit iNrCy|Le Générateur est lancé|Générateur/i).first()
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(/CRM/i).first()).toBeVisible({ timeout: 15_000 });

    await runtime.expectNoErrors();
  });

  test('main dashboard modules render', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);

    await expect(page.getByText(/CRM/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/STATS/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/AGENDA/i).first()).toBeVisible({ timeout: 15_000 });

    await runtime.expectNoErrors();
  });
});