import { test, expect } from '@playwright/test';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
import { login } from './helpers/auth';
import { asObject } from './helpers/api';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const allowWrites = process.env.E2E_ALLOW_WRITES === 'true';

test.describe('crm contacts write api', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');
  test.skip(!allowWrites, 'E2E_ALLOW_WRITES=true requis pour les tests en écriture');

  test('create then delete a CRM contact', async ({ page }) => {
    await login(page);

    const unique = `e2e-${Date.now()}@example.com`;

    const created = await page.evaluate(async ({ email }) => {
      const res = await fetch('/api/crm/contacts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          last_name: 'E2E Test',
          first_name: 'Playwright',
          email,
          contact_type: 'prospect',
          category: 'professionnel',
          notes: 'Créé automatiquement par test E2E',
          important: false,
        }),
      });

      const text = await res.text();
      let json: JsonValue = null;
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
    }, { email: unique });

    expect(created.ok, `POST failed: HTTP ${created.status}\n${created.text}`).toBeTruthy();
    const createdJson = asObject(created.json);
    expect(createdJson.ok).toBeTruthy();
    expect(typeof createdJson.id).toBe('string');

    const contactId = createdJson.id as string;

    const removed = await page.evaluate(async ({ id }) => {
      const res = await fetch(`/api/crm/contacts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          accept: 'application/json',
        },
      });

      const text = await res.text();
      let json: JsonValue = null;
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
    }, { id: contactId });

    expect(removed.ok, `DELETE failed: HTTP ${removed.status}\n${removed.text}`).toBeTruthy();
    const removedJson = asObject(removed.json);
    expect(removedJson.ok).toBeTruthy();
  });
});