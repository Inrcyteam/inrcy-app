import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

type UnknownRecord = Record<string, unknown>;
type PhaseResult = {
  ok: boolean;
  phase: "create" | "poll" | "publish";
  outcome: string;
  code?: string;
  error?: string;
  retryable?: boolean;
  requestMayHaveSucceeded?: boolean;
  authorizationError?: boolean;
  checkpoint?: UnknownRecord;
  mediaId?: string;
  diagnostics?: UnknownRecord;
};
type PhaseFunction = (
  params: UnknownRecord,
  dependencies?: UnknownRecord,
) => Promise<PhaseResult>;

const source = readFileSync(
  new URL("../../lib/instagramVideoPublishPhases.ts", import.meta.url),
  "utf8",
);
const requireFromTest = createRequire(import.meta.url);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleRecord: { exports: UnknownRecord } = { exports: {} };
const execute = new Function("module", "exports", "require", transpiled);
execute(moduleRecord, moduleRecord.exports, (specifier: string) => {
  if (specifier === "@/lib/metaGraphApi") {
    return {
      buildMetaGraphUrl: (path: string) =>
        `https://graph.test/v25.0/${String(path).replace(/^\/+/, "")}`,
    };
  }
  return requireFromTest(specifier);
});

const instagramCreateVideoCheckpoint =
  moduleRecord.exports.instagramCreateVideoCheckpoint as PhaseFunction;
const instagramCreateVideoCheckpointWithTokenFallback =
  moduleRecord.exports
    .instagramCreateVideoCheckpointWithTokenFallback as PhaseFunction;
const instagramPollVideoCheckpoint =
  moduleRecord.exports.instagramPollVideoCheckpoint as PhaseFunction;
const instagramPollVideoCheckpointWithTokenFallback =
  moduleRecord.exports
    .instagramPollVideoCheckpointWithTokenFallback as PhaseFunction;
const instagramPublishVideoCheckpoint =
  moduleRecord.exports.instagramPublishVideoCheckpoint as PhaseFunction;
const instagramPublishVideoCheckpointWithTokenFallback =
  moduleRecord.exports
    .instagramPublishVideoCheckpointWithTokenFallback as PhaseFunction;
const parseInstagramVideoPublishCheckpoint = moduleRecord.exports
  .parseInstagramVideoPublishCheckpoint as (
  value: unknown,
) => UnknownRecord | null;
const buildInstagramVideoRequestFingerprint = moduleRecord.exports
  .buildInstagramVideoRequestFingerprint as (
  value: UnknownRecord,
) => string;

