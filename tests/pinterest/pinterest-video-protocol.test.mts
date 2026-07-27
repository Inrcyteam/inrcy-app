import assert from "node:assert/strict";
import test from "node:test";
import { publishPinterestVideoWithProtocol } from "../../lib/pinterestVideoProtocol.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("Pinterest Video Pin suit register, upload, poll puis create", async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  let mediaReads = 0;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || "GET");
    calls.push({ url, method, body: init?.body || null });

    if (url === "https://api.pinterest.com/v5/media" && method === "POST") {
      return jsonResponse({
        media_id: "media-123",
        upload_url: "https://upload.example.test/",
        upload_parameters: {
          key: "uploads/media-123",
          policy: "policy-value",
          "x-amz-signature": "signature-value",
        },
      });
    }

    if (url === "https://upload.example.test/" && method === "POST") {
      assert.ok(init?.body instanceof FormData);
      const form = init.body as FormData;
      assert.equal(form.get("key"), "uploads/media-123");
      assert.equal(form.get("policy"), "policy-value");
      assert.ok(form.get("file") instanceof Blob);
      return new Response(null, { status: 204 });
    }

    if (
      url === "https://api.pinterest.com/v5/media/media-123" &&
      method === "GET"
    ) {
      mediaReads += 1;
      return jsonResponse({ status: mediaReads === 1 ? "processing" : "succeeded" });
    }

    if (url === "https://api.pinterest.com/v5/pins" && method === "POST") {
      const payload = JSON.parse(String(init?.body || "{}"));
      assert.equal(payload.board_id, "board-123");
      assert.equal(payload.media_source.source_type, "video_id");
      assert.equal(payload.media_source.media_id, "media-123");
      assert.equal(
        payload.media_source.cover_image_url,
        "https://cdn.example.test/cover.jpg",
      );
      return jsonResponse({ id: "pin-123", board_id: "board-123" }, 201);
    }

    return jsonResponse({ message: `Unexpected call ${method} ${url}` }, 500);
  }) as typeof fetch;

  const result = await publishPinterestVideoWithProtocol({
    apiBaseUrl: "https://api.pinterest.com",
    accessToken: "token-test",
    boardId: "board-123",
    title: "Une vidéo iNrCy",
    description: "Description",
    link: "https://app.inrcy.com",
    coverImageUrl: "https://cdn.example.test/cover.jpg",
    videoBytes: new Uint8Array([0, 1, 2, 3]),
    videoContentType: "video/mp4",
    videoFileName: "video.mp4",
    fetchImpl,
    wait: async () => undefined,
    maxPollAttempts: 3,
  });

  assert.equal(result.mediaId, "media-123");
  assert.equal(result.mediaStatus, "succeeded");
  assert.equal(result.pin.id, "pin-123");
  assert.equal(mediaReads, 2);
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url}`),
    [
      "POST https://api.pinterest.com/v5/media",
      "POST https://upload.example.test/",
      "GET https://api.pinterest.com/v5/media/media-123",
      "GET https://api.pinterest.com/v5/media/media-123",
      "POST https://api.pinterest.com/v5/pins",
    ],
  );
});

test("Pinterest Video Pin stoppe la création si le média échoue", async () => {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || "GET");
    if (url.endsWith("/v5/media") && method === "POST") {
      return jsonResponse({
        media_id: "media-failed",
        upload_url: "https://upload.example.test/",
        upload_parameters: { key: "uploads/media-failed" },
      });
    }
    if (url === "https://upload.example.test/" && method === "POST") {
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/v5/media/media-failed") && method === "GET") {
      return jsonResponse({ status: "failed", message: "Format refusé" });
    }
    return jsonResponse({ id: "should-not-exist" }, 201);
  }) as typeof fetch;

  await assert.rejects(
    () =>
      publishPinterestVideoWithProtocol({
        apiBaseUrl: "https://api.pinterest.com",
        accessToken: "token-test",
        boardId: "board-123",
        title: "Une vidéo iNrCy",
        coverImageUrl: "https://cdn.example.test/cover.jpg",
        videoBytes: new Uint8Array([0, 1, 2, 3]),
        videoContentType: "video/mp4",
        videoFileName: "video.mp4",
        fetchImpl,
        wait: async () => undefined,
        maxPollAttempts: 2,
      }),
    /Format refusé/,
  );
});
