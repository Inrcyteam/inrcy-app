import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('authenticated flows', () => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD must be set to run authenticated tests');

  test('user can sign in and reach dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('Email').fill(email!);
    await page.getByPlaceholder('Mot de passe').fill(password!);
    await page.getByRole('button', { name: /se connecter/i }).click();

    // After login, app should land on dashboard.
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // Robust assertion: accept a couple of known texts.
    await expect(
      page.getByText(/Votre cockpit iNrCy|Le Générateur est lancé|Générateur/i).first()
    ).toBeVisible({ timeout: 30_000 });
  });
});
