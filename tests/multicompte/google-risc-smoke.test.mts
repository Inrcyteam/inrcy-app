import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("le SQL V2 garde RLS et l'index unique sur jti", () => {
  const sql = readFileSync(new URL("../../ops/sql/google_risc_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /create unique index/i);
  assert.match(sql, /provider, jti/i);
});

test("les routes de déconnexion Google tentent la révocation best-effort", () => {
  const files = [
    new URL("../../app/api/integrations/google/disconnect/route.ts", import.meta.url),
    new URL("../../app/api/integrations/google-stats/disconnect/route.ts", import.meta.url),
    new URL("../../app/api/integrations/google-business/disconnect-account/route.ts", import.meta.url),
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /revokeGoogleTokensBestEffort/);
  }
});
