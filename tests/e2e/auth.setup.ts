import { mkdir } from 'node:fs/promises';
import { test as setup } from '@playwright/test';
import { login } from './helpers/auth';

export const E2E_AUTH_STATE_PATH = 'playwright/.auth/e2e-user.json';

setup('create one reusable authenticated session', async ({ page }) => {
  setup.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    'E2E_EMAIL et E2E_PASSWORD sont requis',
  );

  await login(page, { forceUi: true });
  await mkdir('playwright/.auth', { recursive: true });
  await page.context().storageState({ path: E2E_AUTH_STATE_PATH });
});
