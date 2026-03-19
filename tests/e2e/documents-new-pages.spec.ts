import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { attachRuntimeErrorTracking } from './helpers/runtime';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('documents creation pages', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('new devis page loads and shows CRM/client fields', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard/devis/new', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard\/devis\/new/, { timeout: 30_000 });

    await expect(
      page.getByText(/devis|client|crm/i).first()
    ).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });

  test('new facture page loads and shows CRM/client fields', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard/factures/new', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard\/factures\/new/, { timeout: 30_000 });

    await expect(
      page.getByText(/facture|client|crm/i).first()
    ).toBeVisible({ timeout: 20_000 });

    await runtime.expectNoErrors();
  });
});