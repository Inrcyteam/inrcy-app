import assert from "node:assert/strict";
import { openAsBlob } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { INR_MEDIA_VIDEO_SOURCE_MAX_BYTES } from "../../lib/mediaRules.ts";
import {
  advancePinterestVideoProtocol,
  PINTEREST_VIDEO_PROTOCOL_CHECKPOINT_VERSION,
  type PinterestVideoProtocolCheckpoint,
} from "../../lib/pinterestVideoProtocol.ts";

const API_BASE_URL = "https://api.pinterest.com";
const OPERATION_ID = "publication-123:pinterest";
const SOURCE_FINGERPRINT = "booster/users/u/pinterest.mp4:314572800:v1";
const START_TIME = Date.parse("2026-08-05T10:00:00.000Z");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function uploadPolicy(expiresAtMs: number) {
  return Buffer.from(
    JSON.stringify({ expiration: new Date(expiresAtMs).toISOString() }),
    "utf8",
  ).toString("base64");
}

function registration(mediaId: string, expiresAtMs: number) {
  return {
    media_id: mediaId,
    upload_url: "https://upload.example.test/",
    upload_parameters: {
      key: `uploads/${mediaId}`,
      policy: uploadPolicy(expiresAtMs),
      "x-amz-signature": "signature-value",
    },
  };
}

