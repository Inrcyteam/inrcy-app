import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('stripe checkout flow (simulated)', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  test('checkout endpoint is reachable without crashing server', async ({ page }) => {
    await login(page);

    const result = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ plan: 'Starter' }),
        });

        const text = await res.text();

        return {
          status: res.status,
          ok: res.ok,
          text,
        };
      } catch (e) {
        return {
          status: 0,
          ok: false,
          text: String(e),
        };
      }
    });

    // 200 = checkout créé
    // 400 = plan invalide / payload invalide
    // 403 = essai terminé
    // 409 = déjà abonné
    // 503 = Stripe non configuré dans cet environnement
    expect([200, 400, 403, 409, 503]).toContain(result.status);
  });
});