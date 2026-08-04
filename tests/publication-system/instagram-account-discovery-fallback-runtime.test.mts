import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "../..");

async function loadIsolatedModule() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "inrcy-instagram-discovery-"));
  const sourcePath = path.join(ROOT, "lib/metaBusinessAssets.ts");
  let source = await fs.readFile(sourcePath, "utf8");
  source = source
    .replace('"@/lib/observability/fetch"', '"./fetchStub.ts"')
    .replace('"@/lib/tsSafe"', '"./tsSafeStub.ts"')
    .replace('"@/lib/metaGraphApi"', '"./metaGraphStub.ts"');

  await Promise.all([
    fs.writeFile(path.join(tempDir, "metaBusinessAssets.ts"), source),
    fs.writeFile(
      path.join(tempDir, "fetchStub.ts"),
      `export async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}) { return fetch(input, init); }\n`,
    ),
    fs.writeFile(
      path.join(tempDir, "tsSafeStub.ts"),
      `export function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }\nexport function asString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }\n`,
    ),
    fs.writeFile(
      path.join(tempDir, "metaGraphStub.ts"),
      `export function buildMetaGraphUrl(value: string) { return \`https://graph.facebook.test/v25.0/\${value}\`; }\n`,
    ),
  ]);

  const moduleUrl = `${pathToFileURL(path.join(tempDir, "metaBusinessAssets.ts")).href}?t=${Date.now()}`;
  const loaded = await import(moduleUrl);
  return { loaded, tempDir };
}

test("le fallback récupère Instagram quand la requête enrichie Meta échoue", async (t) => {
  const { loaded, tempDir } = await loadIsolatedModule();
  t.after(async () => fs.rm(tempDir, { recursive: true, force: true }));

  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.includes("/me/accounts") && url.includes("instagram_business_account")) {
      return Response.json(
        { error: { message: "Unsupported nested field", code: 100, error_subcode: 33, fbtrace_id: "trace-rich" } },
        { status: 400 },
      );
    }

    if (url.includes("/me/accounts")) {
      return Response.json({
        data: [{ id: "page-1", name: "Page test", access_token: "page-token" }],
      });
    }

    if (url.includes("/me/assigned_pages") || url.includes("/me/businesses")) {
      return Response.json({ error: { message: "Optional edge unavailable", code: 100 } }, { status: 400 });
    }

    if (url.includes("/page-1")) {
      assert.match(url, /access_token=page-token/);
      return Response.json({
        id: "page-1",
        name: "Page test",
        access_token: "page-token",
        instagram_business_account: { id: "ig-1", username: "compte_pro" },
      });
    }

    return Response.json({ error: { message: "Unexpected URL" } }, { status: 500 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await loaded.listAccessibleFacebookPagesDetailed("user-token");
  assert.equal(result.diagnostics.primary_request_succeeded, true);
  assert.equal(result.diagnostics.primary_fallback_used, true);
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0]?.id, "page-1");
  assert.equal(result.pages[0]?.instagram_business_account?.id, "ig-1");
  assert.equal(result.pages[0]?.instagram_business_account?.username, "compte_pro");
  assert.ok(calls.some((url) => url.includes("fields=id%2Cname%2Caccess_token")));
});