function durableArgs(params: {
  checkpoint?: unknown;
  videoFile?: Blob;
  videoSize?: number;
  fetchImpl: typeof fetch;
  now: () => number;
  persistCheckpoint?: (
    checkpoint: PinterestVideoProtocolCheckpoint,
  ) => Promise<void>;
  operationId?: string;
  sourceFingerprint?: string;
}) {
  return {
    apiBaseUrl: API_BASE_URL,
    accessToken: "token-test",
    operationId: params.operationId || OPERATION_ID,
    sourceFingerprint: params.sourceFingerprint || SOURCE_FINGERPRINT,
    boardId: "board-123",
    title: "Une vidéo durable",
    description: "Description",
    link: "https://app.inrcy.com",
    coverImageUrl: "https://cdn.example.test/cover.jpg",
    videoFile: params.videoFile,
    videoSize: params.videoSize || 4,
    videoContentType: "video/mp4",
    videoFileName: "video.mp4",
    checkpoint: params.checkpoint,
    fetchImpl: params.fetchImpl,
    now: params.now,
    persistCheckpoint: params.persistCheckpoint,
  };
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function checkpoint(params: {
  phase: PinterestVideoProtocolCheckpoint["phase"];
  mediaId?: string;
  uploadUrl?: string;
  uploadParameters?: Record<string, string>;
  uploadExpiresAt?: string;
  uploadConfirmedAt?: string;
  mediaStatus?: string;
  mediaReadyAt?: string;
  nextPollAt?: string;
  pollAttempts?: number;
}): PinterestVideoProtocolCheckpoint {
  return {
    version: PINTEREST_VIDEO_PROTOCOL_CHECKPOINT_VERSION,
    operationId: OPERATION_ID,
    sourceFingerprint: SOURCE_FINGERPRINT,
    phase: params.phase,
    createdAt: new Date(START_TIME).toISOString(),
    updatedAt: new Date(START_TIME).toISOString(),
    pollAttempts: params.pollAttempts || 0,
    ...(params.mediaId ? { mediaId: params.mediaId } : {}),
    ...(params.uploadUrl ? { uploadUrl: params.uploadUrl } : {}),
    ...(params.uploadParameters
      ? { uploadParameters: params.uploadParameters }
      : {}),
    ...(params.uploadExpiresAt
      ? { uploadExpiresAt: params.uploadExpiresAt }
      : {}),
    ...(params.uploadConfirmedAt
      ? { uploadConfirmedAt: params.uploadConfirmedAt }
      : {}),
    ...(params.mediaStatus ? { mediaStatus: params.mediaStatus } : {}),
    ...(params.mediaReadyAt ? { mediaReadyAt: params.mediaReadyAt } : {}),
    ...(params.nextPollAt ? { nextPollAt: params.nextPollAt } : {}),
  };
}

test("300 Mio reprennent register/upload/poll/create sans répéter une phase confirmée", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "inrcy-pin-durable-"));
  const videoPath = path.join(tempDir, "video-300m.mp4");
  const handle = await open(videoPath, "w");
  await handle.truncate(INR_MEDIA_VIDEO_SOURCE_MAX_BYTES);
  await handle.close();
  const videoFile = await openAsBlob(videoPath, { type: "video/mp4" });

  let nowMs = START_TIME;
  let mediaReads = 0;
  const calls: string[] = [];
  const persistedPhases: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || "GET");
    calls.push(`${method} ${url}`);
    if (url.endsWith("/v5/media") && method === "POST") {
      return jsonResponse(registration("media-300", nowMs + 10 * 60_000));
    }
    if (url === "https://upload.example.test/" && method === "POST") {
      assert.ok(init?.body instanceof FormData);
      const uploadedFile = (init.body as FormData).get("file");
      assert.ok(uploadedFile instanceof Blob);
      assert.equal(uploadedFile.size, INR_MEDIA_VIDEO_SOURCE_MAX_BYTES);
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/v5/media/media-300") && method === "GET") {
      mediaReads += 1;
      return jsonResponse({
        status: mediaReads === 1 ? "processing" : "succeeded",
      });
    }
    if (url.endsWith("/v5/pins") && method === "POST") {
      return jsonResponse({ id: "pin-300", board_id: "board-123" }, 201);
    }
    return jsonResponse({ message: `Unexpected ${method} ${url}` }, 500);
  }) as typeof fetch;
  const persistCheckpoint = async (value: PinterestVideoProtocolCheckpoint) => {
    persistedPhases.push(value.phase);
  };

  try {
    let state = await advancePinterestVideoProtocol(
      durableArgs({
        videoFile,
        videoSize: INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
        fetchImpl,
        now: () => nowMs,
        persistCheckpoint,
      }),
    );
    assert.equal(state.state, "continue");
    assert.equal(state.checkpoint.phase, "registered");

    // Every JSON round-trip below simulates a fresh process reading Supabase.
    state = await advancePinterestVideoProtocol(
      durableArgs({
        checkpoint: roundTrip(state.checkpoint),
        videoFile,
        videoSize: INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
        fetchImpl,
        now: () => nowMs,
        persistCheckpoint,
      }),
    );
    assert.equal(state.checkpoint.phase, "uploaded");
    assert.equal(state.checkpoint.uploadUrl, undefined);
    assert.equal(state.checkpoint.uploadParameters, undefined);

    state = await advancePinterestVideoProtocol(
      durableArgs({
        checkpoint: roundTrip(state.checkpoint),
        videoSize: INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
        fetchImpl,
        now: () => nowMs,
        persistCheckpoint,
      }),
    );
    assert.equal(state.state, "waiting");
    assert.equal(state.checkpoint.phase, "polling");
    nowMs = Date.parse(String(state.retryAt));

    state = await advancePinterestVideoProtocol(
      durableArgs({
        checkpoint: roundTrip(state.checkpoint),
        videoSize: INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
        fetchImpl,
        now: () => nowMs,
        persistCheckpoint,
      }),
    );
    assert.equal(state.checkpoint.phase, "media_ready");

    state = await advancePinterestVideoProtocol(
      durableArgs({
        checkpoint: roundTrip(state.checkpoint),
        videoSize: INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
        fetchImpl,
        now: () => nowMs,
        persistCheckpoint,
      }),
    );
    assert.equal(state.state, "completed");
    assert.equal(state.result?.pin.id, "pin-300");

    const callsAtCompletion = calls.length;
    const replay = await advancePinterestVideoProtocol(
      durableArgs({
        checkpoint: roundTrip(state.checkpoint),
        videoSize: INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
        fetchImpl,
        now: () => nowMs,
        persistCheckpoint,
      }),
    );
    assert.equal(replay.state, "completed");
    assert.equal(calls.length, callsAtCompletion);
    assert.deepEqual(calls, [
      "POST https://api.pinterest.com/v5/media",
      "POST https://upload.example.test/",
      "GET https://api.pinterest.com/v5/media/media-300",
      "GET https://api.pinterest.com/v5/media/media-300",
      "POST https://api.pinterest.com/v5/pins",
    ]);
    assert.deepEqual(persistedPhases, [
      "registering",
      "registered",
      "uploading",
      "uploaded",
      "polling",
      "media_ready",
      "creating_pin",
      "completed",
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("un intent checkpointé puis interrompu devient outcome_unknown sans nouvel upload", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    throw new Error("aucun appel attendu");
  }) as typeof fetch;
  const interrupted = checkpoint({
    phase: "uploading",
    mediaId: "media-crash",
    uploadUrl: "https://upload.example.test/",
    uploadParameters: { key: "uploads/media-crash", policy: "policy" },
    uploadExpiresAt: new Date(START_TIME + 60_000).toISOString(),
  });

  const first = await advancePinterestVideoProtocol(
    durableArgs({ checkpoint: interrupted, fetchImpl, now: () => START_TIME }),
  );
  assert.equal(first.state, "outcome_unknown");
  assert.equal(first.checkpoint.outcomeUnknown?.phase, "upload");
  assert.equal(calls, 0);

  const restart = await advancePinterestVideoProtocol(
    durableArgs({
      checkpoint: roundTrip(first.checkpoint),
      fetchImpl,
      now: () => START_TIME + 1_000,
    }),
  );
  assert.equal(restart.state, "outcome_unknown");
  assert.equal(calls, 0);
});