function jsonResponse(value: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function createInput(overrides: UnknownRecord = {}) {
  return {
    igUserId: "ig-user-1",
    accessToken: "token-primary",
    caption: "Publication iNrCy",
    videoUrl: "https://storage.test/reel.mp4",
    ...overrides,
  };
}

function fixedDependencies(fetchImpl: typeof fetch) {
  return {
    fetchImpl,
    now: () => new Date("2026-08-05T12:00:00.000Z"),
  };
}

test("Instagram video create, checkpoint, poll and publish are short resumable phases", async () => {
  let createCalls = 0;
  let pollCalls = 0;
  let publishCalls = 0;
  const requestedContainerIds: string[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    if (url.pathname.endsWith("/ig-user-1/media") && method === "POST") {
      createCalls += 1;
      assert.equal(url.searchParams.get("media_type"), "REELS");
      assert.equal(url.searchParams.get("video_url"), createInput().videoUrl);
      return jsonResponse({ id: "ig-container-1" });
    }
    if (url.pathname.endsWith("/ig-container-1") && method === "GET") {
      pollCalls += 1;
      requestedContainerIds.push("ig-container-1");
      return pollCalls === 1
        ? jsonResponse({
            id: "ig-container-1",
            status_code: "IN_PROGRESS",
            status: "In progress",
          })
        : jsonResponse({
            id: "ig-container-1",
            status_code: "FINISHED",
            status: "Finished: ready",
          });
    }
    if (
      url.pathname.endsWith("/ig-user-1/media_publish") &&
      method === "POST"
    ) {
      publishCalls += 1;
      assert.equal(url.searchParams.get("creation_id"), "ig-container-1");
      requestedContainerIds.push(String(url.searchParams.get("creation_id")));
      return jsonResponse({ id: "ig-media-1" });
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  }) as typeof fetch;
  const dependencies = fixedDependencies(fetchImpl);
  const expectedFingerprint = buildInstagramVideoRequestFingerprint(
    createInput(),
  );

  const created = await instagramCreateVideoCheckpoint(
    createInput(),
    dependencies,
  );
  assert.equal(created.ok, true);
  assert.equal(created.outcome, "checkpoint");
  assert.equal(created.checkpoint?.containerId, "ig-container-1");
  assert.equal(created.checkpoint?.requestFingerprint, expectedFingerprint);
  assert.equal(created.checkpoint?.state, "created");
  assert.equal(createCalls, 1);
  assert.equal(pollCalls, 0);
  assert.equal(publishCalls, 0);

  const durableCheckpoint = JSON.parse(
    JSON.stringify(created.checkpoint),
  ) as UnknownRecord;
  const processing = await instagramPollVideoCheckpoint(
    {
      checkpoint: durableCheckpoint,
      accessToken: "token-primary",
      expectedRequestFingerprint: expectedFingerprint,
    },
    dependencies,
  );
  assert.equal(processing.ok, true);
  assert.equal(processing.outcome, "processing");
  assert.equal(processing.checkpoint?.state, "processing");
  assert.equal(processing.checkpoint?.pollCount, 1);
  assert.equal(pollCalls, 1, "one invocation performs exactly one status GET");

  const ready = await instagramPollVideoCheckpoint(
    {
      checkpoint: processing.checkpoint,
      accessToken: "token-primary",
      expectedRequestFingerprint: expectedFingerprint,
    },
    dependencies,
  );
  assert.equal(ready.ok, true);
  assert.equal(ready.outcome, "ready");
  assert.equal(ready.checkpoint?.state, "ready");
  assert.equal(ready.checkpoint?.pollCount, 2);
  assert.equal(pollCalls, 2);

  const published = await instagramPublishVideoCheckpoint(
    {
      checkpoint: ready.checkpoint,
      igUserId: "ig-user-1",
      accessToken: "token-primary",
      expectedRequestFingerprint: expectedFingerprint,
    },
    dependencies,
  );
  assert.equal(published.ok, true);
  assert.equal(published.outcome, "published");
  assert.equal(published.mediaId, "ig-media-1");
  assert.equal(published.checkpoint?.state, "published");
  assert.equal(publishCalls, 1);

  const replay = await instagramPublishVideoCheckpoint(
    {
      checkpoint: published.checkpoint,
      igUserId: "ig-user-1",
      accessToken: "token-primary",
      expectedRequestFingerprint: expectedFingerprint,
    },
    dependencies,
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.mediaId, "ig-media-1");
  assert.equal(publishCalls, 1, "a published checkpoint is idempotent locally");
  assert.equal(createCalls, 1, "resume never recreates a media container");
  assert.deepEqual(requestedContainerIds, [
    "ig-container-1",
    "ig-container-1",
    "ig-container-1",
  ]);
});

test("an ambiguous create never falls through to another token", async () => {
  for (const mode of ["network", "5xx", "missing_id"] as const) {
    let calls = 0;
    const result = await instagramCreateVideoCheckpointWithTokenFallback(
      createInput({
        tokenCandidates: [
          { source: "page_backup", accessToken: "token-backup" },
        ],
      }),
      fixedDependencies(
        (async () => {
          calls += 1;
          if (mode === "network") throw new Error("socket reset");
          if (mode === "5xx") {
            return jsonResponse({ error: { message: "temporary" } }, 503);
          }
          return jsonResponse({ accepted: true });
        }) as typeof fetch,
      ),
    );
    assert.equal(result.ok, false, mode);
    assert.equal(result.outcome, "ambiguous", mode);
    assert.equal(result.requestMayHaveSucceeded, true, mode);
    assert.equal(result.retryable, false, mode);
    assert.equal(calls, 1, `${mode} must not create a second container`);
  }
});

test("create token fallback is allowed only after an explicit authorization rejection", async () => {
  const tokens: string[] = [];
  const result = await instagramCreateVideoCheckpointWithTokenFallback(
    createInput({
      tokenCandidates: [
        { source: "page_backup", accessToken: "token-backup" },
      ],
    }),
    fixedDependencies(
      (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const token = String(url.searchParams.get("access_token"));
        tokens.push(token);
        return token === "token-primary"
          ? jsonResponse(
              {
                error: {
                  message: "Invalid OAuth access token",
                  code: 190,
                  type: "OAuthException",
                },
              },
              400,
            )
          : jsonResponse({ id: "ig-container-backup" });
      }) as typeof fetch,
    ),
  );
  assert.equal(result.ok, true);
  assert.equal(result.checkpoint?.containerId, "ig-container-backup");
  assert.equal(result.checkpoint?.tokenSource, "page_backup");
  assert.deepEqual(tokens, ["token-primary", "token-backup"]);
  const attempts = result.diagnostics?.attempts as UnknownRecord[];
  assert.equal(attempts.length, 2);
});

