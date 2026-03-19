import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { apiGET } from './helpers/api';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('calendar api', () => {
  test.skip(!email || !password, 'E2E_EMAIL et E2E_PASSWORD sont requis');

  test('calendar status returns connected=true for authenticated user', async ({ page }) => {
    await login(page);

    const res = await apiGET(page, '/api/calendar/status');

    expect([200].includes(res.status), `HTTP ${res.status}\n${res.text}`).toBeTruthy();
    expect(res.contentType || '').toContain('application/json');
    expect(res.json).toBeTruthy();
    expect(res.json).toHaveProperty('connected', true);
  });

  test('calendar events returns valid payload for a date range', async ({ page }) => {
    await login(page);

    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 7);

    const end = new Date(now);
    end.setDate(end.getDate() + 30);

    const url = `/api/calendar/events?timeMin=${encodeURIComponent(
      start.toISOString()
    )}&timeMax=${encodeURIComponent(end.toISOString())}`;

    const res = await apiGET(page, url);

    expect([200].includes(res.status), `HTTP ${res.status}\n${res.text}`).toBeTruthy();
    expect(res.contentType || '').toContain('application/json');
    expect(res.json).toBeTruthy();

    expect(res.json).toHaveProperty('ok', true);
    expect(res.json).toHaveProperty('events');
    expect(Array.isArray(res.json.events)).toBeTruthy();
  });
});