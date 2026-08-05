import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

type UnknownRecord = Record<string, unknown>;
type PhaseResult = UnknownRecord & {
  ok: boolean;
  outcome: string;
  checkpoint?: UnknownRecord;
  videoId?: string;
  retryable?: boolean;
};
type PhaseFunction = (
  input: UnknownRecord,
  dependencies?: UnknownRecord,
) => Promise<PhaseResult>;

const source = readFileSync(
  new URL("../../lib/youtubeShortsPublish.ts", import.meta.url),
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
new Function("module", "exports", "require", transpiled)(
  moduleRecord,
  moduleRecord.exports,
  (specifier: string) => {
    if (specifier === "server-only") return {};
    if (specifier === "@/lib/tsSafe") {
      return {
        asRecord: (value: unknown) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as UnknownRecord)
            : {},
        asString: (value: unknown) =>
          typeof value === "string" ? value : null,
      };
    }
    return requireFromTest(specifier);
  },
);

const createCheckpoint = moduleRecord.exports
  .createYoutubeResumableUploadCheckpoint as PhaseFunction;
const resumeCheckpoint = moduleRecord.exports
  .resumeYoutubeResumableUploadCheckpoint as PhaseFunction;
const parseCheckpoint = moduleRecord.exports
  .parseYoutubeResumableUploadCheckpoint as (
  value: unknown,
) => UnknownRecord | null;

const chunkSize = 256 * 1024;
const totalBytes = chunkSize * 3;
const sourceUrl = "https://storage.test/youtube-durable.mp4";
const sessionUrl =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=durable-1";

function input(overrides: UnknownRecord = {}) {
  return {
    accessToken: "youtube-token",
    videoUrl: sourceUrl,
    title: "Publication durable",
    description: "Upload resumable",
    privacyStatus: "public",
    publicationType: "short",
    mimeType: "video/mp4",
    ...overrides,
  };
}

function header(init: RequestInit | undefined, name: string) {
  return new Headers(init?.headers).get(name) || "";
}

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function sourceRange(firstByte: number, lastByte: number) {
  return new Response(Uint8Array.of(1), {
    status: 206,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(lastByte - firstByte + 1),
      "Content-Range": `bytes ${firstByte}-${lastByte}/${totalBytes}`,
    },
  });
}

function durable(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as UnknownRecord;
}

test("create -> checkpoints -> polls -> publish survives JSON restarts on one session", async () => {
  let acceptedOffset = 0;
  let createCalls = 0;
  let statusCalls = 0;
  const uploadedStarts: number[] = [];
  const fetchImpl = (async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request);
    const method = init?.method || "GET";
    if (url === sourceUrl && method === "HEAD") {
      return new Response(null, {
        headers: {
          "Content-Length": String(totalBytes),
          "Content-Type": "video/mp4",
        },
      });
    }
    if (url === sourceUrl && header(init, "Range") === "bytes=0-0") {
      return sourceRange(0, 0);
    }
    if (url === sourceUrl && method === "GET") {
      const match = header(init, "Range").match(/^bytes=(\d+)-(\d+)$/);
      assert.ok(match);
      return sourceRange(Number(match[1]), Number(match[2]));
    }
    if (url.includes("uploadType=resumable") && method === "POST") {
      createCalls += 1;
      return new Response(null, { status: 200, headers: { Location: sessionUrl } });
    }
    if (url === sessionUrl && header(init, "Content-Range") === `bytes */${totalBytes}`) {
      statusCalls += 1;
      return new Response(null, {
        status: 308,
        headers: acceptedOffset
          ? { Range: `bytes=0-${acceptedOffset - 1}` }
          : {},
      });
    }
    if (url === sessionUrl && method === "PUT") {
      const match = header(init, "Content-Range").match(
        /^bytes (\d+)-(\d+)\/(\d+)$/,
      );
      assert.ok(match);
      const firstByte = Number(match[1]);
      const lastByte = Number(match[2]);
      assert.equal(firstByte, acceptedOffset);
      uploadedStarts.push(firstByte);
      acceptedOffset = lastByte + 1;
      return acceptedOffset === totalBytes
        ? json({ id: "youtube-video-durable" }, 201)
        : new Response(null, {
            status: 308,
            headers: { Range: `bytes=0-${acceptedOffset - 1}` },
          });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  }) as typeof fetch;
  const dependencies = {
    fetchImpl,
    chunkSizeBytes: chunkSize,
    now: () => new Date("2026-08-05T12:00:00.000Z"),
  };

  const created = await createCheckpoint(input(), dependencies);
  assert.equal(created.ok, true);
  assert.equal(created.outcome, "checkpoint");
  assert.equal(created.checkpoint?.offset, 0);
  assert.equal(createCalls, 1);

  let checkpoint = durable(created.checkpoint);
  let result: PhaseResult | null = null;
  for (let turn = 0; turn < 3; turn += 1) {
    result = await resumeCheckpoint(
      { ...input(), checkpoint },
      dependencies,
    );
    assert.equal(result.ok, true);
    checkpoint = durable(result.checkpoint);
  }
  assert.equal(result?.outcome, "published");
  assert.equal(result?.videoId, "youtube-video-durable");
  assert.equal(createCalls, 1, "resume never creates a second video session");
  assert.equal(statusCalls, 3, "every restart asks YouTube for its offset first");
  assert.deepEqual(uploadedStarts, [0, chunkSize, chunkSize * 2]);

  const replay = await resumeCheckpoint(
    { ...input(), checkpoint },
    dependencies,
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.outcome, "published");
  assert.deepEqual(uploadedStarts, [0, chunkSize, chunkSize * 2]);
});