test("poll token fallback keeps the durable container and performs no create", async () => {
  const created = await instagramCreateVideoCheckpoint(
    createInput(),
    fixedDependencies(
      (async () => jsonResponse({ id: "ig-container-poll-fallback" })) as typeof fetch,
    ),
  );
  assert.equal(created.ok, true);
  const urls: string[] = [];
  const result = await instagramPollVideoCheckpointWithTokenFallback(
    {
      checkpoint: created.checkpoint,
      accessToken: "token-primary",
      tokenCandidates: [
        { source: "page_backup", accessToken: "token-backup" },
      ],
    },
    fixedDependencies(
      (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        urls.push(url.toString());
        assert.match(url.pathname, /ig-container-poll-fallback$/);
        return url.searchParams.get("access_token") === "token-primary"
          ? jsonResponse(
              { error: { message: "Permission denied", code: 200 } },
              400,
            )
          : jsonResponse({ status_code: "FINISHED", status: "Finished" });
      }) as typeof fetch,
    ),
  );
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "ready");
  assert.equal(result.checkpoint?.tokenSource, "page_backup");
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.includes("ig-container-poll-fallback")));
  assert.ok(urls.every((url) => !url.includes("ig-user-1/media?")));
});

test("publish ambiguity is checkpointed and never retried automatically", async () => {
  const created = await instagramCreateVideoCheckpoint(
    createInput(),
    fixedDependencies(
      (async () => jsonResponse({ id: "ig-container-publish-unknown" })) as typeof fetch,
    ),
  );
  const ready = await instagramPollVideoCheckpoint(
    { checkpoint: created.checkpoint, accessToken: "token-primary" },
    fixedDependencies(
      (async () =>
        jsonResponse({ status_code: "FINISHED", status: "Finished" })) as typeof fetch,
    ),
  );
  assert.equal(ready.ok, true);
  let publishCalls = 0;
  const dependencies = fixedDependencies(
    (async () => {
      publishCalls += 1;
      return jsonResponse({ error: { message: "temporary" } }, 503);
    }) as typeof fetch,
  );
  const ambiguous = await instagramPublishVideoCheckpoint(
    {
      checkpoint: ready.checkpoint,
      igUserId: "ig-user-1",
      accessToken: "token-primary",
    },
    dependencies,
  );
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.outcome, "ambiguous");
  assert.equal(ambiguous.requestMayHaveSucceeded, true);
  assert.equal(ambiguous.checkpoint?.state, "publish_unknown");

  const replay = await instagramPublishVideoCheckpoint(
    {
      checkpoint: ambiguous.checkpoint,
      igUserId: "ig-user-1",
      accessToken: "token-primary",
    },
    dependencies,
  );
  assert.equal(replay.ok, false);
  assert.equal(replay.outcome, "ambiguous");
  assert.equal(publishCalls, 1);
});

