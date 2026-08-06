import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");

test("a ready current canonical remains publishable when optional AI derivatives fail", () => {
  const worker = read("lib/mediaVideoNormalizationWorker.ts");
  const preparation = read("lib/mediaWorkspacePublicationPreparation.ts");
  const workspaceStatus = read("lib/mediaWorkspaceServer.ts");
  const consumption = read("lib/mediaWorkspaceConsumption.ts");

  assert.match(
    worker,
    /signature", getVideoNormalizationSignature\("canonical"\)/,
  );
  assert.match(
    worker,
    /publication_status: publicationMasterReady[\s\S]*?\? "ready"/,
  );
  assert.match(
    preparation,
    /getVideoNormalizationSignature\("canonical"\)/,
  );
  assert.match(
    preparation,
    /isTerminalFailure\(item\)[\s\S]*?!refreshedCanonicalMediaIds\.has\(item\.mediaId\)/,
  );
  assert.match(
    workspaceStatus,
    /!\["ready", "legacy_ready"\]\.includes\(status\.publicationStatus\)/,
  );
  assert.match(
    consumption,
    /item\.mediaType === "video"[\s\S]*?\["ready", "legacy_ready"\]\.includes\(item\.publicationStatus\)/,
  );
});

test("heavy-video AI captures never decode the original in the browser", () => {
  const modal = read("app/dashboard/booster/publier/PublishModal.tsx");
  const start = modal.indexOf("hasVideoForGeneration &&", modal.indexOf("let videoFramesForAI"));
  const end = modal.indexOf("setGenerationProgressPhase(", start);
  const localCaptureGuard = modal.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(
    localCaptureGuard,
    /videoFile\.size < BOOSTER_LOCAL_VIDEO_FRAME_PREWARM_MIN_BYTES/,
  );
  assert.doesNotMatch(localCaptureGuard, /!mediaPipelineCutoverEnabled/);
});
