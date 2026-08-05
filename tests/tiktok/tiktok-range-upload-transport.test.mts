import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TikTokRangeUploadError,
  normalizeTikTokUploadedOffset,
  probeTikTokRangeSource,
  uploadTikTokVideoFromRangeSource,
  validateTikTokSourceRangeHeaders,
  type TikTokRangeSource,
} from "../../lib/tiktokRangeUpload.ts";
import { buildTikTokVideoUploadPlan } from "../../lib/tiktokUploadPlan.ts";

const MIB = 1024 * 1024;

function sourceResponse(params: {
  firstByte: number;
  lastByte: number;
  totalBytes: number;
}) {
  const length = params.lastByte - params.firstByte + 1;
  return new Response(new Uint8Array(length).fill(7), {
    status: 206,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(length),
      "Content-Range": `bytes ${params.firstByte}-${params.lastByte}/${params.totalBytes}`,
    },
  });
}

async function consumeRequestBody(init?: RequestInit) {
  const body = init?.body;
  if (!body) return 0;
  return (await new Response(body).arrayBuffer()).byteLength;
}

function makeSource(): TikTokRangeSource {
  return {
    sourceKey: "supabase:booster:users/u/video.mp4",
    declaredContentType: "video/mp4",
    getUrl: async () => "https://storage.example.test/video.mp4",
  };
}

test("TikTok accepte exactement 300 Mio et rejette 301 Mio avant init", () => {
  assert.deepEqual(buildTikTokVideoUploadPlan(300 * MIB), {
    chunkSize: 32 * MIB,
    totalChunkCount: 9,
  });
  assert.throws(
    () => buildTikTokVideoUploadPlan(301 * MIB),
    /tiktok_video_source_too_large/,
  );
});

test("le probe serveur rejette une source réelle de 301 Mio sans la charger", async () => {
  const fetchImpl = (async () =>
    sourceResponse({
      firstByte: 0,
      lastByte: 0,
      totalBytes: 301 * MIB,
    })) as typeof fetch;
  await assert.rejects(
    probeTikTokRangeSource({ source: makeSource(), fetchImpl }),
    (error: unknown) =>
      error instanceof TikTokRangeUploadError &&
      error.code === "tiktok_video_source_too_large",
  );
});

test("le probe Range retente une indisponibilité transitoire", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return calls === 1
      ? new Response(null, { status: 503 })
      : sourceResponse({ firstByte: 0, lastByte: 0, totalBytes: 6 });
  }) as typeof fetch;
  const probe = await probeTikTokRangeSource({
    source: makeSource(),
    fetchImpl,
  });
  assert.equal(calls, 2);
  assert.equal(probe.totalBytes, 6);
});

test("une réponse Range incohérente est refusée strictement", () => {
  assert.throws(
    () =>
      validateTikTokSourceRangeHeaders({
        status: 206,
        contentRange: "bytes 1-3/6",
        contentLength: "3",
        firstByte: 0,
        lastByte: 2,
        expectedTotalBytes: 6,
      }),
    (error: unknown) =>
      error instanceof TikTokRangeUploadError &&
      error.code === "tiktok_source_content_range_invalid",
  );
  assert.throws(
    () =>
      validateTikTokSourceRangeHeaders({
        status: 200,
        contentRange: "bytes 0-2/6",
        contentLength: "3",
        firstByte: 0,
        lastByte: 2,
        expectedTotalBytes: 6,
      }),
    (error: unknown) =>
      error instanceof TikTokRangeUploadError &&
      error.code === "tiktok_source_range_status_invalid",
  );
});

test("la progression TikTok accepte le compteur exclusif documenté et l'ancienne borne inclusive", () => {
  const common = {
    totalBytes: 6,
    chunkSize: 3,
    totalChunkCount: 2,
  };

  assert.equal(
    normalizeTikTokUploadedOffset({
      ...common,
      contentRange: "bytes 0-3/6",
      expectedOffset: 3,
    }),
    3,
  );
  assert.equal(
    normalizeTikTokUploadedOffset({
      ...common,
      contentRange: "bytes 0-6/6",
      expectedOffset: 6,
    }),
    6,
  );
  assert.equal(
    normalizeTikTokUploadedOffset({
      ...common,
      contentRange: "bytes 0-2/6",
      expectedOffset: 3,
    }),
    3,
  );
  assert.equal(
    normalizeTikTokUploadedOffset({
      ...common,
      contentRange: "bytes 0-5/6",
      expectedOffset: 6,
    }),
    6,
  );
});

