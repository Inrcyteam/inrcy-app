import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

import {
  getVideoNormalizationSignature,
  type VideoNormalizationVariantKey,
} from "../../lib/mediaVideoNormalizationPolicy.ts";

const source = readFileSync(
  resolve(process.cwd(), "lib/mediaWorkspaceConsumption.ts"),
  "utf8",
);
const helperSource = source.match(
  /function pickReadyVideoNormalizationVariant\([\s\S]*?^\}/m,
)?.[0];

assert.ok(helperSource, "video variant selector not found");
const executableHelper = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.None,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const pickReadyVideoNormalizationVariant = new Function(
  "getVideoNormalizationSignature",
  executableHelper + "\nreturn pickReadyVideoNormalizationVariant;",
)(getVideoNormalizationSignature) as (
  variants: Array<Record<string, unknown>>,
  mediaId: string,
  key: VideoNormalizationVariantKey,
) => Record<string, unknown> | undefined;

function candidate(params: {
  id: string;
  signature: string;
  storagePath: string;
  status?: "ready" | "pending";
}) {
  return {
    id: params.id,
    mediaId: "video-1",
    purpose: "canonical",
    signature: params.signature,
    storagePath: params.storagePath,
    status: params.status || "ready",
  };
}

test("a ready v1 canonical is rejected while the expected v2 output is pending", () => {
  const v1Ready = candidate({
    id: "canonical-v1-ready",
    signature: "inrcy:video:canonical:v1",
    storagePath: "normalized/video/v1/canonical.mp4",
  });
  const v2Pending = candidate({
    id: "canonical-v2-pending",
    signature: getVideoNormalizationSignature("canonical"),
    storagePath: "normalized/video/v2/canonical.pending.mp4",
    status: "pending",
  });
  // readWorkspaceGraph applique déjà status=ready avant le sélecteur.
  const readyGraphVariants = [v1Ready, v2Pending].filter(
    (variant) => variant.status === "ready",
  );

  assert.equal(
    pickReadyVideoNormalizationVariant(
      readyGraphVariants,
      "video-1",
      "canonical",
    ),
    undefined,
  );
});

test("the exact ready v2 canonical, thumbnail and frames win over ready v1 rows", () => {
  const keys = [
    "canonical",
    "ai_preview",
    "thumbnail",
    "frame_01",
    "frame_02",
    "frame_03",
    "audio_track",
  ] as const;

  for (const key of keys) {
    const readyV1 = candidate({
      id: key + "-v1-ready",
      signature: getVideoNormalizationSignature(key).replace(/:v2$/, ":v1"),
      storagePath: "normalized/video/v1/" + key,
    });
    const readyV2 = candidate({
      id: key + "-v2-ready",
      signature: getVideoNormalizationSignature(key),
      storagePath: "normalized/video/v2/" + key,
    });

    assert.equal(
      pickReadyVideoNormalizationVariant(
        [readyV1, readyV2],
        "video-1",
        key,
      )?.id,
      readyV2.id,
    );
  }
});

test("v1 AI preview and audio are rejected until their exact v2 outputs are ready", () => {
  for (const key of ["ai_preview", "audio_track"] as const) {
    const readyV1 = candidate({
      id: key + "-v1-ready",
      signature: getVideoNormalizationSignature(key).replace(/:v2$/, ":v1"),
      storagePath: "normalized/video/v1/" + key,
    });
    const pendingV2 = candidate({
      id: key + "-v2-pending",
      signature: getVideoNormalizationSignature(key),
      storagePath: "normalized/video/v2/" + key + ".pending",
      status: "pending",
    });
    const readyGraphVariants = [readyV1, pendingV2].filter(
      (variant) => variant.status === "ready",
    );
    assert.equal(
      pickReadyVideoNormalizationVariant(
        readyGraphVariants,
        "video-1",
        key,
      ),
      undefined,
    );

    const readyV2 = candidate({
      id: key + "-v2-ready",
      signature: getVideoNormalizationSignature(key),
      storagePath: "normalized/video/v2/" + key,
    });
    assert.equal(
      pickReadyVideoNormalizationVariant(
        [readyV1, readyV2],
        "video-1",
        key,
      )?.id,
      readyV2.id,
    );
  }
});

test("publication and AI consumption use the strict selector for managed video outputs", () => {
  const publicationStart = source.indexOf(
    "export async function resolveWorkspacePublicationConsumption",
  );
  const aiStart = source.indexOf(
    "async function resolveWorkspaceAiVideoFamily",
    publicationStart,
  );
  const aiEnd = source.indexOf(
    "export async function syncPublicationWorkspaceContext",
    aiStart,
  );
  assert.ok(publicationStart >= 0 && aiStart > publicationStart && aiEnd > aiStart);

  const publication = source.slice(publicationStart, aiStart);
  const aiVideo = source.slice(aiStart, aiEnd);
  assert.match(
    publication,
    /pickReadyVideoNormalizationVariant\(\s*variants,\s*item\.mediaId,\s*"canonical"/,
  );
  assert.match(
    publication,
    /pickReadyVideoNormalizationVariant\(\s*variants,\s*item\.mediaId,\s*"thumbnail"/,
  );
  assert.match(aiVideo, /\["frame_01", "frame_02", "frame_03"\] as const/);
  assert.match(
    aiVideo,
    /pickReadyVideoNormalizationVariant\(\s*params\.variants,\s*item\.mediaId,\s*key/,
  );
  assert.match(
    aiVideo,
    /pickReadyVideoNormalizationVariant\(\s*params\.variants,\s*item\.mediaId,\s*"thumbnail"/,
  );
  assert.match(
    aiVideo,
    /const aiPreview = pickReadyVideoNormalizationVariant\(\s*params\.variants,\s*item\.mediaId,\s*"ai_preview"/,
  );
  assert.match(aiVideo, /\.\.\.\(aiPreview \? \[aiPreview\] : \[\]\)/);
  assert.match(
    aiVideo,
    /const audioVariant = pickReadyVideoNormalizationVariant\(\s*params\.variants,\s*item\.mediaId,\s*"audio_track"/,
  );
  assert.doesNotMatch(
    aiVideo,
    /pick(?:All)?ReadyVariants?\([^)]*"(?:ai_preview|audio_track)"/,
  );
});
