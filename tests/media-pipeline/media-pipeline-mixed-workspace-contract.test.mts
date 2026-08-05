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
const migration = read(
  "ops/sql/2026-08-05_booster_mixed_media_workspace.sql",
);

test("images and video occupy independent slots in one durable workspace", () => {
  assert.match(hook, /getWorkspaceSourcePosition\(mediaType, metadataIndex\)/);
  assert.match(mutations, /family === "video" \? 5 : familyIndex/);
  assert.match(uploadIntent, /mediaType === "image" && workspacePosition > 4/);
  assert.match(uploadIntent, /mediaType === "video" && workspacePosition !== 5/);
  assert.match(migration, /check \(position between 0 and 5\)/);
  assert.match(migration, /maximum 5 images .* 1 video/i);
});

test("replacing one media family preserves the other family", () => {
  assert.match(client, /mediaType\?: "image" \| "video"/);
  assert.match(workspaceRoute, /last_media_clear_type: requestedMediaType \|\| "all"/);
  assert.match(mutations, /state\.mediaType !== family/);
  assert.match(hook, /replaceWorkspaceMediaFamilyStates/);
  assert.match(hook, /mediaType:\s*undefined/);
});

test("the database trigger accepts five images plus one video, never two videos", () => {
  assert.match(
    migration,
    /count\(\*\) filter \(where media\.media_type = 'image'\)/,
  );
  assert.match(migration, /if v_has_video then/);
  assert.match(migration, /new\.position not in \(0, 5\)/);
  assert.match(migration, /new\.position = 0 and v_existing_image_count > 0/);
  assert.match(migration, /v_existing_image_count >= 5/);
  assert.match(
    migration,
    /disable trigger publication_workspace_media_validate;[\s\S]*enable trigger publication_workspace_media_validate;/,
  );
});
