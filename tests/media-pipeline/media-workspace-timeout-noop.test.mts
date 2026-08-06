import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MEDIA_WORKSPACE_MUTATION_TIMEOUT_MS,
  MEDIA_WORKSPACE_READINESS_TIMEOUT_MS,
  MEDIA_WORKSPACE_READ_TIMEOUT_MS,
  MEDIA_WORKSPACE_TIMEOUT_CODE,
  MediaWorkspaceTimeoutError,
  withMediaWorkspaceDeadline,
} from "../../lib/mediaWorkspaceTimeout.ts";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("une opération média qui n'aboutit jamais est interrompue avec une erreur FR rejouable", async () => {
  const startedAt = Date.now();

  await assert.rejects(
    withMediaWorkspaceDeadline(
      async () => await new Promise<never>(() => undefined),
      { timeoutMs: 20, phase: "test_readiness" },
    ),
    (error: unknown) => {
      assert.ok(error instanceof MediaWorkspaceTimeoutError);
      assert.equal(error.code, MEDIA_WORKSPACE_TIMEOUT_CODE);
      assert.equal(error.retryable, true);
      assert.equal(error.phase, "test_readiness");
      assert.match(error.message, /Supabase.*Réessayez/i);
      return true;
    },
  );

  assert.ok(Date.now() - startedAt < 500, "le test ne doit jamais rester pendant");
});

test("le signal appelant reste prioritaire et n'est jamais transformé en faux timeout", async () => {
  const parent = new AbortController();
  const expected = new DOMException("navigation interrompue", "AbortError");
  const pending = withMediaWorkspaceDeadline(
    async () => await new Promise<never>(() => undefined),
    { signal: parent.signal, timeoutMs: 1_000, phase: "test_parent_abort" },
  );

  parent.abort(expected);
  await assert.rejects(pending, (error: unknown) => error === expected);
});

test("les budgets workspace restent bornés sous le plafond de génération", () => {
  assert.ok(MEDIA_WORKSPACE_READ_TIMEOUT_MS > 0);
  assert.ok(MEDIA_WORKSPACE_MUTATION_TIMEOUT_MS > 0);
  assert.ok(
    MEDIA_WORKSPACE_READ_TIMEOUT_MS <= MEDIA_WORKSPACE_MUTATION_TIMEOUT_MS,
  );
  assert.ok(MEDIA_WORKSPACE_READINESS_TIMEOUT_MS >= 30_000);
  assert.ok(MEDIA_WORKSPACE_READINESS_TIMEOUT_MS <= 45_000);
});

test("ensure, clear, read et readiness utilisent tous le coupe-circuit composable", () => {
  const client = read("lib/mediaWorkspaceClient.ts");
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");

  assert.match(
    client,
    /ensureMediaPublicationWorkspace[\s\S]*withMediaWorkspaceDeadline\([\s\S]*workspace_ensure/,
  );
  assert.match(
    client,
    /clearMediaPublicationWorkspace[\s\S]*withMediaWorkspaceDeadline\([\s\S]*workspace_clear/,
  );
  assert.match(
    client,
    /fetchWorkspaceSnapshotWithRetry[\s\S]*withMediaWorkspaceDeadline\([\s\S]*workspace_read/,
  );
  assert.match(
    modal,
    /waitForPersistentWorkspaceReadiness[\s\S]*timeoutMs = MEDIA_WORKSPACE_READINESS_TIMEOUT_MS[\s\S]*withMediaWorkspaceDeadline\([\s\S]*timeoutMs/,
  );
});

test("un statut workspace identique est un vrai no-op SQL et les refresh redondants sont supprimés", () => {
  const server = read("lib/mediaWorkspaceServer.ts");
  const intent = read("app/api/media-pipeline/upload-intent/route.ts");
  const event = read("app/api/media-pipeline/upload-event/route.ts");

  assert.match(server, /\.update\(\{ status: nextStatus \}\)/);
  assert.match(server, /\.neq\("status", nextStatus\)/);
  assert.doesNotMatch(server, /last_opened_at/);

  assert.equal(
    intent.match(/refreshPublicationWorkspaceMediaStatus\(\{/g)?.length,
    1,
    "l'intent ne doit agréger le statut qu'une fois après l'attachement",
  );
  assert.match(event, /if \(event !== "uploading"\)[\s\S]*refreshPublicationWorkspaceStatusesForMedia/);
});
