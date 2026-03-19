import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { attachRuntimeErrorTracking } from './helpers/runtime';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('devis creation flow', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  test('user can open devis creation page and see key fields', async ({ page }) => {
    const runtime = attachRuntimeErrorTracking(page);

    await login(page);
    await page.goto('/dashboard/devis/new', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/dashboard\/devis\/new/);

    await expect(
      page.getByText(/client|nom|email|telephone/i).first()
    ).toBeVisible({ timeout: 15000 });

    await runtime.expectNoErrors();
  });
});