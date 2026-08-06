import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

const config = read('playwright.config.ts');
const authSetup = read('tests/e2e/auth.setup.ts');
const authHelper = read('tests/e2e/helpers/auth.ts');
const loginPage = read('app/login/page.tsx');
const gitignore = read('.gitignore');

test('E2E authenticated specs reuse one setup session', () => {
  assert.match(config, /name: 'auth-setup'/);
  assert.match(config, /name: 'chromium-authenticated'/);
  assert.match(config, /storageState: authStatePath/);
  assert.match(config, /dependencies: hasE2ECredentials \? \['auth-setup'\]/);
  assert.match(authSetup, /storageState\(\{ path: E2E_AUTH_STATE_PATH \}\)/);
});

test('the auth helper verifies a preloaded dashboard before password login', () => {
  assert.match(authHelper, /if \(!options\.forceUi\)/);
  assert.match(authHelper, /page\.goto\('\/dashboard'/);
  assert.match(authHelper, /if \(DASHBOARD_URL\.test\(page\.url\(\)\)\) return/);
});

test('the auth helper ignores Next route-announcer alerts and waits for the real login error', () => {
  assert.match(authHelper, /getByTestId\('login-error'\)/);
  assert.doesNotMatch(authHelper, /getByRole\('alert'\)\.first/);
  assert.match(authHelper, /if \(message\) return \{ kind: 'alert', message \}/);
  assert.match(loginPage, /data-testid="login-error"/);
});

test('the generated session never enters source control or CI artifacts', () => {
  assert.match(gitignore, /\/playwright\/\.auth\//);
  assert.doesNotMatch(config, /test-results\/.*auth/i);
});
