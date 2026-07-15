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

  // Ne pas attendre l'événement `load` complet : le dashboard démarre plusieurs
  // requêtes en arrière-plan et peut continuer à charger alors que la navigation
  // et la session sont déjà valides.
  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/, { timeout: 45_000 });
}