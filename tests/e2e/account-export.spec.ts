import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { apiGET } from './helpers/api';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('account export', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('account export returns a JSON payload', async ({ page }) => {
    await login(page);

    const res = await apiGET(page, '/api/account/export');

    expect([200].includes(res.status), `HTTP ${res.status}\n${res.text}`).toBeTruthy();
    expect(res.contentType || '').toContain('application/json');

    expect(res.json).toBeTruthy();
    expect(res.json).toHaveProperty('exported_at');
    expect(res.json).toHaveProperty('data');
    expect(Array.isArray(res.json.data)).toBeTruthy();
  });
});