test("an interrupted acknowledged chunk resumes from provider offset, never local offset", async () => {
  let acceptedOffset = 0;
  let uploadCalls = 0;
  const uploadedStarts: number[] = [];
  const fetchImpl = (async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request);
    const method = init?.method || "GET";
    if (url === sourceUrl && method === "HEAD") {
      return new Response(null, {
        headers: { "Content-Length": String(totalBytes), "Content-Type": "video/mp4" },
      });
    }
    if (url === sourceUrl && header(init, "Range") === "bytes=0-0") {
      return sourceRange(0, 0);
    }
    if (url === sourceUrl && method === "GET") {
      const match = header(init, "Range").match(/^bytes=(\d+)-(\d+)$/);
      assert.ok(match);
      return sourceRange(Number(match[1]), Number(match[2]));
    }
    if (url.includes("uploadType=resumable") && method === "POST") {
      return new Response(null, { headers: { Location: sessionUrl } });
    }
    if (url === sessionUrl && header(init, "Content-Range").startsWith("bytes */")) {
      return new Response(null, {
        status: 308,
        headers: acceptedOffset ? { Range: `bytes=0-${acceptedOffset - 1}` } : {},
      });
    }
    if (url === sessionUrl && method === "PUT") {
      const match = header(init, "Content-Range").match(/^bytes (\d+)-(\d+)\//);
      assert.ok(match);
      const firstByte = Number(match[1]);
      const lastByte = Number(match[2]);
      uploadedStarts.push(firstByte);
      uploadCalls += 1;
      acceptedOffset = lastByte + 1;
      if (uploadCalls === 1) throw new Error("response lost after accept");
      return acceptedOffset === totalBytes
        ? json({ id: "youtube-video-resumed" }, 201)
        : new Response(null, {
            status: 308,
            headers: { Range: `bytes=0-${acceptedOffset - 1}` },
          });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  }) as typeof fetch;
  const dependencies = { fetchImpl, chunkSizeBytes: chunkSize };
  const created = await createCheckpoint(input(), dependencies);
  const interrupted = await resumeCheckpoint(
    { ...input(), checkpoint: created.checkpoint },
    dependencies,
  );
  assert.equal(interrupted.ok, false);
  assert.equal(interrupted.retryable, true);
  assert.equal(interrupted.checkpoint?.offset, 0);

  const resumed = await resumeCheckpoint(
    { ...input(), checkpoint: durable(interrupted.checkpoint) },
    dependencies,
  );
  assert.equal(resumed.ok, true);
  assert.equal(resumed.checkpoint?.offset, chunkSize * 2);
  assert.deepEqual(uploadedStarts, [0, chunkSize]);
});