test("une coupure réseau pendant l'upload ne déclenche jamais un second transfert", async () => {
  let uploadCalls = 0;
  const fetchImpl = (async () => {
    uploadCalls += 1;
    throw new Error("socket closed after upload");
  }) as typeof fetch;
  const registered = checkpoint({
    phase: "registered",
    mediaId: "media-upload-unknown",
    uploadUrl: "https://upload.example.test/",
    uploadParameters: {
      key: "uploads/media-upload-unknown",
      policy: uploadPolicy(START_TIME + 60_000),
    },
    uploadExpiresAt: new Date(START_TIME + 60_000).toISOString(),
  });

  const first = await advancePinterestVideoProtocol(
    durableArgs({
      checkpoint: registered,
      videoFile: new Blob([new Uint8Array(4)]),
      fetchImpl,
      now: () => START_TIME,
    }),
  );
  assert.equal(first.state, "outcome_unknown");
  assert.equal(first.checkpoint.outcomeUnknown?.phase, "upload");
  assert.equal(uploadCalls, 1);

  const restart = await advancePinterestVideoProtocol(
    durableArgs({
      checkpoint: roundTrip(first.checkpoint),
      videoFile: new Blob([new Uint8Array(4)]),
      fetchImpl,
      now: () => START_TIME + 1_000,
    }),
  );
  assert.equal(restart.state, "outcome_unknown");
  assert.equal(uploadCalls, 1);
});

test("l'intent durable est enregistré avant la mutation provider", async () => {
  let providerCalls = 0;
  const fetchImpl = (async () => {
    providerCalls += 1;
    return jsonResponse(registration("never-created", START_TIME + 60_000));
  }) as typeof fetch;
  await assert.rejects(
    advancePinterestVideoProtocol(
      durableArgs({
        fetchImpl,
        now: () => START_TIME,
        persistCheckpoint: async (value) => {
          assert.equal(value.phase, "registering");
          throw new Error("Supabase indisponible");
        },
      }),
    ),
    /Supabase indisponible/,
  );
  assert.equal(providerCalls, 0);
});

test("une inscription expirée ne recrée ni registration ni upload automatiquement", async () => {
  let nowMs = START_TIME;
  let calls = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls += 1;
    assert.match(String(input), /\/v5\/media$/);
    return jsonResponse(registration("media-expired", START_TIME + 6_000));
  }) as typeof fetch;

  let state = await advancePinterestVideoProtocol(
    durableArgs({ fetchImpl, now: () => nowMs }),
  );
  assert.equal(state.checkpoint.phase, "registered");
  nowMs += 7_000;
  state = await advancePinterestVideoProtocol(
    durableArgs({
      checkpoint: roundTrip(state.checkpoint),
      videoFile: new Blob([new Uint8Array(4)]),
      fetchImpl,
      now: () => nowMs,
    }),
  );
  assert.equal(state.state, "expired");
  assert.equal(
    state.checkpoint.failure?.code,
    "pinterest_upload_registration_expired",
  );
  assert.equal(calls, 1);
});

