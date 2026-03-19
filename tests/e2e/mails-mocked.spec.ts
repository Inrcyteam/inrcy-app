import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { apiGET } from './helpers/api';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

type MailAccount = {
  id: string;
  provider: 'gmail' | 'imap' | 'microsoft' | string;
};

test.describe('mail send endpoints (safe contract)', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  test('configured mail provider endpoint rejects incomplete payload without sending', async ({ page }) => {
    await login(page);

    const statusRes = await apiGET(page, '/api/integrations/status');
    expect(statusRes.ok, `HTTP ${statusRes.status}\n${statusRes.text}`).toBeTruthy();

    const statusData = statusRes.json as { mailAccounts?: MailAccount[] } | null;
    const accounts = statusData?.mailAccounts ?? [];

    test.skip(!accounts.length, 'Aucun compte mail connecté pour tester les endpoints inbox/send');

    const account = accounts[0];
    const routeByProvider: Record<string, string> = {
      gmail: '/api/inbox/gmail/send',
      imap: '/api/inbox/imap/send',
      microsoft: '/api/inbox/microsoft/send',
    };

    const route = routeByProvider[account.provider];
    test.skip(!route, `Provider non supporté par ce test: ${account.provider}`);

    const result = await page.evaluate(
      async ({ endpoint, accountId }) => {
        const res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            accountId,
            subject: 'E2E safe contract test',
            text: 'No recipient on purpose',
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
      { endpoint: route, accountId: account.id }
    );

    // On veut un 400 contrôlé, pas un vrai envoi.
    expect(result.status).toBe(400);

    const payload = result.json as { error?: string } | null;
    expect(typeof payload?.error).toBe('string');
  });
});