test("a lost final response is recovered as published without a second final PUT", async () => {
  const oneChunkTotal = chunkSize;
  const oneChunkSource = "https://storage.test/youtube-final.mp4";
  let completed = false;
  let uploadCalls = 0;
  const fetchImpl = (async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request);
    const method = init?.method || "GET";
    if (url === oneChunkSource && method === "HEAD") {
      return new Response(null, {
        headers: { "Content-Length": String(oneChunkTotal), "Content-Type": "video/mp4" },
      });
    }
    if (url === oneChunkSource && header(init, "Range") === "bytes=0-0") {
      return new Response(Uint8Array.of(1), {
        status: 206,
        headers: {
          "Content-Length": "1",
          "Content-Range": `bytes 0-0/${oneChunkTotal}`,
          "Content-Type": "video/mp4",
        },
      });
    }
    if (url === oneChunkSource && method === "GET") {
      return new Response(Uint8Array.of(1), {
        status: 206,
        headers: {
          "Content-Length": String(oneChunkTotal),
          "Content-Range": `bytes 0-${oneChunkTotal - 1}/${oneChunkTotal}`,
          "Content-Type": "video/mp4",
        },
      });
    }
    if (url.includes("uploadType=resumable") && method === "POST") {
      return new Response(null, { headers: { Location: sessionUrl } });
    }
    if (url === sessionUrl && header(init, "Content-Range").startsWith("bytes */")) {
      return completed
        ? json({ id: "youtube-final-id" }, 201)
        : new Response(null, { status: 308 });
    }
    if (url === sessionUrl && method === "PUT") {
      uploadCalls += 1;
      completed = true;
      throw new Error("final response lost");
    }
    throw new Error(`Unexpected ${method} ${url}`);
  }) as typeof fetch;
  const phaseInput = input({ videoUrl: oneChunkSource });
  const created = await createCheckpoint(phaseInput, {
    fetchImpl,
    chunkSizeBytes: chunkSize,
  });
  const ambiguous = await resumeCheckpoint(
    { ...phaseInput, checkpoint: created.checkpoint },
    { fetchImpl, chunkSizeBytes: chunkSize },
  );
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.retryable, true);

  const recovered = await resumeCheckpoint(
    { ...phaseInput, checkpoint: durable(ambiguous.checkpoint) },
    { fetchImpl, chunkSizeBytes: chunkSize },
  );
  assert.equal(recovered.ok, true);
  assert.equal(recovered.outcome, "published");
  assert.equal(recovered.videoId, "youtube-final-id");
  assert.equal(uploadCalls, 1);
});

test("invalid or mismatched checkpoints fail closed before any HTTP request", async () => {
  let fetches = 0;
  const invalid = await resumeCheckpoint(
    { ...input(), checkpoint: { sessionUrl } },
    { fetchImpl: (async () => { fetches += 1; return json({}); }) as typeof fetch },
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.outcome, "ambiguous");
  assert.equal(fetches, 0);

  const valid = await createCheckpoint(input(), {
    chunkSizeBytes: chunkSize,
    fetchImpl: (async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url === sourceUrl && (init?.method || "GET") === "HEAD") {
        return new Response(null, { headers: { "Content-Length": String(totalBytes) } });
      }
      if (url === sourceUrl) return sourceRange(0, 0);
      return new Response(null, { headers: { Location: sessionUrl } });
    }) as typeof fetch,
  });
  const mismatched = await resumeCheckpoint(
    { ...input({ title: "Autre publication" }), checkpoint: valid.checkpoint },
    { fetchImpl: (async () => { fetches += 1; return json({}); }) as typeof fetch },
  );
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.outcome, "ambiguous");
  assert.equal(fetches, 0);
  assert.equal(parseCheckpoint({ ...valid.checkpoint, offset: -1 }), null);
});

test("durable implementation remains streamed and has no full-file buffer", () => {
  assert.doesNotMatch(source, /\.arrayBuffer\(|\.blob\(|new Blob\(/);
  assert.match(source, /sourceResponse\.body as unknown as BodyInit/);
  assert.match(source, /Content-Range": `bytes \*\/\$\{params\.total\}`/);
  assert.match(source, /state: "upload_unknown"/);
});