test("la progression TikTok refuse les plages hors borne ou ambiguës", () => {
  const common = {
    totalBytes: 6,
    expectedOffset: 3,
    chunkSize: 3,
    totalChunkCount: 2,
  };

  for (const contentRange of [
    "bytes 1-3/6",
    "bytes 0-7/6",
    "bytes 0-3/7",
    "invalid",
  ]) {
    assert.throws(
      () => normalizeTikTokUploadedOffset({ ...common, contentRange }),
      (error: unknown) =>
        error instanceof TikTokRangeUploadError &&
        error.code === "tiktok_upload_content_range_invalid",
    );
  }

  assert.throws(
    () =>
      normalizeTikTokUploadedOffset({
        contentRange: "bytes 0-1/3",
        totalBytes: 3,
        expectedOffset: 2,
        chunkSize: 1,
        totalChunkCount: 3,
      }),
    (error: unknown) =>
      error instanceof TikTokRangeUploadError &&
      error.code === "tiktok_upload_progress_invalid",
  );

  assert.throws(
    () =>
      normalizeTikTokUploadedOffset({
        ...common,
        contentRange: "bytes 0-2/6",
        allowAhead: true,
      }),
    (error: unknown) =>
      error instanceof TikTokRangeUploadError &&
      error.code === "tiktok_upload_progress_invalid",
  );
});

test("un échec transitoire recharge la même Range puis reprend les chunks", async () => {
  const sourceRanges: string[] = [];
  const uploadRanges: string[] = [];
  const checkpoints: number[] = [];
  let firstUploadAttempts = 0;

  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.includes("storage.example.test")) {
      const range = String(new Headers(init?.headers).get("range") || "");
      sourceRanges.push(range);
      const match = /bytes=(\d+)-(\d+)/.exec(range);
      assert.ok(match);
      return sourceResponse({
        firstByte: Number(match[1]),
        lastByte: Number(match[2]),
        totalBytes: 6,
      });
    }

    const headers = new Headers(init?.headers);
    const range = String(headers.get("content-range") || "");
    uploadRanges.push(range);
    assert.equal(await consumeRequestBody(init), Number(headers.get("content-length")));
    if (range === "bytes 0-2/6") {
      firstUploadAttempts += 1;
      if (firstUploadAttempts === 1) {
        return new Response("temporary", { status: 503 });
      }
      return new Response(null, {
        status: 206,
        headers: { "Content-Range": "bytes 0-3/6" },
      });
    }
    return new Response(null, {
      status: 201,
      headers: { "Content-Range": "bytes 0-6/6" },
    });
  }) as typeof fetch;

  const result = await uploadTikTokVideoFromRangeSource({
    source: makeSource(),
    uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=test",
    contentType: "video/mp4",
    totalBytes: 6,
    chunkSize: 3,
    totalChunkCount: 2,
    fetchImpl,
    onProgress: ({ nextOffset }) => {
      checkpoints.push(nextOffset);
    },
  });

  assert.equal(result.nextOffset, 6);
  assert.deepEqual(checkpoints, [3, 6]);
  assert.deepEqual(sourceRanges, ["bytes=0-2", "bytes=0-2", "bytes=3-5"]);
  assert.deepEqual(uploadRanges, ["bytes 0-2/6", "bytes 0-2/6", "bytes 3-5/6"]);
});

