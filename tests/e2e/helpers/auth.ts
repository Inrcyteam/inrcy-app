import { expect, Page } from '@playwright/test';

export async function login(page: Page) {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error('E2E_EMAIL et E2E_PASSWORD sont requis');
  }

  await page.goto('/login');

  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/mot de passe|password/i).fill(password);
  await page.getByRole('button', { name: /se connecter|login|connexion/i }).click();

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  await expect(page).toHaveURL(/\/dashboard/);
}