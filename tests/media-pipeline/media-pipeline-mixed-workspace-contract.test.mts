import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

const hook = read(
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
);
const mutations = read(
  "app/dashboard/booster/publier/persistentMediaWorkspaceMutations.ts",
);
const client = read("lib/mediaWorkspaceClient.ts");
const workspaceRoute = read("app/api/media-pipeline/workspace/route.ts");
const uploadIntent = read("app/api/media-pipeline/upload-intent/route.ts");
const preparationPolicy = read("lib/boosterMixedMediaPreparationPolicy.ts");
const rolloutMigration = read(
  "ops/sql/2026-08-05_booster_mixed_media_workspace.sql",
);
const finalizationMigration = read(
  "ops/sql/2026-08-06_booster_mixed_media_position_finalization.sql",
);
const finalVerification = read(
  "ops/sql/2026-08-06_verify_booster_mixed_media_workspace.sql",
);

test("images and video occupy independent slots in one durable workspace", () => {
  assert.match(hook, /getWorkspaceSourcePosition\(mediaType, metadataIndex\)/);
  assert.match(mutations, /family === "video" \? 5 : familyIndex/);
  assert.match(uploadIntent, /mediaType === "image" && workspacePosition > 4/);
  assert.match(uploadIntent, /mediaType === "video" && workspacePosition !== 5/);
  assert.match(rolloutMigration, /check \(position between 0 and 5\)/);
  assert.match(rolloutMigration, /maximum 5 images .* 1 video/i);
});

test("replacing one media family preserves the other family", () => {
  assert.match(client, /mediaType\?: "image" \| "video"/);
  assert.match(workspaceRoute, /last_media_clear_type: requestedMediaType \|\| "all"/);
  assert.match(mutations, /state\.mediaType !== family/);
  assert.match(hook, /replaceWorkspaceMediaFamilyStates/);
  assert.match(hook, /mediaType:\s*undefined/);
});

test("the rollout migration safely bridges old video-only clients", () => {
  assert.match(
    rolloutMigration,
    /count\(\*\) filter \(where media\.media_type = 'image'\)/,
  );
  assert.match(rolloutMigration, /if v_has_video then/);
  assert.match(rolloutMigration, /new\.position not in \(0, 5\)/);
  assert.match(rolloutMigration, /new\.position = 0 and v_existing_image_count > 0/);
  assert.match(rolloutMigration, /v_existing_image_count >= 5/);
  assert.match(
    rolloutMigration,
    /disable trigger publication_workspace_media_validate;[\s\S]*enable trigger publication_workspace_media_validate;/,
  );
});

test("the finalization removes the temporary video position compatibility", () => {
  assert.match(finalizationMigration, /where video_link\.position = 0/);
  assert.match(finalizationMigration, /media\.media_type = 'video'[\s\S]*wm\.position = 0/);
  assert.match(finalizationMigration, /if new\.position <> 5 then/);
  assert.match(finalizationMigration, /INRCY_MEDIA_VIDEO_POSITION_MUST_BE_FIVE/);
  assert.doesNotMatch(finalizationMigration, /new\.position not in \(0, 5\)/);
  assert.match(finalizationMigration, /INRCY_MEDIA_FINALIZATION_INCOMPLETE/);
  assert.match(finalVerification, /new\.position <> 5/);
  assert.match(finalVerification, /not like '%new\.position not in \(0, 5\)%'/);
});

test("the preparation policy no longer exports an unused media mode type", () => {
  assert.doesNotMatch(preparationPolicy, /export type BoosterChannelMediaMode/);
  assert.match(preparationPolicy, /resolveChannelDispatchMediaType/);
});
