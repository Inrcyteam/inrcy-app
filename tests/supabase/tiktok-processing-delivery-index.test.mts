import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const migration = read(
  "ops/sql/2026-08-05_tiktok_processing_delivery_index.sql",
);
const verification = read(
  "ops/sql/2026-08-05_tiktok_processing_delivery_index_verify.sql",
);
const watcher = read("lib/tiktokPendingPublicationWatcher.ts");

test("the minute TikTok watcher query is covered by its partial ordered index", () => {
  assert.match(
    watcher,
    /\.from\("publication_deliveries"\)\s*\.select\("publication_id,user_id,status,error,created_at"\)\s*\.eq\("channel", "tiktok"\)\s*\.eq\("status", "processing"\)\s*\.gte\("created_at", since\)\s*\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(normalizedLimit\)/,
  );

  assert.match(
    migration,
    /create index concurrently if not exists publication_deliveries_tiktok_processing_created_idx\s+on public\.publication_deliveries \(created_at desc, publication_id, user_id\)\s+where channel = 'tiktok'\s+and status = 'processing';/i,
  );
});

test("the concurrent index migration is deliberately outside a transaction", () => {
  assert.equal(
    (
      migration.match(
        /create index concurrently if not exists publication_deliveries_tiktok_processing_created_idx/gi,
      ) || []
    ).length,
    1,
  );
  assert.doesNotMatch(migration, /^\s*(?:begin|start\s+transaction|commit)\s*;/im);
  assert.match(migration, /hors de tout BEGIN\/COMMIT explicite/i);
});

test("the companion verification is read-only and detects interrupted concurrent builds", () => {
  assert.match(
    verification,
    /to_regclass\(\s*'public\.publication_deliveries_tiktok_processing_created_idx'\s*\)/,
  );
  assert.match(verification, /pg_index\.indisvalid and pg_index\.indisready/);
  assert.match(verification, /pg_get_indexdef\(inspected\.index_oid\)/);
  assert.match(
    verification,
    /pg_get_expr\(pg_index\.indpred, pg_index\.indrelid\)/,
  );
  assert.doesNotMatch(
    verification,
    /^\s*(?:insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/im,
  );
});