test("un POST Create Pin ambigu reste outcome_unknown après chaque redémarrage", async () => {
  let pinCalls = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(init?.method), "POST");
    assert.match(String(input), /\/v5\/pins$/);
    pinCalls += 1;
    throw new Error("socket closed after request body");
  }) as typeof fetch;
  const ready = checkpoint({
    phase: "media_ready",
    mediaId: "media-ready",
    mediaStatus: "succeeded",
    mediaReadyAt: new Date(START_TIME).toISOString(),
    pollAttempts: 1,
  });

  const first = await advancePinterestVideoProtocol(
    durableArgs({ checkpoint: ready, fetchImpl, now: () => START_TIME }),
  );
  assert.equal(first.state, "outcome_unknown");
  assert.equal(first.checkpoint.outcomeUnknown?.phase, "create_pin");
  assert.equal(pinCalls, 1);

  const restart = await advancePinterestVideoProtocol(
    durableArgs({
      checkpoint: roundTrip(first.checkpoint),
      fetchImpl,
      now: () => START_TIME + 1_000,
    }),
  );
  assert.equal(restart.state, "outcome_unknown");
  assert.equal(pinCalls, 1);
});

test("une erreur de poll GET est reprenable, un statut média failed est terminal", async () => {
  let nowMs = START_TIME;
  let mediaCalls = 0;
  const fetchImpl = (async () => {
    mediaCalls += 1;
    if (mediaCalls === 1) {
      return jsonResponse({ message: "temporarily unavailable" }, 503);
    }
    if (mediaCalls === 2) return jsonResponse({ status: "succeeded" });
    return jsonResponse({ status: "failed", message: "Format refusé" });
  }) as typeof fetch;
  const uploaded = checkpoint({
    phase: "uploaded",
    mediaId: "media-poll",
    uploadConfirmedAt: new Date(START_TIME).toISOString(),
    mediaStatus: "uploaded",
  });

  let state = await advancePinterestVideoProtocol(
    durableArgs({ checkpoint: uploaded, fetchImpl, now: () => nowMs }),
  );
  assert.equal(state.state, "waiting");
  assert.equal(state.checkpoint.phase, "polling");
  nowMs = Date.parse(String(state.retryAt));
  state = await advancePinterestVideoProtocol(
    durableArgs({
      checkpoint: roundTrip(state.checkpoint),
      fetchImpl,
      now: () => nowMs,
    }),
  );
  assert.equal(state.checkpoint.phase, "media_ready");

  const failed = await advancePinterestVideoProtocol(
    durableArgs({
      checkpoint: checkpoint({
        phase: "uploaded",
        mediaId: "media-failed",
        uploadConfirmedAt: new Date(START_TIME).toISOString(),
      }),
      fetchImpl,
      now: () => nowMs,
    }),
  );
  assert.equal(failed.state, "failed");
  assert.match(failed.checkpoint.failure?.message || "", /Format refusé/);
});

test("une couverture Pinterest inaccessible est terminale et traduite", async () => {
  const fetchImpl = (async () =>
    jsonResponse({ message: "Sorry we could not fetch the image." }, 400)) as typeof fetch;
  const ready = checkpoint({
    phase: "media_ready",
    mediaId: "media-cover",
    mediaStatus: "succeeded",
    mediaReadyAt: new Date(START_TIME).toISOString(),
  });

  const state = await advancePinterestVideoProtocol(
    durableArgs({ checkpoint: ready, fetchImpl, now: () => START_TIME }),
  );

  assert.equal(state.state, "failed");
  assert.equal(state.checkpoint.failure?.code, "pinterest_create_pin_http_error");
  assert.equal(
    state.checkpoint.failure?.message,
    "Pinterest n’a pas pu récupérer une image. Vérifiez qu’elle reste publique et accessible, puis réessayez.",
  );
});

test("un checkpoint d'une autre source est refusé avant tout appel réseau", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return jsonResponse({});
  }) as typeof fetch;
  const foreign = checkpoint({ phase: "uploaded", mediaId: "media-foreign" });
  await assert.rejects(
    advancePinterestVideoProtocol(
      durableArgs({
        checkpoint: foreign,
        sourceFingerprint: "different-source",
        fetchImpl,
        now: () => START_TIME,
      }),
    ),
    /ne correspond pas/,
  );
  assert.equal(calls, 0);
});
