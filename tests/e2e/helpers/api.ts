import { Page, expect } from '@playwright/test';

export type BrowserFetchResult = {
  ok: boolean;
  status: number;
  contentType: string;
  json: any;
  text: string;
};

export async function apiGET(page: Page, url: string): Promise<BrowserFetchResult> {
  return page.evaluate(async (inputUrl) => {
    const res = await fetch(inputUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/json',
      },
    });

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    let json: any = null;
    try {
      json = contentType.includes('application/json') ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return {
      ok: res.ok,
      status: res.status,
      contentType,
      json,
      text,
    };
  }, url);
}

export function expectJsonOk(result: BrowserFetchResult) {
  expect(result.ok, `HTTP ${result.status}\n${result.text}`).toBeTruthy();
  expect(result.contentType).toContain('application/json');
  return result.json;
}