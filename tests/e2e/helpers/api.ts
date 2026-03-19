import { APIResponse, Page, expect } from '@playwright/test';

export async function apiGET(page: Page, url: string): Promise<APIResponse> {
  return page.request.get(url);
}

export async function expectOkJson(res: APIResponse) {
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json).toBeTruthy();
  return json;
}