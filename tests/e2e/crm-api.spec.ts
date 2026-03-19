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

    expect(res.ok()).toBeTruthy();

    const contentType = res.headers()['content-type'] || '';
    expect(contentType).toContain('application/json');

    const body = await res.json();
    expect(body).toBeDefined();
  });
});