test("publish authorization fallback reuses the same ready container", async () => {
  const created = await instagramCreateVideoCheckpoint(
    createInput(),
    fixedDependencies(
      (async () => jsonResponse({ id: "ig-container-publish-fallback" })) as typeof fetch,
    ),
  );
  const ready = await instagramPollVideoCheckpoint(
    { checkpoint: created.checkpoint, accessToken: "token-primary" },
    fixedDependencies(
      (async () => jsonResponse({ status_code: "FINISHED" })) as typeof fetch,
    ),
  );
  const creationIds: string[] = [];
  const result = await instagramPublishVideoCheckpointWithTokenFallback(
    {
      checkpoint: ready.checkpoint,
      igUserId: "ig-user-1",
      accessToken: "token-primary",
      tokenCandidates: [
        { source: "page_backup", accessToken: "token-backup" },
      ],
    },
    fixedDependencies(
      (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        creationIds.push(String(url.searchParams.get("creation_id")));
        return url.searchParams.get("access_token") === "token-primary"
          ? jsonResponse(
              { error: { message: "Invalid token", code: 190 } },
              400,
            )
          : jsonResponse({ id: "ig-media-fallback" });
      }) as typeof fetch,
    ),
  );
  assert.equal(result.ok, true);
  assert.equal(result.mediaId, "ig-media-fallback");
  assert.deepEqual(creationIds, [
    "ig-container-publish-fallback",
    "ig-container-publish-fallback",
  ]);
});

test("terminal container states and checkpoint mismatches never publish", async () => {
  for (const statusCode of ["ERROR", "EXPIRED", "PUBLISHED"] as const) {
    const created = await instagramCreateVideoCheckpoint(
      createInput({ videoUrl: `https://storage.test/${statusCode}.mp4` }),
      fixedDependencies(
        (async () => jsonResponse({ id: `container-${statusCode}` })) as typeof fetch,
      ),
    );
    let calls = 0;
    const result = await instagramPollVideoCheckpoint(
      { checkpoint: created.checkpoint, accessToken: "token-primary" },
      fixedDependencies(
        (async () => {
          calls += 1;
          return jsonResponse({ status_code: statusCode, status: statusCode });
        }) as typeof fetch,
      ),
    );
    assert.equal(result.ok, false, statusCode);
    assert.equal(calls, 1, statusCode);
    assert.equal(
      result.outcome,
      statusCode === "PUBLISHED" ? "ambiguous" : "failed",
      statusCode,
    );
  }

  let mismatchFetches = 0;
  const valid = await instagramCreateVideoCheckpoint(
    createInput(),
    fixedDependencies(
      (async () => jsonResponse({ id: "container-mismatch" })) as typeof fetch,
    ),
  );
  const mismatch = await instagramPollVideoCheckpoint(
    {
      checkpoint: valid.checkpoint,
      accessToken: "token-primary",
      expectedRequestFingerprint: "0".repeat(64),
    },
    fixedDependencies(
      (async () => {
        mismatchFetches += 1;
        return jsonResponse({ status_code: "FINISHED" });
      }) as typeof fetch,
    ),
  );
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "instagram_video_checkpoint_invalid");
  assert.equal(mismatchFetches, 0);
  assert.equal(
    parseInstagramVideoPublishCheckpoint({ ...valid.checkpoint, pollCount: -1 }),
    null,
  );
});

test("phased Instagram API has no timer or long polling loop", () => {
  assert.doesNotMatch(source, /\bsleep\s*\(/);
  assert.doesNotMatch(source, /setTimeout\s*\(/);
  assert.doesNotMatch(source, /maxAttempts|initialDelayMs/);
  assert.match(source, /AbortSignal\.timeout\(INSTAGRAM_VIDEO_HTTP_TIMEOUT_MS\)/);
  assert.match(source, /outcome: "checkpoint"/);
  assert.match(source, /requestMayHaveSucceeded: true/);
  assert.match(source, /state: "publish_unknown"/);
});
