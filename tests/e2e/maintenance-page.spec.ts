import { test, expect } from '@playwright/test';

test.describe('maintenance page', () => {
  test('maintenance page is reachable and does not hard crash', async ({ page }) => {
    await page.goto('/maintenance', { waitUntil: 'domcontentloaded' });

    // Selon l'état maintenance, tu peux être soit sur /maintenance soit redirigé vers /dashboard
    await expect(page).toHaveURL(/\/maintenance|\/dashboard|\/login/, { timeout: 30_000 });

    // Si la page maintenance est active, on valide son contenu.
    if (page.url().includes('/maintenance')) {
      await expect(
        page.getByText(/Maintenance en cours|Intervention technique en cours|Plateforme temporairement indisponible/i).first()
      ).toBeVisible({ timeout: 15_000 });
    }
  });
});