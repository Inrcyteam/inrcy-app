import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { apiGET } from './helpers/api';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('fideliser api', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('fideliser metrics endpoint returns expected keys', async ({ page }) => {
    await login(page);

    const res = await apiGET(page, '/api/fideliser/metrics?days=30');

    expect([200].includes(res.status), `HTTP ${res.status}\n${res.text}`).toBeTruthy();
    expect(res.contentType || '').toContain('application/json');
    expect(res.json).toBeTruthy();

    expect(res.json).toHaveProperty('range_days');
    expect(res.json).toHaveProperty('newsletter_mail');
    expect(res.json).toHaveProperty('thanks_mail');
    expect(res.json).toHaveProperty('satisfaction_mail');
  });
});