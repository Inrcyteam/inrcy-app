import assert from "node:assert/strict";
import test from "node:test";

import { buildBoosterGenerationRequest } from "../../lib/boosterGenerationTransportClient.ts";
import { readBoosterGenerationRequest } from "../../lib/boosterGenerationRequestTransport.ts";

const tinyJpegDataUrl =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==";

function buildPayload() {
  return {
    idea: "Présenter une réalisation",
    mediaType: "video",
    useImagesForAI: true,
    imagesForAI: [
      {
        name: "photo.jpg",
        type: "image/jpeg",
        dataUrl: tinyJpegDataUrl,
      },
    ],
    videoForAI: {
      name: "video.mp4",
      type: "video/mp4",
      visualFrames: [
        {
          name: "frame-middle.jpg",
          type: "image/jpeg",
          dataUrl: tinyJpegDataUrl,
          frameTarget: "middle",
          timeSeconds: 4.2,
        },
      ],
      analysisPlan: {
        visualFrames: "ready",
        audioTranscript: "unavailable",
      },
    },
  };
}

test("les médias sont envoyés en multipart sans Base64 dans les métadonnées", async () => {
  const request = buildBoosterGenerationRequest(buildPayload());
  assert.equal(request.transport, "multipart");
  assert.ok(request.body instanceof FormData);
  assert.equal(request.headers, undefined);

  const formData = request.body as FormData;
  const metadata = String(formData.get("payload") || "");
  assert.ok(metadata.includes('"idea":"Présenter une réalisation"'));
  assert.ok(!metadata.includes("data:image/jpeg;base64"));
  assert.ok(formData.get("aiImage0") instanceof Blob);
  assert.ok(formData.get("videoFrame0") instanceof Blob);
});

test("le serveur reconstruit exactement les mêmes data URLs et métadonnées", async () => {
  const clientRequest = buildBoosterGenerationRequest(buildPayload());
  assert.equal(clientRequest.transport, "multipart");

  const serverRequest = new Request("http://localhost/api/booster/generate", {
    method: "POST",
    body: clientRequest.body,
  });
  const parsed = await readBoosterGenerationRequest(serverRequest);

  assert.equal(parsed.transport, "multipart");
  assert.equal(parsed.body.imagesForAI?.[0]?.dataUrl, tinyJpegDataUrl);
  assert.equal(
    parsed.body.videoForAI?.visualFrames?.[0]?.dataUrl,
    tinyJpegDataUrl,
  );
  assert.equal(
    parsed.body.videoForAI?.visualFrames?.[0]?.frameTarget,
    "middle",
  );
  assert.equal(parsed.body.videoForAI?.visualFrames?.[0]?.timeSeconds, 4.2);
});

test("le JSON Base64 historique reste disponible comme fallback", () => {
  const invalidPayload = buildPayload();
  invalidPayload.imagesForAI[0].dataUrl = "image-invalide";

  const request = buildBoosterGenerationRequest(invalidPayload);
  assert.equal(request.transport, "json");
  assert.deepEqual(request.headers, { "Content-Type": "application/json" });
  assert.match(String(request.body), /image-invalide/);
});

test("une requête JSON historique reste acceptée côté serveur", async () => {
  const payload = buildPayload();
  const request = new Request("http://localhost/api/booster/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const parsed = await readBoosterGenerationRequest(request);
  assert.equal(parsed.transport, "json");
  assert.equal(parsed.body.imagesForAI?.[0]?.dataUrl, tinyJpegDataUrl);
});
