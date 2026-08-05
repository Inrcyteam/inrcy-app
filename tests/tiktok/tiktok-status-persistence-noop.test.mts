import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hasMeaningfulTiktokResultChange,
  shouldUpdateTiktokDelivery,
} from "../../lib/tiktokStatusPersistence.ts";

const statusRoute = readFileSync(
  new URL(
    "../../app/api/inrsend/publications/[publicationId]/tiktok/status/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const watcher = readFileSync(
  new URL("../../lib/tiktokPendingPublicationWatcher.ts", import.meta.url),
  "utf8",
);

const pendingResult = {
  ok: true,
  status: "processing",
  external_id: "publish-123",
  tiktok_status: "PROCESSING_UPLOAD",
  tiktok_status_label: "Upload TikTok en cours",
  tiktok_status_message: "TikTok traite encore la publication.",
  tiktok_status_checked_at: "2026-08-05T10:00:00.000Z",
  tiktok_submitted_at: "2026-08-05T09:59:00.000Z",
  tiktok_status_progress_at: "2026-08-05T10:00:00.000Z",
  tiktok_status_fetch_failed: false,
  tiktok_status_fetch_error: null,
  tiktok_fail_reason: null,
  tiktok_provider_error_code: null,
  tiktok_uploaded_bytes: 1_024,
  tiktok_downloaded_bytes: null,
  tiktok_public_post_ids: [],
  tiktok_stalled: false,
  tiktok_status_retryable: false,
  warning: true,
  warning_message: "TikTok traite encore la publication.",
  error: null,
  diagnostics: {
    status_checked_at: "2026-08-05T10:00:00.000Z",
    status: { status: "PROCESSING_UPLOAD", raw: { request_id: "old" } },
  },
};

test("an unchanged pending check is an event persistence no-op", () => {
  const freshCheckOnly = {
    ...pendingResult,
    tiktok_status_label: "Libellé recalculé sans transition fournisseur",
    tiktok_status_message: "Message frais renvoyé sans écriture durable.",
    warning_message: "Message frais renvoyé sans écriture durable.",
    tiktok_status_checked_at: "2026-08-05T10:01:00.000Z",
    diagnostics: {
      ...pendingResult.diagnostics,
      status_checked_at: "2026-08-05T10:01:00.000Z",
      status: { status: "PROCESSING_UPLOAD", raw: { request_id: "new" } },
    },
  };

  assert.equal(
    hasMeaningfulTiktokResultChange(pendingResult, freshCheckOnly),
    false,
  );
});

test("progress, errors, stalls and terminal transitions remain durable", () => {
  assert.equal(
    hasMeaningfulTiktokResultChange(pendingResult, {
      ...pendingResult,
      tiktok_uploaded_bytes: 2_048,
      tiktok_status_progress_at: "2026-08-05T10:01:00.000Z",
    }),
    true,
  );
  assert.equal(
    hasMeaningfulTiktokResultChange(pendingResult, {
      ...pendingResult,
      tiktok_status_fetch_failed: true,
      tiktok_status_fetch_error: "temporary_error",
    }),
    true,
  );
  assert.equal(
    hasMeaningfulTiktokResultChange(pendingResult, {
      ...pendingResult,
      tiktok_stalled: true,
    }),
    true,
  );
  assert.equal(
    hasMeaningfulTiktokResultChange(pendingResult, {
      ...pendingResult,
      status: "delivered",
      tiktok_status: "PUBLISH_COMPLETE",
      warning: false,
      warning_message: null,
    }),
    true,
  );
});

test("an unchanged processing delivery is a delivery persistence no-op", () => {
  assert.equal(
    shouldUpdateTiktokDelivery(
      { status: "processing", error: null },
      "processing",
      null,
    ),
    false,
  );
  assert.equal(
    shouldUpdateTiktokDelivery(
      { status: "deleted", error: null },
      "delivered",
      null,
    ),
    false,
  );
  assert.equal(
    shouldUpdateTiktokDelivery(
      { status: "processing", error: null },
      "delivered",
      null,
    ),
    true,
  );
  assert.equal(
    shouldUpdateTiktokDelivery(
      { status: "failed", error: "old" },
      "failed",
      "new",
    ),
    true,
  );
});

test("both API and cron guard event and delivery writes with semantic changes", () => {
  for (const source of [statusRoute, watcher]) {
    assert.match(source, /hasMeaningfulTiktokResultChange/);
    assert.match(source, /shouldUpdateTiktokDelivery/);
    assert.match(source, /shouldPersistEvent/);
    assert.match(source, /shouldPersistDelivery/);
  }
  assert.match(statusRoute, /finalizeAsyncPublicationIfReady/);
  assert.match(statusRoute, /isTiktokCancelledResult/);
});
