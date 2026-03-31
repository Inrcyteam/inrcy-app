import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { apiGET, asObject } from './helpers/api';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('notifications api', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('notifications feed returns a valid payload', async ({ page }) => {
    await login(page);

    const res = await apiGET(page, '/api/notifications/feed?limit=5');

    expect([200].includes(res.status), `HTTP ${res.status}\n${res.text}`).toBeTruthy();
    expect(res.contentType || '').toContain('application/json');

    const json = asObject(res.json);
    expect(json).toBeTruthy();
    expect(json).toHaveProperty('items');
    expect(json).toHaveProperty('unreadCount');
    expect(Array.isArray(json.items)).toBeTruthy();
  });
});