test("la reprise durable repart à l'offset suivant sans renvoyer le début", async () => {
  const sourceRanges: string[] = [];
  const uploadRanges: string[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.includes("storage.example.test")) {
      const range = String(new Headers(init?.headers).get("range") || "");
      sourceRanges.push(range);
      return sourceResponse({ firstByte: 3, lastByte: 5, totalBytes: 6 });
    }
    const headers = new Headers(init?.headers);
    uploadRanges.push(String(headers.get("content-range") || ""));
    assert.equal(await consumeRequestBody(init), 3);
    return new Response(null, {
      status: 201,
      headers: { "Content-Range": "bytes 0-6/6" },
    });
  }) as typeof fetch;

  const result = await uploadTikTokVideoFromRangeSource({
    source: makeSource(),
    uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=resume",
    contentType: "video/mp4",
    totalBytes: 6,
    chunkSize: 3,
    totalChunkCount: 2,
    initialOffset: 3,
    fetchImpl,
  });

  assert.equal(result.nextOffset, 6);
  assert.deepEqual(sourceRanges, ["bytes=3-5"]);
  assert.deepEqual(uploadRanges, ["bytes 3-5/6"]);
});

test("un 416 avec progression confirmée récupère le chunk validé avant le crash", async () => {
  const uploadedRanges: string[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.includes("storage.example.test")) {
      const range = String(new Headers(init?.headers).get("range") || "");
      const match = /bytes=(\d+)-(\d+)/.exec(range);
      assert.ok(match);
      return sourceResponse({
        firstByte: Number(match[1]),
        lastByte: Number(match[2]),
        totalBytes: 6,
      });
    }
    const headers = new Headers(init?.headers);
    const range = String(headers.get("content-range") || "");
    uploadedRanges.push(range);
    await consumeRequestBody(init);
    return range === "bytes 0-2/6"
      ? new Response(null, {
          status: 416,
          headers: { "Content-Range": "bytes 0-3/6" },
        })
      : new Response(null, {
          status: 201,
          headers: { "Content-Range": "bytes 0-6/6" },
        });
  }) as typeof fetch;

  const result = await uploadTikTokVideoFromRangeSource({
    source: makeSource(),
    uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=crash",
    contentType: "video/mp4",
    totalBytes: 6,
    chunkSize: 3,
    totalChunkCount: 2,
    fetchImpl,
  });

  assert.equal(result.nextOffset, 6);
  assert.equal(result.responses[0]?.responseStatus, 416);
  assert.equal(result.responses[0]?.recoveredFromAlreadyUploadedChunk, true);
  assert.deepEqual(uploadedRanges, ["bytes 0-2/6", "bytes 3-5/6"]);
});

test("un 416 peut récupérer plusieurs chunks sans renvoyer les octets déjà confirmés", async () => {
  const sourceRanges: string[] = [];
  const uploadedRanges: string[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.includes("storage.example.test")) {
      const range = String(new Headers(init?.headers).get("range") || "");
      sourceRanges.push(range);
      const match = /bytes=(\d+)-(\d+)/.exec(range);
      assert.ok(match);
      return sourceResponse({
        firstByte: Number(match[1]),
        lastByte: Number(match[2]),
        totalBytes: 9,
      });
    }
    const headers = new Headers(init?.headers);
    const range = String(headers.get("content-range") || "");
    uploadedRanges.push(range);
    await consumeRequestBody(init);
    return range === "bytes 0-2/9"
      ? new Response(null, {
          status: 416,
          headers: { "Content-Range": "bytes 0-6/9" },
        })
      : new Response(null, {
          status: 201,
          headers: { "Content-Range": "bytes 0-9/9" },
        });
  }) as typeof fetch;

  const result = await uploadTikTokVideoFromRangeSource({
    source: makeSource(),
    uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=ahead",
    contentType: "video/mp4",
    totalBytes: 9,
    chunkSize: 3,
    totalChunkCount: 3,
    fetchImpl,
  });

  assert.equal(result.nextOffset, 9);
  assert.deepEqual(sourceRanges, ["bytes=0-2", "bytes=6-8"]);
  assert.deepEqual(uploadedRanges, ["bytes 0-2/9", "bytes 6-8/9"]);
});

