import { test, expect } from '@playwright/test';

test('login page loads and shows email/password fields', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByPlaceholder('Email')).toBeVisible();
  await expect(page.getByPlaceholder('Mot de passe')).toBeVisible();
  await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible();
});

test('health endpoints behave as expected', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  const healthJson = await health.json();
  expect(healthJson).toHaveProperty('ok');

  // internal endpoint should be protected
  const internal = await request.get('/api/health/internal');
  expect(internal.status()).toBe(401);
});

test('CSP Report-Only header is present on dashboard route (or redirect)', async ({ page }) => {
  const resp = await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  // If unauth, may redirect; still fine.
  const headers = resp?.headers() || {};
  const cspRO = headers['content-security-policy-report-only'];
  expect(cspRO || '').toContain("default-src 'self'");
});
