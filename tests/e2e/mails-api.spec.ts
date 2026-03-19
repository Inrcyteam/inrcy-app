import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { apiGET } from './helpers/api';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('mail integrations api', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD requis');

  test('mail integrations status responds correctly', async ({ page }) => {
    await login(page);

    const res = await apiGET(page, '/api/integrations/status');

    expect(res.ok, `HTTP ${res.status}\n${res.text}`).toBeTruthy();
    expect(res.contentType).toContain('application/json');

    const data = res.json as
      | {
          mailAccounts?: unknown[];
          limits?: { maxMailAccounts?: number };
        }
      | null;

    expect(data).toBeTruthy();
    expect(Array.isArray(data?.mailAccounts)).toBeTruthy();
    expect(typeof data?.limits?.maxMailAccounts).toBe('number');
  });
});