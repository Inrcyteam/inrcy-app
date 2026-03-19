import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { apiGET } from './helpers/api';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('generator kpis api', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('generator kpis returns authenticated payload', async ({ page }) => {
    await login(page);

    const res = await apiGET(page, '/api/generator/kpis?monthDays=30&weekDays=7&todayDays=2');

    expect([200].includes(res.status), `HTTP ${res.status}\n${res.text}`).toBeTruthy();
    expect(res.contentType || '').toContain('application/json');
    expect(res.json).toBeTruthy();

    // On reste volontairement souple sur la structure interne,
    // mais on valide qu'on n'a ni HTML ni redirection cassée.
    expect(typeof res.json).toBe('object');
    expect(Array.isArray(res.json)).toBeFalsy();
  });
});