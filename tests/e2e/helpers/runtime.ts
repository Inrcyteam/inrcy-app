import { expect, Page } from '@playwright/test';

export function attachRuntimeErrorTracking(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;

    const text = msg.text();

    // Faux positifs fréquents / bruit réseau non bloquant en CI
    if (
      /favicon/i.test(text) ||
      /chrome-extension/i.test(text) ||
      /extensions\//i.test(text) ||
      /Failed to load resource: the server responded with a status of 404/i.test(text) ||
      /TypeError:\s*Failed to fetch/i.test(text) ||
      /supabase\.co/i.test(text) ||
      /ECONNRESET/i.test(text)
    ) {
      return;
    }

    errors.push(`console: ${text}`);
  });

  return {
    async expectNoErrors() {
      expect(errors, `Erreurs runtime détectées:\n${errors.join('\n')}`).toEqual([]);
    },
  };
}