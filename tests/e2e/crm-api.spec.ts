import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { apiGET } from './helpers/api';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('crm api', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('crm api returns authenticated response', async ({ page }) => {
    await login(page);

    const res = await apiGET(page, '/api/crm');

    expect(
      [200, 204].includes(res.status),
      `HTTP ${res.status}\n${res.text}`
    ).toBeTruthy();

    // si ton endpoint renvoie autre chose parfois, adapte ici
    expect(res.contentType || '').toContain('application/json');
  });
});