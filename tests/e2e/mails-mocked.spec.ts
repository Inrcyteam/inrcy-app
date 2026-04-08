import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

const providerRoutes = [
  { provider: 'gmail', endpoint: '/api/inbox/gmail/send' },
  { provider: 'imap', endpoint: '/api/inbox/imap/send' },
  { provider: 'microsoft', endpoint: '/api/inbox/microsoft/send' },
] as const;

test.describe('mail send endpoints (safe contract)', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  for (const route of providerRoutes) {
    test(`${route.provider} send endpoint rejects incomplete payload without sending`, async ({ page }) => {
      await login(page);

      const result = await page.evaluate(
        async ({ endpoint }) => {
          const res = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify({
              subject: 'E2E safe contract test',
              text: 'No recipient and no account on purpose',
            }),
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
        },
        { endpoint: route.endpoint }
      );

      // Contrat minimum attendu : l’API rejette le payload avant tout envoi externe.
      expect(result.status, `Unexpected HTTP ${result.status} for ${route.endpoint}
${result.text}`).toBe(400);

      const payload = result.json as { error?: string } | null;
      expect(typeof payload?.error).toBe('string');
      expect((payload?.error || '').length).toBeGreaterThan(0);
    });
  }
});
