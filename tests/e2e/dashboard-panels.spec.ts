import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { attachRuntimeErrorTracking } from './helpers/runtime';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('dashboard panels', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('notifications panel opens from query param', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard?panel=notifications', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/panel=notifications/, { timeout: 30_000 });
    await expect(
      page.getByText(/Notifications iNrCy|Notifications/i).first()
    ).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });

  test('rgpd panel opens from query param', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard?panel=rgpd', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/panel=rgpd/, { timeout: 30_000 });
    await expect(
      page.getByText(/Télécharger mes données|Export/i).first()
    ).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });

  test('mails settings panel opens from query param', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard?panel=mails', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/panel=mails/, { timeout: 30_000 });
    await expect(
      page.getByText(/Réglages iNr.?Send|Contacts CRM|Mails/i).first()
    ).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });
});