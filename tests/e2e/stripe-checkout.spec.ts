import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('stripe checkout flow (simulated)', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  test('user can open subscription panel and checkout endpoint responds', async ({ page }) => {
    await login(page);

    await page.goto('/dashboard?panel=abonnement', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveURL(/panel=abonnement/);

    await expect(
      page.getByText(/abonnement|paiement|facturation|plan/i).first()
    ).toBeVisible({ timeout: 15000 });

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ plan: 'Starter' }),
      });

      const text = await res.text();
      let json: unknown = null;

      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      return {
        ok: res.ok,
        status: res.status,
        text,
        json,
      };
    });

    // 200 = URL de checkout créée
    // 403 = essai terminé / checkout indisponible
    // 409 = abonnement déjà actif
    expect([200, 403, 409]).toContain(result.status);

    if (result.status === 200) {
      const payload = result.json as { url?: string } | null;
      expect(typeof payload?.url).toBe('string');
    }
  });
});