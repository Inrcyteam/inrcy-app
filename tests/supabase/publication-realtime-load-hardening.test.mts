import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const migration = read(
  "ops/sql/2026-08-05_publication_realtime_load_hardening.sql",
);
const bridge = read(
  "app/dashboard/_components/ProfileRealtimeBridge.tsx",
);
const boosterLayer = read(
  "app/dashboard/_components/DashboardBoosterModalLayer.tsx",
);
const asyncPublication = read("lib/boosterAsyncPublication.ts");

test("delivery changes use statement transition tables and ignore noisy processing transitions", () => {
  assert.match(
    migration,
    /drop trigger if exists trg_publication_deliveries_bump_version\s+on public\.publication_deliveries/,
  );
  assert.equal((migration.match(/for each statement/g) || []).length, 3);
  assert.match(migration, /referencing new table as new_delivery_rows/);
  assert.match(
    migration,
    /referencing old table as old_delivery_rows new table as new_delivery_rows/,
  );
  assert.match(migration, /select distinct changed\.user_id/);
  assert.match(
    migration,
    /array\['delivered', 'failed', 'deleted'\]::text\[\]/,
  );
  assert.match(migration, /is distinct from/);
  assert.doesNotMatch(
    migration,
    /array\[[^\]]*(?:'queued'|'processing')[^\]]*\]::text\[\]/,
  );
  assert.doesNotMatch(
    migration,
    /create trigger trg_publication_deliveries[^\n]*\s+after [^\n]+ on public\.publication_deliveries\s+(?:referencing [^\n]+\s+)?for each row/,
  );
});

test("parallel async delivery workers defer their realtime bump to one parent finalization", () => {
  assert.equal(
    (
      migration.match(
        /and not exists \(\s*select 1\s*from public\.app_events as async_parent/g,
      ) || []
    ).length,
    3,
  );
  for (const rowAlias of ["inserted", "updated", "deleted"]) {
    assert.match(
      migration,
      new RegExp(
        `async_parent\\.id = ${rowAlias}\\.publication_id[\\s\\S]*?` +
          `async_parent\\.user_id = ${rowAlias}\\.user_id[\\s\\S]*?` +
          "async_parent\\.type = 'publish_async_job'",
      ),
    );
  }

  assert.match(
    migration,
    /create or replace function public\.inrcy_bump_publications_for_async_job_finalization\(\)[\s\S]*?perform public\.bump_profile_version\(new\.user_id::uuid, 'publications_version'\)/,
  );
  assert.match(
    migration,
    /create trigger trg_app_events_bump_async_publication_finalization\s+after update of type on public\.app_events\s+for each row\s+when \(\s*old\.type = 'publish_async_job'\s+and new\.type is distinct from old\.type\s*\)/,
  );

  // Only the finalizer that owns the payload claim may perform the type
  // transition, so the row trigger above can fire at most once per job.
  assert.match(
    asyncPublication,
    /\.update\(\{ type: finalEventType, payload: finalPayload \}\)[\s\S]*?\.eq\("type", BOOSTER_ASYNC_JOB_EVENT_TYPE\)[\s\S]*?\.eq\(FINALIZATION_CLAIM_ID_PATH, params\.claimId\)[\s\S]*?\.select\("id"\)/,
  );
});

test("hot publication and app_events queries receive non-blocking indexes", () => {
  assert.match(
    migration,
    /create index concurrently if not exists publication_deliveries_user_publication_channel_idx\s+on public\.publication_deliveries \(user_id, publication_id, channel\)/,
  );
  assert.match(
    migration,
    /app_events_user_created_id_idx\s+on public\.app_events \(user_id, created_at desc, id\)/,
  );
  assert.match(
    migration,
    /app_events_async_channel_queue_idx[\s\S]*where type = 'publish_async_channel'/,
  );
  assert.match(
    migration,
    /app_events_async_parent_user_created_idx[\s\S]*where type = 'publish_async_job'/,
  );
  for (const eventKind of ["channel", "parent"] as const) {
    const eventType =
      eventKind === "channel" ? "publish_async_channel" : "publish_async_job";
    assert.match(
      migration,
      new RegExp(
        `create index concurrently if not exists app_events_async_${eventKind}_state_activity_idx` +
          "[\\s\\S]*?\\(payload->>'status'\\)" +
          "[\\s\\S]*?\\(payload->>'updatedAt'\\)" +
          "[\\s\\S]*?created_at,[\\s\\S]*?id" +
          `[\\s\\S]*?where type = '${eventType}'`,
      ),
    );
  }
  assert.equal(
    (migration.match(/app_events_async_(?:channel|parent)_state_activity_idx/g) || [])
      .length,
    2,
    "the cron needs one compact state/activity expression index per async event type",
  );
  assert.doesNotMatch(
    migration,
    /app_events_async_(?:channel|parent)_state_activity_idx[\s\S]{0,240}using gin/i,
  );
  assert.match(migration, /commit;[\s\S]*create index concurrently/);
});

test("profile realtime events coalesce bursts and reject stale counter snapshots", () => {
  assert.match(bridge, /PROFILE_VERSION_EVENT_COALESCE_MS = 750/);
  assert.match(bridge, /pendingChangesRef = useRef/);
  assert.match(bridge, /pending\s+\? \{ \.\.\.change, previousValue: pending\.previousValue \}/);
  assert.match(bridge, /Math\.max\(previous\[field\], incoming\[field\]\)/);
  assert.match(
    bridge,
    /window\.setTimeout\([\s\S]*flushPendingChanges[\s\S]*PROFILE_VERSION_EVENT_COALESCE_MS/,
  );
  assert.match(bridge, /pendingChangesRef\.current\.clear\(\)/);
});

test("booster metric refreshes debounce profile events and coalesce in-flight calls", () => {
  assert.match(boosterLayer, /BOOSTER_METRICS_REFRESH_DEBOUNCE_MS = 1_000/);
  assert.match(boosterLayer, /metricsRefreshPromiseRef/);
  assert.match(boosterLayer, /metricsRefreshQueuedRef/);
  assert.match(boosterLayer, /scheduleMetricsRefresh/);
  assert.match(
    boosterLayer,
    /if \(!mode\) return;\s+scheduleMetricsRefresh\(\)/,
  );
  assert.doesNotMatch(
    boosterLayer,
    /publications_version[^}]+void refreshMetrics\(\)/,
  );
  assert.match(boosterLayer, /void Promise\.resolve\(refreshMetrics\(\)\)/);
});