test("le dernier chunk fusionné utilise les frontières du plan TikTok réel", async () => {
  const uploadedRanges: string[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.includes("storage.example.test")) {
      const range = String(new Headers(init?.headers).get("range") || "");
      const match = /bytes=(\d+)-(\d+)/.exec(range);
      assert.ok(match);
      return sourceResponse({
        firstByte: Number(match[1]),
        lastByte: Number(match[2]),
        totalBytes: 11,
      });
    }
    const range = String(
      new Headers(init?.headers).get("content-range") || "",
    );
    uploadedRanges.push(range);
    await consumeRequestBody(init);
    return range === "bytes 0-3/11"
      ? new Response(null, {
          status: 206,
          headers: { "Content-Range": "bytes 0-4/11" },
        })
      : new Response(null, {
          status: 201,
          headers: { "Content-Range": "bytes 0-11/11" },
        });
  }) as typeof fetch;

  const result = await uploadTikTokVideoFromRangeSource({
    source: makeSource(),
    uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=remainder",
    contentType: "video/mp4",
    totalBytes: 11,
    chunkSize: 4,
    totalChunkCount: 2,
    fetchImpl,
  });

  assert.equal(result.nextOffset, 11);
  assert.deepEqual(uploadedRanges, ["bytes 0-3/11", "bytes 4-10/11"]);
  assert.throws(
    () =>
      normalizeTikTokUploadedOffset({
        contentRange: "bytes 0-8/11",
        totalBytes: 11,
        expectedOffset: 4,
        chunkSize: 4,
        totalChunkCount: 2,
        allowAhead: true,
      }),
    (error: unknown) =>
      error instanceof TikTokRangeUploadError &&
      error.code === "tiktok_upload_progress_invalid",
  );
});

test("un 416 final récupère une réponse 201 perdue sans réinitialiser l'upload", async () => {
  const uploadedRanges: string[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url.includes("storage.example.test")) {
      return sourceResponse({ firstByte: 4, lastByte: 10, totalBytes: 11 });
    }
    const range = String(
      new Headers(init?.headers).get("content-range") || "",
    );
    uploadedRanges.push(range);
    await consumeRequestBody(init);
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": "bytes 0-11/11" },
    });
  }) as typeof fetch;

  const result = await uploadTikTokVideoFromRangeSource({
    source: makeSource(),
    uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=lost-201",
    contentType: "video/mp4",
    totalBytes: 11,
    chunkSize: 4,
    totalChunkCount: 2,
    initialOffset: 4,
    fetchImpl,
  });

  assert.equal(result.nextOffset, 11);
  assert.equal(result.responses[0]?.recoveredFromAlreadyUploadedChunk, true);
  assert.deepEqual(uploadedRanges, ["bytes 4-10/11"]);
});

test("publish-now ne matérialise plus la vidéo TikTok et cron réinjecte le checkpoint", async () => {
  const publishNow = await readFile(
    new URL("../../app/api/booster/publish-now/route.ts", import.meta.url),
    "utf8",
  );
  const cron = await readFile(
    new URL("../../app/api/cron/booster-publications/route.ts", import.meta.url),
    "utf8",
  );
  const sourceResolver = publishNow.slice(
    publishNow.indexOf("function getTikTokStorageContentType"),
    publishNow.indexOf("async function getTiktokAccessToken"),
  );
  const tiktokBranchAt = publishNow.indexOf('if (ch === "tiktok")');
  const publishBranch = publishNow.slice(
    tiktokBranchAt,
    publishNow.indexOf('if (ch === "pinterest")', tiktokBranchAt),
  );
  assert.doesNotMatch(
    `${sourceResolver}\n${publishBranch}`,
    /\.download\(|\.arrayBuffer\(|\bBuffer\b/,
  );
  assert.match(publishNow, /probeTikTokRangeSource/);
  assert.match(publishNow, /persistTikTokUploadCheckpoint/);
  assert.match(publishNow, /_tiktokUploadCheckpoint/);
  assert.match(cron, /tiktokUploadCheckpoint/);
  assert.match(cron, /_tiktokUploadCheckpoint/);
});
